import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { ShortJob } from '../shared/types.ts'
import { loginPath, WIN } from './env.ts'
import { t } from '../shared/i18n.ts'

// 쇼츠 만들기 — concept-shorts 엔진의 CLI(shorts.mjs)를 한 편씩 돌린다(기록 사이트 serve.mjs 와 같은 줄 세우기).
// 다 된 영상은 기록 폴더 감시가 .mp4 를 보고 history:changed 로 알리므로 여기서는 진행만 알린다
// ponytail: 한 번에 하나씩 — 한 편이 Chrome·ffmpeg 를 1분 남짓 쓴다. 대본이 낸 후속 편 자동 줄 세우기는 사이트에만 있다
export function createShorts(engine: string, root: () => string, onChange: () => void) {
  const jobs: Record<string, ShortJob> = {}
  let queue = Promise.resolve()
  const set = (name: string, j: ShortJob): void => { jobs[name] = j; onChange() }
  const run = (name: string): Promise<void> => new Promise(done => {
    set(name, { state: 'running', step: t('대본 쓰는 중') })
    if (WIN) process.env.PATH = loginPath() // 앱을 켠 뒤 winget 으로 깐 ffmpeg 도 보이게 — 맥은 켤 때 읽은 로그인 셸 PATH 그대로
    // Electron 안에서는 자기 실행 파일을 node 로 쓴다(build.mjs 와 같이) — 따로 깐 node 가 없어도 된다
    const p = spawn(process.execPath, [engine, name, '--root', root()], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true })
    let err = ''
    p.stdout.setEncoding('utf8').on('data', (s: string) => {
      const line = s.trim().split('\n').at(-1)
      if (line && jobs[name]?.state === 'running') set(name, { state: 'running', step: line })
    })
    p.stderr.setEncoding('utf8').on('data', (s: string) => { err += s })
    const end = (code: number | null, e?: Error): void => {
      set(name, code === 0 ? { state: 'done' } : { state: 'failed', error: (e?.message ?? err.trim().split('\n').at(-1) ?? '').slice(0, 200) || t('끝난 코드 {code}', { code: String(code) }) })
      done()
    }
    p.on('error', e => end(null, e))
    p.on('close', code => end(code))
  })
  return {
    jobs: (): Record<string, ShortJob> => jobs,
    make(name: unknown): ShortJob {
      if (typeof name !== 'string' || !name.trim() || name.length > 120 || /[\n\r]/.test(name)) throw new Error(t('쇼츠로 만들 개념 이름이 아닙니다'))
      if (!existsSync(engine)) throw new Error(t('쇼츠 스킬(concept-shorts)이 없습니다 — ~/.claude/skills/concept-shorts 를 깔아 주세요'))
      const cur = jobs[name]
      if (cur && (cur.state === 'queued' || cur.state === 'running')) return cur
      set(name, { state: 'queued' })
      queue = queue.then(() => run(name))
      return jobs[name]!
    }
  }
}
