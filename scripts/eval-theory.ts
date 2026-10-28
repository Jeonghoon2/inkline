// 이론 장면 평가 — 개념 목록(eval/theory-cases.json)을 실제 AI 로 N 번씩 만들어 단계 · 품질 지표를 낸다. 앱을 띄우지 않는다.
//   node scripts/eval-theory.ts [--n 1] [--case 낱말] [--cases 파일(eval/ 안)] [--cli codex] [--model 이름]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { detectTools } from '../src/main/detect.ts'
import { loginPath } from '../src/main/env.ts'
import { ask as aiAsk } from '../src/main/ai/run.ts'
import { THEORY_SYSTEM } from '../src/main/theory/prompts.ts'
import { qualityIssues, runTheory } from '../src/main/theory/pipeline.ts'
import { runPy } from '../src/main/theory/sandbox.ts'
import type { AiCli, ConceptRef, TheoryStage } from '../src/shared/types.ts'
import type { Ask } from '../src/main/ai/run.ts'

const ROOT = new URL('..', import.meta.url).pathname
const arg = (k: string, d = ''): string => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] ?? d : d }
process.env.PATH = loginPath()
const n = Number(arg('n', '1')), only = arg('case'), cli = arg('cli', 'codex') as AiCli
const cliPath = (await detectTools(process.env.PATH)).ai.find(t => t.id === cli)?.path ?? null
if (!cliPath) throw new Error(`${cli} 가 없습니다`)
const cases = (JSON.parse(await readFile(join(ROOT, 'eval', arg('cases', 'theory-cases.json')), 'utf8')) as ConceptRef[]).filter(c => !only || c.key.includes(only))
const report: unknown[] = []
for (const c of cases) for (let k = 1; k <= n; k++) {
  const t0 = Date.now(), stages: string[] = []
  let on = t0
  const ask: Ask = (task, prompt, schema) => aiAsk({ task, cli, cliPath, model: arg('model'), effort: arg('effort'), system: THEORY_SYSTEM, prompt, schema, timeoutMs: 180_000, deadlineMs: 180_000 })
  const r = await runTheory(c, ask, (code, prelude) => runPy(code, { prelude }), (s: TheoryStage) => { if (s.state === 'on') on = Date.now(); if (s.state === 'done') stages.push(`${s.stage}: ${s.note ?? ''} (${Math.round((Date.now() - on) / 1000)}초)`) })
  const secs = Math.round((Date.now() - t0) / 1000)
  const sc = r.ok ? r.set.scenes : []
  const row = {
    concept: c.key, run: k, ok: r.ok, secs, error: r.ok ? undefined : r.error.message,
    redesign: stages.filter(x => x.startsWith('exec: 실패')).length, rewrite: stages.filter(x => x.startsWith('quality: 고칠 점')).length,
    components: sc.map(x => `${x.component}(${x.beats.length})`).join(' '), predicts: sc.reduce((m, x) => m + x.beats.filter(b => b.predict).length, 0),
    issuesLeft: r.ok ? qualityIssues(sc, { progressAt: 1 }) : [], stages, codeLines: sc[1]?.code?.split('\n').length ?? 0,
    scenes: sc.map(x => ({ component: x.component, title: x.title, props: x.props, code: x.code, beats: x.beats.map(b => ({ caption: b.caption, state: b.state, predict: b.predict, line: b.line })) }))
  }
  report.push(row)
  console.log(`■ ${c.key} #${k} · ${r.ok ? '성공' : `실패 — ${row.error}`} · ${secs}초 · 다시 설계 ${row.redesign} · 다시 쓰기 ${row.rewrite} · 질문 ${row.predicts} · 코드 ${row.codeLines}줄 · ${row.components}`)
  for (const s of stages) console.log(`    ${s}`)
  if (row.issuesLeft.length) console.log(`    남은 품질 문제: ${row.issuesLeft.join(' / ')}`)
}
await mkdir(join(ROOT, 'eval', 'out'), { recursive: true })
const out = join(ROOT, 'eval', 'out', `theory-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await writeFile(out, JSON.stringify(report, null, 2))
console.log(`결과: ${out}`)
