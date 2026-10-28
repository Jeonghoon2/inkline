import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { join, delimiter, win32 } from 'node:path'
import { execFile } from 'node:child_process'
import { AI_CLIS, RUNNERS, type ToolInfo, type Tools } from '../shared/types.ts'
import { PY, WIN } from './env.ts'

// Windows 는 확장자 없는 이름을 PATHEXT(.EXE · .CMD …) 순서로 찾는다 — npm 이 같이 까는 확장자 없는 sh 껍데기는 Windows 에서 못 돌린다
export function findOnPath(name: string, PATH: string, win = WIN): string | null {
  const exts = win ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : ['']
  for (const dir of PATH.split(win ? ';' : delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const p = join(dir, name + ext)
      try {
        accessSync(p, constants.X_OK)
        if (statSync(p).isFile()) return p
      } catch {
        // 다음 후보
      }
    }
  }
  return null
}

// npm 이 Windows 에 까는 CLI(claude · codex · gemini)는 .cmd 껍데기다. Node 는 .cmd 를 셸 없이 띄우지 못하고(EINVAL),
// cmd.exe 를 거치면 긴 프롬프트 · JSON 인자의 따옴표 · 줄바꿈이 깨진다 — 껍데기가 부르는 파일을 찾아 직접 돌린다
export function cmdShimTarget(text: string, shimPath: string): string | null {
  const m = /"%~?dp0%?\\([^"]+)"\s+%\*/i.exec(text)
  return m ? win32.join(win32.dirname(shimPath), m[1]!) : null
}

// 띄울 명령을 운영체제에 맞춘다 — 맥 · 리눅스는 그대로
export function resolveCommand(cmd: string, args: string[], PATH = process.env.PATH ?? '', win = WIN): [string, string[]] {
  if (!win) return [cmd, args]
  const full = /[\\/]/.test(cmd) ? cmd : findOnPath(cmd, PATH, true) ?? cmd
  if (!/\.(cmd|bat)$/i.test(full)) return [full, args]
  let target: string | null = null
  try { target = cmdShimTarget(readFileSync(full, 'utf8'), full) } catch { /* 못 읽으면 그대로 — 띄울 때 오류로 보인다 */ }
  if (!target) return [full, args]
  if (/\.exe$/i.test(target)) return [target, args]
  return [findOnPath('node', PATH, true) ?? 'node', [target, ...args]]
}

export function firstVersion(out: string): string | null {
  return out.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? null
}

// 종료 코드와 상관없이 돌려준다. 'both' 는 stdout + stderr (java -version 은 stderr 에 쓴다), 'stdout' 은 stdout 만 (JSON 파싱용)
export function runCapture(
  file: string,
  args: string[],
  timeoutMs = 5000,
  streams: 'both' | 'stdout' = 'both'
): Promise<string> {
  const [f, a] = resolveCommand(file, args)
  return new Promise(resolve => {
    execFile(f, a, { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (_err, stdout, stderr) =>
      resolve(streams === 'stdout' ? (stdout ?? '') : `${stdout ?? ''}${stderr ?? ''}`)
    )
  })
}

const VERSION_ARGS: Record<string, string[]> = { java: ['-version'], javac: ['-version'] }

async function detectOne(id: string, PATH: string): Promise<ToolInfo> {
  const path = findOnPath(id === 'python3' ? PY : id, PATH) // Windows 의 Python 은 python.exe
  if (!path) return { id, path: null, version: null }
  return { id, path, version: firstVersion(await runCapture(path, VERSION_ARGS[id] ?? ['--version'])) }
}

export async function detectTools(PATH: string): Promise<Tools> {
  const [ai, runners] = await Promise.all([
    Promise.all(AI_CLIS.map(id => detectOne(id, PATH))),
    Promise.all(RUNNERS.map(id => detectOne(id, PATH)))
  ])
  return { ai, runners }
}
