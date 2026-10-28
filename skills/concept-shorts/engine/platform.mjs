// 운영체제마다 다른 곳 — 맥은 원래 하던 그대로 돌려주고, Windows(win32)만 따로 푼다. 여러 파일(shorts·shorts-qa·setup·시험)이 이 함수들을 같이 쓴다
// 플랫폼·환경을 인자로 받아 맥에서도 Windows 쪽을 시험한다(platform.test.mjs)
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'

export const WIN = process.platform === 'win32'
const pathOf = env => Object.entries(env).find(([k]) => k.toUpperCase() === 'PATH')?.[1] ?? '' // Windows 는 'Path' 로 온다

// PATH 에 있는지만 본다(setup.sh 의 command -v 와 같게) — Windows 는 .exe
export const onPath = (cmd, { platform = process.platform, env = process.env, exists = existsSync } = {}) => {
  const p = platform === 'win32' ? win32 : posix
  return pathOf(env).split(platform === 'win32' ? ';' : ':').some(d => d && exists(p.join(d, platform === 'win32' ? `${cmd}.exe` : cmd)))
}
// 쇼츠 한 편에 꼭 있어야 하는 도구 — 대본(Claude 사용량)을 쓰기 전에 본다. 빠진 게 있으면 깔 명령을 담은 글, 다 있으면 ''
export function missingTools(opts = {}) {
  const win = (opts.platform ?? process.platform) === 'win32'
  return ['ffmpeg', 'ffprobe'].every(c => onPath(c, opts)) ? ''
    : `ffmpeg(ffprobe)가 없어 영상을 만들 수 없습니다 — ${win ? '터미널에서 winget install Gyan.FFmpeg' : 'brew install ffmpeg'} 로 깐 뒤 다시 시도하세요`
}

// PATH 의 명령을 shell 없이 부를 꼴 [실행 파일, 앞에 붙일 인자]. 맥은 이름 그대로
// Windows: .exe 가 있으면 그것. npm 으로 깐 명령은 .cmd 라 shell 없이는 spawn 이 안 되고(EINVAL), cmd.exe 를 거치면 긴 글·따옴표 인자가 깨진다
// — .cmd 안의 "%dp0%\...\cli.js"(예전 판 "%~dp0\...", npm.cmd 는 SET "...=%~dp0\...\npm-cli.js")를 읽어 node 로 바로 돌린다
export function which(name, { platform = process.platform, env = process.env, exists = existsSync, read = f => readFileSync(f, 'utf8'), node = process.execPath } = {}) {
  if (platform !== 'win32') return [name, []]
  for (const dir of pathOf(env).split(';').filter(Boolean)) {
    const exe = win32.join(dir, `${name}.exe`)
    if (exists(exe)) return [exe, []]
    const cmd = win32.join(dir, `${name}.cmd`)
    if (!exists(cmd)) continue
    // 마지막 것을 고른다 — 앞쪽은 node.exe·npm-prefix.js 같은 준비 줄이다
    const target = [...read(cmd).matchAll(/%~?dp0%?\\([^"%]+?\.(?:[cm]?js|exe))"/gi)].map(m => m[1]).filter(t => !/^node\.exe$/i.test(t)).at(-1)
    if (!target) continue
    const file = win32.join(dir, target)
    return /\.exe$/i.test(file) ? [file, []] : [node, [file]]
  }
  return [name, []] // 못 찾으면 이름 그대로 — spawn 이 ENOENT 로 알린다
}

// 녹화·품질 검사에 쓰는 Chrome — 맥은 /Applications 고정. Windows 는 깔리는 세 곳(모든 사용자·32비트·이 사용자만) 중 있는 것, 없으면 null
export function chromePath({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  if (platform !== 'win32') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'].map(k => env[k]).filter(Boolean)
    .map(d => win32.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')).find(f => exists(f)) ?? null
}

// 받아쓰기 venv 의 python — venv 는 맥이 bin/python, Windows 가 Scripts\python.exe
export const whisperPython = ({ platform = process.platform, home = homedir() } = {}) =>
  platform === 'win32' ? win32.join(home, '.cache', 'concept-shorts', 'venv', 'Scripts', 'python.exe') : posix.join(home, '.cache/concept-shorts/venv/bin/python')

// 말 속도 — say -r 은 분당 단어 수, SAPI Rate 는 -10~10 정수(0 이 그 음성의 보통 속도, +10 이 3배·-10 이 1/3배인 로그 눈금)
// say 의 보통 속도를 175로 보고(맥 음성 대부분의 기본값) 같은 배율로 옮긴다: 185 → 0.5 → 1
// ponytail: 배율만 옮긴다. Yuna·Heami 의 보통 속도가 다르면(Heami 는 재 보지 못했다) SHORTS_SAPI_RATE 로 직접 준다
export const sapiRate = wpm => Math.max(-10, Math.min(10, Math.round(10 * Math.log(wpm / 175) / Math.log(3))))

// Windows 음성 — PowerShell 의 System.Speech 로 wav. 이름이 SHORTS_TTS_VOICE 로 시작하는 첫 음성('Microsoft Heami' → 'Microsoft Heami Desktop')
// 글·경로는 환경 변수로 넘긴다 — 명령줄을 거치면 따옴표·줄바꿈이 깨지고, Windows 환경 변수는 유니코드라 한글이 그대로 간다
const PS_SPEAK = `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Name -like "$env:SHORTS_TTS_VOICE*" } | Select-Object -First 1
if (-not $v) { [Console]::Error.WriteLine("voice not found: $env:SHORTS_TTS_VOICE"); exit 2 }
$s.SelectVoice($v.Name)
$s.Rate = [int]$env:SHORTS_TTS_RATE
$s.SetOutputToWaveFile($env:SHORTS_TTS_OUT)
$s.Speak($env:SHORTS_TTS_TEXT)
$s.Dispose()`
// 설치된 음성 이름을 한 줄씩 — setup 이 Heami 가 있는지 본다
const PS_VOICES = `Add-Type -AssemblyName System.Speech
(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }`
// -EncodedCommand(UTF-16LE base64) — 스크립트의 따옴표·$ 가 명령줄에서 풀리지 않게
export const powershell = script => ['powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]]
export const listVoicesCmd = () => powershell(PS_VOICES)
export const DEFAULT_VOICE = WIN ? 'Microsoft Heami' : 'Yuna'
export const AUDIO_EXT = WIN ? 'wav' : 'aiff'

// 음성 한 파일 만들 명령 { cmd, args, env? } — 맥은 say(.aiff), Windows 는 위 PowerShell(.wav). env 는 더해 줄 환경 변수
export function speechCmd(text, out, { voice, rate, sapi, platform = process.platform }) {
  if (platform !== 'win32') return { cmd: 'say', args: ['-v', voice, '-r', rate, '-o', out, text] }
  const [cmd, args] = powershell(PS_SPEAK)
  return { cmd, args, env: { SHORTS_TTS_TEXT: text, SHORTS_TTS_OUT: out, SHORTS_TTS_VOICE: voice, SHORTS_TTS_RATE: String(sapi ?? sapiRate(+rate)) } }
}
