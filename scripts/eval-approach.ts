// 접근 찾기 평가 — 짧은 문제 8개(eval/approach-cases.json)를 실제 AI 로 돌려 정답 개념 포함률 · 검산 통과율 · 시간을 낸다. 앱을 띄우지 않는다.
//   node scripts/eval-approach.ts [--n 1] [--case 낱말] [--cli codex] [--model 이름] [--effort 값] [--dry]
//   --dry: AI 없이 사례 파일만 점검(checkable · limitsOf)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { detectTools } from '../src/main/detect.ts'
import { loginPath } from '../src/main/env.ts'
import { ask as aiAsk } from '../src/main/ai/run.ts'
import { plainText } from '../src/main/ai/classify.ts'
import { THEORY_SYSTEM } from '../src/main/theory/prompts.ts'
import { checkable, clueFound, runApproaches } from '../src/main/theory/approach.ts'
import { limitsOf } from '../src/main/theory/limits.ts'
import { runPy } from '../src/main/theory/sandbox.ts'
import type { Ask } from '../src/main/ai/run.ts'
import type { AiCli, Example, Problem, Signature, TheoryStage } from '../src/shared/types.ts'

type Case = { title: string; html: string; signature: Signature; examples: Example[]; anyOrder: boolean; want: string[] }
const ROOT = new URL('..', import.meta.url).pathname
const arg = (k: string, d = ''): string => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] ?? d : d }
process.env.PATH = loginPath()
const n = Number(arg('n', '1')), only = arg('case'), cli = arg('cli', 'codex') as AiCli
const cases = (JSON.parse(await readFile(join(ROOT, 'eval', 'approach-cases.json'), 'utf8')) as Case[]).filter(c => !only || c.title.includes(only))
const toProblem = (c: Case): Problem => ({
  id: 0, site: 'leetcode', siteId: 'eval', url: 'https://example.invalid/eval', title: c.title, html: c.html, examples: c.examples, starter: {},
  signature: c.signature, siteLevel: '', siteTags: [], createdAt: '',
  classification: { anyOrder: c.anyOrder, complexityNote: '', tags: [], nature: 'algorithm', difficulty: 1 }
})

if (process.argv.includes('--dry')) {
  for (const c of cases) { const p = toProblem(c), l = limitsOf(p.html); console.log(`${c.title}: checkable=${checkable(p)} · limits=${l.source} n=${l.n} allowed=${l.allowed}`) }
  process.exit(0)
}

const cliPath = (await detectTools(process.env.PATH)).ai.find(t => t.id === cli)?.path ?? null
if (!cliPath) throw new Error(`${cli} 가 없습니다`)
const report: { hit: boolean; clueOk: boolean; pass: number; unknown: number; secs: number }[] = []
const rows: unknown[] = []
for (const c of cases) for (let k = 1; k <= n; k++) {
  const t0 = Date.now(), stages: string[] = []
  let on = t0
  const ask: Ask = (task, prompt, schema) => aiAsk({ task, cli, cliPath, model: arg('model'), effort: arg('effort'), system: THEORY_SYSTEM, prompt, schema, timeoutMs: 180_000, deadlineMs: 180_000 })
  const problem = toProblem(c)
  const r = await runApproaches({
    problem, ask, runPy: (code, o) => runPy(code, o), keys: [], similar: [],
    stage: (s: TheoryStage) => { if (s.state === 'on') on = Date.now(); if (s.state === 'done') stages.push(`${s.stage}: ${s.note ?? ''} (${Math.round((Date.now() - on) / 1000)}초)`) }
  })
  const secs = Math.round((Date.now() - t0) / 1000)
  const list = r.ok ? r.list : []
  const text = plainText(c.html)
  const hit = list.some(a => a.concepts.some(x => c.want.includes(x.key)))
  const clueOk = list.every(a => clueFound(a.clue ?? '', text)) // 단서가 없으면 앱처럼 '없음'으로 본다
  const pass = list.filter(a => a.check?.status === 'pass').length, unknown = list.filter(a => a.check?.status === 'unknown').length
  report.push({ hit, clueOk, pass, unknown, secs })
  rows.push({ title: c.title, run: k, ok: r.ok, error: r.ok ? undefined : r.error.message, hit, clueOk, pass, unknown, secs, stages, approaches: list.map(a => ({ name: a.name, concepts: a.concepts.map(x => x.key), clue: a.clue, complexity: a.complexity, check: a.check })) })
  console.log(`■ ${c.title} #${k} · ${r.ok ? `접근 ${list.length}개 (${list.map(a => a.name).join(', ')})` : `실패 — ${r.error.message}`} · hit ${hit} · clueOk ${clueOk} · 통과 ${pass} · 확인 못 함 ${unknown} · ${secs}초`)
  for (const s of stages) console.log(`    ${s}`)
}
const sum = (f: (x: (typeof report)[number]) => number): number => report.reduce((m, x) => m + f(x), 0)
const total = sum(x => x.pass + x.unknown)
console.log(`합계 ${report.length}회 · 정답 개념 포함률 ${sum(x => +x.hit)}/${report.length} · 검산 통과율 ${sum(x => x.pass)}/${total} · 평균 ${report.length ? Math.round(sum(x => x.secs) / report.length) : 0}초`)
await mkdir(join(ROOT, 'eval', 'out'), { recursive: true })
const out = join(ROOT, 'eval', 'out', `approach-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await writeFile(out, JSON.stringify(rows, null, 2))
console.log(`결과: ${out}`)
