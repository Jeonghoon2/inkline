// 개념 쇼츠 — 처음 한 번(setup.sh 와 같은 일을 node 로 — Windows 에는 sh 가 없을 수 있다. 맥에서 돌려도 같은 결과)
//   node setup.mjs              확인 + npm install
//   node setup.mjs --whisper    품질 검사의 받아쓰기(faster-whisper)까지 ~/.cache/concept-shorts/venv 에 설치
//   node setup.mjs --no-install 확인·시험만(이미 깔린 node_modules 를 건드리지 않는다)
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromePath, listVoicesCmd, onPath, whisperPython, WIN, which } from './platform.mjs'

const ENGINE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
let fail = 0
const ok = s => console.log(`  ✓ ${s}`)
const no = (s, why) => { console.log(`  ✗ ${s} — ${why}`); fail = 1 }
const warn = (s, why) => console.log(`  ! ${s} — ${why}`)
// shell 없이 부른다 — Windows 의 npm·claude(.cmd)는 which 가 node 로 바로 돌릴 꼴로 바꾼다
const sh = (cmd, a, opts = {}) => { const [bin, pre] = which(cmd); return spawnSync(bin, [...pre, ...a], { cwd: ENGINE, encoding: 'utf8', ...opts }) }
const has = cmd => onPath(cmd)
const install = WIN ? 'winget install' : 'brew install'

if (WIN) {
  ok('Windows')
  const [ps, psArgs] = listVoicesCmd()
  const voices = sh(ps, psArgs).stdout ?? ''
  voices.split(/\r?\n/).some(v => v.startsWith('Microsoft Heami')) ? ok('음성 Heami')
    : no('음성 Heami', '설정 → 시간 및 언어 → 언어 및 지역 → 한국어 → 언어 옵션에서 음성(Speech) 받기. 다른 음성은 SHORTS_VOICE')
} else {
  process.platform === 'darwin' ? ok('macOS') : no('macOS', '음성을 macOS 의 say 로 만든다(다른 OS 는 안 된다)')
  ;/^Yuna /m.test(sh('say', ['-v', '?']).stdout ?? '') ? ok('음성 Yuna') : no('음성 Yuna', '시스템 설정 → 손쉬운 사용 → 읽기 및 말하기 → 시스템 음성 → 음성 관리에서 한국어 Yuna 받기')
}
+process.versions.node.split('.')[0] >= 22 ? ok(`node ${process.version}`) : no('node', `${WIN ? 'winget install OpenJS.NodeJS.LTS' : 'brew install node'} (22 이상 — HyperFrames 가 요구)`)
has('ffmpeg') && has('ffprobe') ? ok('ffmpeg') : no('ffmpeg', `${install} ${WIN ? 'Gyan.FFmpeg (깐 뒤 터미널을 새로 연다)' : 'ffmpeg'}`)
existsSync(chromePath() ?? '') ? ok('Chrome') : no('Chrome', WIN ? '녹화·품질 검사에 깔린 Chrome 을 쓴다 — winget install Google.Chrome' : '녹화·품질 검사에 맥에 깔린 Chrome 을 쓴다')
// API 는 쓰지 않는다 — claude.ai 구독 로그인만 받는다(shorts.mjs 도 매번 다시 확인한다)
let st = null
try { st = JSON.parse(sh('claude', ['auth', 'status']).stdout) } catch { /* 없거나 로그인 전 */ }
if (st?.loggedIn && st.authMethod === 'claude.ai' && st.apiProvider === 'firstParty') ok('Claude Code — claude.ai 구독 로그인')
// 새 대본을 쓸 때만 필요하다 — 받은 대본으로 녹화(--render)·품질 검사는 로그인 없이 된다
else warn('Claude Code — claude.ai 구독 로그인 없음', '새 대본을 쓰려면 Claude Code 를 깔고 `claude` 에서 /login 으로 구독 계정 로그인(API 키·Bedrock·Vertex 는 쓰지 않는다). 받은 대본 녹화는 그대로 된다')
if (fail) { console.log('위 ✗ 를 해결하고 다시 돌린다'); process.exit(1) }

// HyperFrames 는 설치·실행 때 사용 통계를 보내고 AI 스킬을 깔려 한다 — 둘 다 끈다
if (!args.includes('--no-install')) {
  if (sh('npm', ['install', '--no-audit', '--no-fund', '--silent'], { stdio: 'inherit', env: { ...process.env, DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1' } }).status !== 0) process.exit(1)
  ok('playwright·HyperFrames·Remotion (npm install)')
}
const py = whisperPython()
if (args.includes('--whisper')) {
  const V = dirname(dirname(py))
  // Windows 의 python3 는 스토어 바로가기일 때가 있어 python 으로
  if (!existsSync(py) && sh(WIN ? 'python' : 'python3', ['-m', 'venv', V], { stdio: 'inherit' }).status !== 0) process.exit(1)
  if (sh(py, ['-m', 'pip', 'install', '-q', 'faster-whisper'], { stdio: 'inherit' }).status !== 0) process.exit(1)
  ok(`faster-whisper (${V})`)
}
if (spawnSync(process.execPath, ['--test', 'shorts.test.mjs', 'layout.test.mjs'], { cwd: ENGINE, stdio: 'ignore' }).status === 0) ok('대본 검사기·그림 한계 시험')
else { console.log('시험 실패 — node --test shorts.test.mjs layout.test.mjs'); process.exit(1) }
if (!existsSync(py) && !process.env.SHORTS_WHISPER_PY) warn('받아쓰기 없음', `녹화는 되지만 품질 검사는 핵심어를 못 재 "아직 아님"으로 끝난다. node setup.mjs --whisper${WIN ? '' : ' (또는 sh setup.sh --whisper)'}`)
console.log('준비 끝 — SKILL.md 의 "똑같이 나오는지 확인" 부터')
