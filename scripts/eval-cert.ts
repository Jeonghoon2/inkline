// scripts/eval-cert.ts
// 자격증 평가 — 실제 교재 PDF 와 실제 AI 로 가져오기 · 판별 · 항목 나누기 · 학습 자료를 돌려 숫자를 낸다(교재 · 결과는 git 에 올리지 않는다)
//   node scripts/eval-cert.ts <교재.pdf> [--cli codex] [--model 이름] [--sample 20]
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../src/main/db.ts'
import { detectTools } from '../src/main/detect.ts'
import { loginPath } from '../src/main/env.ts'
import { ask as aiAsk, type Ask } from '../src/main/ai/run.ts'
import { CERT_SYSTEM, certTimeout } from '../src/main/cert/ai.ts'
import * as S from '../src/main/cert/store.ts'
import { confirmBook, ensureMaterial, importPdf, segmentBook, type CertDeps } from '../src/main/cert/service.ts'
import { questionIssues } from '../src/main/cert/material.ts'
import type { AiCli } from '../src/shared/types.ts'

const ROOT = new URL('..', import.meta.url).pathname
const arg = (k: string, d = ''): string => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] ?? d : d }
const pdf = process.argv[2]
if (!pdf || pdf.startsWith('--')) { console.log('사용: node scripts/eval-cert.ts <교재.pdf> [--cli codex] [--model 이름] [--sample 20]'); process.exit(1) }
const cli = arg('cli', 'codex') as AiCli, tools = await detectTools(loginPath())
const cliPath = tools.ai.find(t => t.id === cli)?.path ?? null
if (!cliPath) throw new Error(`${cli} 가 없습니다`)
const dir = await mkdtemp(join(tmpdir(), 'eval-cert-'))
const calls: Record<string, number> = {}, ms: Record<string, number[]> = {} // 호출마다 걸린 시간(벽시계 합이 아니라 지연을 잰다)
const d: CertDeps = {
  db: openDb(':memory:'), cli, model: arg('model'),
  ask: <T>(task: string, prompt: string, schema: Parameters<Ask>[2]) => {
    calls[task] = (calls[task] ?? 0) + 1
    const t = Date.now()
    return aiAsk<T>({ task, cli, cliPath, model: arg('model'), effort: '', system: CERT_SYSTEM, prompt, schema, ...certTimeout(task) }).then(r => {
      const took = Date.now() - t
      ;(ms[task] ??= []).push(took)
      console.log(`  · ${task} ${took}ms${r.ok ? '' : ` 실패: ${r.error.code} ${r.error.message}`}`)
      return r
    })
  },
  stage: s => { if (s.state === 'done' || s.note) console.log(`  ${s.stage} ${s.state}${s.note ? ` — ${s.note}` : ''}`) }
}
try {
  const t0 = Date.now()
  const r = await importPdf(d, dir, pdf, new Date())
  if (!r.ok) throw new Error(r.error)
  const book = S.getBook(d.db, r.bookId)!
  console.log(`판별: ${book.name} · ${book.kind} · 과목 ${book.subjects.join(' / ')} · 기준 ${JSON.stringify(book.rules)}`)
  confirmBook(d, r.bookId, { name: book.name, kind: book.kind, subjects: book.subjects, rules: book.rules, examDate: null })
  const t1 = Date.now()
  const seg = await segmentBook(d, r.bookId)
  if (!seg.ok) throw new Error(seg.error)
  const items = S.itemsOf(d.db, r.bookId)
  const segSecs = Math.round((Date.now() - t1) / 1000)
  const perSubject = Object.fromEntries(book.subjects.map(s => [s, items.filter(i => i.subject === s).length]))
  console.log(`항목 ${items.length}개 · 못 나눈 쪽 ${seg.unsplit.length} · ${segSecs}초 · 과목별 ${JSON.stringify(perSubject)}`)
  // 표본: 출제 많은 순으로 고르게
  const n = Number(arg('sample', '20')), step = Math.max(1, Math.floor(items.length / n))
  const sample = [...items].sort((a, b) => b.freq - a.freq || a.ord - b.ord).filter((_, i) => i % step === 0).slice(0, n)
  let made = 0, empty = 0
  const t2 = Date.now()
  for (const it of sample) {
    const m = await ensureMaterial(d, it.id)
    if (!m.ok) { console.log(`  ✗ ${it.title}: ${m.error}`); continue }
    const qs = S.questionsOf(d.db, it.id)
    made += qs.length
    if (!qs.length) empty++
  }
  const qs = sample.flatMap(it => S.questionsOf(d.db, it.id).map(q => ({ q, it })))
  const grounded = qs.filter(({ q, it }) => !questionIssues(q, it.body).length).length
  const report = {
    pdf, pages: book.pages, name: book.name, kind: book.kind, subjects: book.subjects, rules: book.rules,
    items: items.length, perSubject, unsplit: seg.unsplit, segSecs, totalSecs: Math.round((Date.now() - t0) / 1000),
    sample: sample.length, questions: made, emptyItems: empty, groundedRate: qs.length ? +(grounded / qs.length).toFixed(3) : null,
    materialSecs: Math.round((Date.now() - t2) / 1000), calls, ms,
    sampleItems: sample.slice(0, 5).map(it => ({ title: it.title, freqNote: it.freqNote, page: it.pageFrom, body: it.body.slice(0, 300), material: S.getMaterial(d.db, it.id), questions: S.questionsOf(d.db, it.id).map(q => ({ stem: q.stem, choices: q.choices, answer: q.answer, quote: q.quote })) }))
  }
  console.log(`\n■ 표본 ${sample.length}항목 · 문제 ${made}개 · 문제 없는 항목 ${empty} · 근거 일치율 ${report.groundedRate} · AI 호출 ${JSON.stringify(calls)}`)
  await mkdir(join(ROOT, 'eval', 'out'), { recursive: true })
  const out = join(ROOT, 'eval', 'out', `cert-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await writeFile(out, JSON.stringify(report, null, 2))
  console.log(`결과: ${out}`)
} finally { await rm(dir, { recursive: true, force: true }) }
