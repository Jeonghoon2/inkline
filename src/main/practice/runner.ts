import { mkdtemp, writeFile, rm, mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import type { ExampleResult, Lang, Problem, RunResult } from '../../shared/types.ts'
import { spawnGroup, MARK } from '../proc.ts'
import { buildHarness, supportReason } from './harness.ts'
import { anyOrderHint, sameResult } from './compare.ts'
import { t } from '../../shared/i18n.ts'

const STOPPED = '실행을 멈췄습니다'
const CAP = 20_000
const cap = (s: string): string => (s.length > CAP ? s.slice(0, CAP) + '\n' + t('…(출력이 너무 길어 잘랐습니다)') : s)

/** 오류 글의 임시 폴더 경로를 지우고, 만든 파일의 줄 번호를 사용자 코드 줄 번호로 바꾼다 (C++ 은 #line 이 맡는다) */
function tidy(t: string, dirs: string[], off: number, userLines: number): string {
  for (const d of dirs) t = t.split(d + sep).join('')
  const at = (n: string) => { const k = Number(n) - off; return k <= userLines ? k : 0 } // 사용자 코드 밖(감싸는 코드) 줄은 그대로
  return t
    .replace(/\bmain\.py", line (\d+)/g, (m, n) => (at(n) >= 1 ? `solution.py", line ${at(n)}` : m))
    .replace(/\bmain\.js:(\d+)/g, (m, n) => (at(n) >= 1 ? `solution.js:${at(n)}` : m))
    .replace(/\bMain\.java:(\d+)/g, (m, n) => (at(n) >= 1 ? `Solution.java:${at(n)}` : m))
}

export async function runExamples(o: { lang: Lang; problem: Problem; code: string; timeoutMs: number; signal?: AbortSignal }): Promise<RunResult> {
  const { lang, problem, code, signal } = o
  const out: RunResult = { lang, compileError: null, unsupported: null, results: [], passed: false, aborted: false }
  const why = supportReason(problem, lang)
  if (why) return { ...out, unsupported: why }
  const timeoutMs = Math.min(60_000, Math.max(1000, o.timeoutMs || 0))
  const dir = await mkdtemp(join(tmpdir(), 'inkline-run-'))
  try {
    const dirs = [await realpath(dir).catch(() => dir), dir] // macOS 는 /var → /private/var, 긴 쪽부터 지운다
    const h = buildHarness(lang, problem, code)
    const fix = (t: string): string => tidy(t, dirs, h.userLineOffset, code.split('\n').length)
    for (const [name, text] of Object.entries(h.files)) {
      const f = join(dir, name)
      await mkdir(dirname(f), { recursive: true })
      await writeFile(f, text)
    }
    if (h.compile) {
      const c = await spawnGroup(h.compile[0], h.compile.slice(1), { cwd: dir, env: process.env, timeoutMs: 20000, signal })
      if (c.code !== 0 && !c.aborted) {
        return { ...out, compileError: fix(c.error ?? c.stderr ?? '').slice(0, 4000) || (c.timedOut ? t('컴파일 시간이 초과됐습니다') : t('컴파일하지 못했습니다')) }
      }
    }
    const anyOrder = problem.classification?.anyOrder ?? anyOrderHint(problem.html)
    for (let i = 0; i < problem.examples.length; i++) {
      const expected = problem.examples[i].expected
      const base = { index: i, expected, actual: undefined as unknown, stdout: '', stderr: '', ms: 0 }
      let res: ExampleResult
      if (signal?.aborted) {
        res = { ...base, status: 'error', stderr: t(STOPPED) }
      } else {
        const cmd = h.run(i)
        const r = await spawnGroup(cmd[0], cmd.slice(1), { cwd: dir, env: process.env, timeoutMs, signal })
        const lines = r.stdout.replace(/\r\n/g, '\n').split('\n') // Windows 의 Python · Java 는 줄끝을 \r\n 으로 찍는다
        let at = lines.length - 1
        while (at >= 0 && !lines[at].startsWith('__INKLINE')) at--
        const user = (at < 0 ? lines : lines.slice(0, at)).join('\n').replace(/\n+$/, '')
        const b = { ...base, stdout: user, stderr: fix(r.stderr), ms: r.ms }
        if (r.aborted) res = { ...b, status: 'error', stderr: t(STOPPED) }
        else if (r.timedOut) res = { ...b, status: 'timeout' }
        else if (r.signal) res = { ...b, status: 'error', stderr: [t('비정상 종료 ({sig})', { sig: r.signal }), b.stderr].filter(Boolean).join('\n') }
        else if (at >= 0 && lines[at].startsWith('__INKLINE_ERR__')) res = { ...b, status: 'error', stderr: [fix(lines[at].slice('__INKLINE_ERR__'.length)), b.stderr].filter(Boolean).join('\n') }
        else if (at >= 0 && lines[at].startsWith('__INKLINE__')) {
          try {
            const actual = JSON.parse(lines[at].slice('__INKLINE__'.length))
            res = { ...b, actual, status: sameResult(actual, expected, { anyOrder }) ? 'pass' : 'fail' }
          } catch { res = { ...b, status: 'error', stderr: [t('결과를 읽지 못했습니다'), b.stderr].filter(Boolean).join('\n') } }
        } else {
          const why = r.stdout.endsWith(MARK) ? t('출력이 1MB 를 넘어 결과를 읽지 못했습니다') : t('결과를 출력하지 못했습니다')
          res = { ...b, status: 'error', stderr: [why, r.error ?? b.stderr].filter(Boolean).join('\n') }
        }
      }
      const big = res.actual !== undefined && (JSON.stringify(res.actual) ?? '').length > CAP
      out.results.push({ ...res, actual: big ? '(결과가 너무 커서 생략했습니다)' : res.actual, stdout: cap(res.stdout), stderr: cap(res.stderr) })
    }
    out.passed = out.results.every((x) => x.status === 'pass')
    out.aborted = !!signal?.aborted
    return out
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }
}
