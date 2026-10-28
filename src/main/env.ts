import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter } from 'node:path'

export const WIN = process.platform === 'win32'
// Windows 에 python.org 로 깐 Python 은 python.exe 만 있다(python3.exe 는 스토어로 보내는 빈 껍데기일 때가 많다)
export const PY = WIN ? 'python' : 'python3'

// Finder 로 켠 앱은 셸 PATH 를 모른다. 로그인 셸에서 한 번 읽는다 (실패하면 흔한 위치를 덧붙인다)
export function loginPath(): string {
  if (WIN) return mergePath(winRegistryPath(), process.env.PATH ?? '')
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const out = execFileSync(shell, ['-ilc', 'printf "__INKLINE__%s__INKLINE__" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const m = out.match(/__INKLINE__(.*)__INKLINE__/)
    if (m && m[1]) return m[1]
  } catch {
    // 아래 기본값으로
  }
  return [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', `${homedir()}/.local/bin`, '/usr/bin', '/bin']
    .filter(Boolean)
    .join(delimiter) // Windows 는 ';'
}

// Windows 는 로그인 셸이 없고, 앱은 켜질 때의 PATH 를 물려받는다 — 그 뒤 winget 으로 깐 도구(ffmpeg 등)는 다시 켜기 전까지 안 보였다.
// 시스템 · 사용자 PATH 를 설정에서 새로 읽는다. 한글 사용자 폴더가 깨지지 않게 PowerShell 출력을 UTF-8 로(reg.exe 는 cp949 로 낸다)
function winRegistryPath(): string {
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"],
    { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

// 새로 읽은 것을 앞에, 지금 PATH 를 뒤에 — 대소문자 · 끝 '\' 만 다른 같은 폴더는 한 번만
export function mergePath(fresh: string, cur: string): string {
  const seen = new Set<string>()
  return [...fresh.split(';'), ...cur.split(';')].map(d => d.trim()).filter(d => {
    const k = d.toLowerCase().replace(/\\+$/, '')
    if (!d || seen.has(k)) return false
    seen.add(k)
    return true
  }).join(';')
}
