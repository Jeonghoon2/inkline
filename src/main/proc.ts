import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolveCommand } from './detect.ts'
import { WIN } from './env.ts'

export interface SpawnOpts {
  cwd: string; env?: NodeJS.ProcessEnv; stdin?: string; timeoutMs: number; signal?: AbortSignal; maxOutput?: number
}
export interface SpawnResult {
  code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean; aborted: boolean; ms: number
  /** 프로세스를 띄우지 못했을 때(ENOENT 등)의 메시지 */
  error?: string
}

const live = new Set<number>()
export const MARK = '\n…(출력이 너무 길어 잘랐습니다)'

// 자식이 띄운 손자(컴파일러 · AI CLI 의 일꾼)까지 끝낸다 — 맥은 프로세스 묶음(음수 pid), Windows 는 묶음이 없어 taskkill /T
function killTree(pid: number, sig: NodeJS.Signals): void {
  if (WIN) { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {}); return }
  try { process.kill(-pid, sig) } catch { /* 이미 끝남 */ }
}

export function killAll(): void {
  for (const pid of live) killTree(pid, 'SIGKILL')
  live.clear()
}

export function spawnGroup(cmd: string, args: string[], opts: SpawnOpts): Promise<SpawnResult> {
  const start = Date.now()
  const max = opts.maxOutput ?? 1024 * 1024
  if (opts.signal?.aborted) return Promise.resolve({ code: null, signal: null, stdout: '', stderr: '', timedOut: false, aborted: true, ms: 0 })
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try {
      const [c, a] = resolveCommand(cmd, args, opts.env?.PATH ?? process.env.PATH)
      // Windows 의 detached 는 묶음이 아니라 새 콘솔 창이라 쓰지 않는다. windowsHide 는 python · javac 의 검은 창을 숨긴다
      child = spawn(c, a, { cwd: opts.cwd, env: opts.env, detached: !WIN, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      // 인자에 NUL 이 있는 등 spawn 이 바로 던지는 경우
      resolve({ code: null, signal: null, stdout: '', stderr: '', timedOut: false, aborted: false, ms: Date.now() - start, error: (e as Error).message })
      return
    }
    const pid = child.pid
    if (pid) live.add(pid)
    let stdout = '', stderr = '', cutOut = false, cutErr = false
    let timedOut = false, aborted = false, finished = false
    let killTimer: NodeJS.Timeout | undefined
    const done = (code: number | null, error?: string, signal: NodeJS.Signals | null = null) => {
      if (finished) return
      finished = true
      clearTimeout(timer); clearTimeout(killTimer)
      opts.signal?.removeEventListener('abort', onAbort)
      if (pid) live.delete(pid)
      resolve({
        code, signal, stdout: cutOut ? stdout + MARK : stdout, stderr: cutErr ? stderr + MARK : stderr,
        timedOut, aborted, ms: Date.now() - start, ...(error ? { error } : {}),
      })
    }
    const killGroup = () => {
      if (killTimer || !pid) return
      killTree(pid, 'SIGTERM')
      // TERM 을 무시하면 KILL 로 끝내고, 파이프가 남아도 close 를 기다리지 않는다
      killTimer = setTimeout(() => {
        killTree(pid, 'SIGKILL')
        done(null)
      }, 2000)
    }
    const timer = setTimeout(() => { timedOut = true; killGroup() }, opts.timeoutMs)
    const onAbort = () => { aborted = true; killGroup() }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d: string) => { if (stdout.length + d.length > max) { cutOut = true; d = d.slice(0, Math.max(0, max - stdout.length)) } stdout += d })
    child.stderr.on('data', (d: string) => { if (stderr.length + d.length > max) { cutErr = true; d = d.slice(0, Math.max(0, max - stderr.length)) } stderr += d })
    child.stdin.on('error', () => { /* 먼저 끝난 프로세스 */ })
    child.on('error', (e) => done(null, e.message))
    child.on('close', (code, sig) => done(code, undefined, sig))
    child.stdin.end(opts.stdin ?? '')
  })
}
