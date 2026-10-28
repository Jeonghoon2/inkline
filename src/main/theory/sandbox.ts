// 이론 검산용 Python 실행 — AI 가 쓴 코드라 겹겹이 막는다.
// 1) 정적 검사: import 는 계산용 표준 모듈만, 파일 · 시스템 · 네트워크 · 동적 실행 이름이 보이면 돌리지 않는다
// 2) 격리: macOS sandbox-exec 로 네트워크를 막고 임시 폴더 밖에는 쓰지 못하게, 홈 폴더는 읽지도 못하게(Python 이 홈 아래 있으면 그 설치 폴더만 허용), 환경 변수는 PATH 만, python -I -S -B, 5초 제한
//    Windows 는 sandbox-exec 가 없어 Python 감사 훅(PY_GUARD)이 같은 것을 막는다 — 파일 열기 · 새 import · os · 네트워크 · 프로세스
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { spawnGroup } from '../proc.ts'
import { PY, WIN } from '../env.ts'

const ALLOWED = new Set(['collections', 'heapq', 'math', 'itertools', 'functools', 'bisect', 'json'])
const FORBIDDEN = /\b(_getframe|open|exec|eval|compile|__import__|globals|locals|vars|input|breakpoint|os|sys|subprocess|socket|shutil|pathlib|importlib|ctypes|signal|threading|multiprocessing|pickle|marshal|builtins|__builtins__|__subclasses__|__class__|__bases__|__globals__|__code__|getattr|setattr|delattr)\b/
const MAX_CODE = 3000

// 돌리면 안 되는 까닭 — 괜찮으면 null
export function pyRisk(code: string, max = MAX_CODE): string | null {
  if (code.length > max) return `코드가 너무 깁니다(${code.length}자)`
  for (const m of code.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w., ]+))/gm)) {
    const mods = (m[1] ?? m[2] ?? '').split(',').map(s => s.trim().split(/\s+/)[0]!.split('.')[0]!).filter(Boolean)
    const bad = mods.find(x => !ALLOWED.has(x))
    if (bad) return `허용하지 않는 import: ${bad}`
  }
  // 글자 안의 낱말은 빼고 본다 — f-string 은 글자 안이 실행되는 식이라 하나라도 있으면 빼지 않는다
  const bare = /(^|[^\w])[rRbB]?[fF][rR]?["']/.test(code) ? code : code.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""')
  const f = bare.match(FORBIDDEN)
    ?? bare.match(/__\w+__/) // 밑줄 두 개 이름(show.__defaults__ 등)으로 앞머리 코드에 손대지 못하게
    ?? bare.match(/\.(?:gi|cr|ag|f|tb|co)_\w+/) // 프레임 · 코드 속성(gi_frame.f_builtins 로 open 을 꺼내 홈 파일을 읽을 수 있었다)
    ?? bare.match(/\.format(?:_map)?\b/) // "{0.__globals__}".format(…) 처럼 글자 안에서 속성을 꺼낸다
    ?? bare.match(/\._\w+|\bimport\s+[^\n]*\b_\w+/) // 허용 모듈의 비공개 이름(collections._sys 로 sys 에 닿았다)
  return f ? `쓰면 안 되는 이름: ${f[0]}` : null
}

export type PyResult = { ok: true; lines: string[] } | { ok: false; error: string; aborted?: true }
const SANDBOX = '/usr/bin/sandbox-exec'
// python3 가 홈 아래 설치돼 있으면(pyenv 등) 그 설치 폴더만 읽기를 허용한다
function pythonRoot(): string | null {
  for (const d of (process.env.PATH ?? '').split(delimiter)) {
    const p = join(d, 'python3')
    if (!existsSync(p)) continue
    try { return dirname(dirname(realpathSync(p))) } catch { return null }
  }
  return null
}
const q = (p: string): string => p.replace(/["\\]/g, '')
export function sandboxProfile(writable: string, home = homedir(), py = pythonRoot()): string {
  const keepPy = py && (py === home || py.startsWith(home + '/')) ? ` (allow file-read* (subpath "${q(py)}"))` : ''
  return `(version 1)(allow default)(deny network*)(deny file-write*)(allow file-write* (subpath "${q(writable)}") (literal "/dev/null"))(deny file-read* (subpath "${q(home)}"))${keepPy}`
}
export const canSandbox = (): boolean => existsSync(SANDBOX)

// Windows 용 격리 — 쓸 모듈을 먼저 다 불러 둔 뒤 감사 훅을 건다. 훅은 Python 안에서 떼어 낼 수 없고(PEP 578),
// 그 뒤의 파일 열기(읽기 포함) · 새 import · os · 네트워크 · 프로세스 · ctypes 는 전부 PermissionError 가 된다.
// 이미 불러 둔 모듈만 쓰므로 표준 라이브러리 파일을 읽을 일도 없다. sys.excepthook 은 오류 글을 찍어야 해서 둔다
export const PY_GUARD = `import collections, heapq, math, itertools, functools, bisect, json, random, typing, sys as _s
def _g(ev, args, _deny=('os.', 'socket.', 'subprocess.', 'shutil.', 'ctypes.', 'winreg.', '_winapi.', 'msvcrt.', 'urllib.', 'webbrowser.', 'marshal.', 'pickle.', 'code.', 'sys.')):
    if ev in ('open', 'import', 'compile', 'exec') or (ev.startswith(_deny) and ev != 'sys.excepthook'):
        raise PermissionError('막힌 동작: ' + ev)
_s.addaudithook(_g)
del _s, _g`

// 코드를 돌려 표준 출력의 줄들을 돌려준다(빈 줄 빼고). prelude · postlude 는 앱이 쓴 앞 · 뒷머리 코드 — 검사하지 않고 코드 앞뒤에 붙인다
export async function runPy(code: string, o: { timeoutMs?: number; signal?: AbortSignal; prelude?: string; postlude?: string; maxCode?: number } = {}): Promise<PyResult> {
  const risk = pyRisk(code, o.maxCode)
  if (risk) return { ok: false, error: risk }
  const mac = canSandbox()
  if (!mac && !WIN) return { ok: false, error: '격리 실행(sandbox-exec)을 쓸 수 없어 검산하지 않았습니다' }
  const dir = await mkdtemp(join(tmpdir(), 'inkline-run-'))
  try {
    const real = await realpath(dir).catch(() => dir)
    await writeFile(join(dir, 'main.py'), [mac ? undefined : PY_GUARD, o.prelude, code, o.postlude].filter(s => s !== undefined).join('\n'))
    const py = [PY, '-I', '-S', '-B', '-X', 'utf8', 'main.py'] // -I 는 PYTHONUTF8 을 무시해서 -X utf8 로 한글 출력을 맞춘다
    const [cmd, ...args] = mac ? [SANDBOX, '-p', sandboxProfile(real), ...py] : py
    // Windows 의 Python 은 SYSTEMROOT 가 없으면 난수 초기화에서 죽는다
    const env = mac ? { PATH: process.env.PATH ?? '' } : { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? 'C:\\Windows' }
    const r = await spawnGroup(cmd!, args, { cwd: dir, env, timeoutMs: o.timeoutMs ?? 5000, signal: o.signal, maxOutput: 64 * 1024 })
    if (r.aborted) return { ok: false, error: '취소했습니다', aborted: true }
    if (r.timedOut) return { ok: false, error: `${Math.round((o.timeoutMs ?? 5000) / 1000)}초 안에 끝나지 않았습니다(무한 반복?)` }
    if (r.error) return { ok: false, error: r.error }
    if (r.code !== 0) return { ok: false, error: (r.stderr.trim().split('\n').slice(-3).join('\n') || `종료 코드 ${r.code}`).slice(0, 400) }
    return { ok: true, lines: r.stdout.split('\n').map(l => l.trim()).filter(Boolean) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
