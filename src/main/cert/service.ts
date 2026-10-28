// src/main/cert/service.ts
// 자격증 흐름 — 가져오기(앱) → 판별(AI) → [확인 카드] → 항목 나누기(AI → 앱 대조) → 공부(학습 자료 AI, 반복 앱) · 모의 시험 · 쌍 비교
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { pdfPagesOrdered } from '../pdf.ts'
import { DEFAULT_RULES, daysLeft, gradeOf, masteryOf, pickMock, scoreMock, studyQueue, subjectMastery, type CertBook, type CertFeedback, type CertHome, type CertMockResult, type CertNext, type CertPairCard, type CertPaper, type CertPatch, type CertStage } from '../../shared/cert.ts'
import * as S from './store.ts'
import type { Ask } from '../ai/run.ts'
import { squash } from './ai.ts'
import { CLASSIFY_SCHEMA, classifyPrompt, cleanClassify, unverifiedSubjects, type Classified } from './classify.ts'
import { bookText, chunkPlan, cutBodies, segmentChunk, suspiciousPages, type BookText } from './segment.ts'
import { runMaterial, runVariant, type MStage } from './material.ts'
import { runPair } from './pairs.ts'
import { t } from '../../shared/i18n.ts'

export interface CertDeps { db: DatabaseSync; ask: Ask; stage: (s: CertStage) => void; signal?: AbortSignal; cli: string | null; model: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

export const isScanned = (pages: string[]): boolean => pages.length > 0 && pages.filter(p => squash(p).length < 40).length / pages.length > 0.8

export async function importPdf(d: CertDeps, dataDir: string, path: string, now: Date): Promise<{ ok: true; bookId: number; existing: boolean } | { ok: false; error: string }> {
  const st = await stat(path).catch(() => null)
  if (!st?.isFile()) return fail(t('파일을 찾지 못했습니다'))
  if (st.size > 200_000_000) return fail(t('PDF 가 너무 큽니다(200MB 넘음)'))
  const buf = await readFile(path)
  const sha = createHash('sha256').update(buf).digest('hex')
  const had = S.bookBySha(d.db, sha)
  if (had) return { ok: true, bookId: had, existing: true }
  d.stage({ stage: 'import', state: 'on' })
  let pages: string[], total: number
  try { ({ pages, total } = await pdfPagesOrdered(new Uint8Array(buf), 600)) } catch { return fail(t('PDF 를 읽지 못했습니다 — 깨진 파일이 아닌지 확인해 주세요')) }
  if (isScanned(pages)) return fail(t('글자를 뽑을 수 없는 PDF 입니다(스캔본)'))
  const dir = join(dataDir, 'certs')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${sha}.pdf`)
  await copyFile(path, file)
  d.stage({ stage: 'import', state: 'done', note: `${t('{n}쪽', { n: pages.length })}${total > pages.length ? ` · ${t('앞 {n}쪽만 가져왔어요(전체 {total}쪽)', { n: pages.length, total })}` : ''}` })
  d.stage({ stage: 'classify', state: 'on' })
  const c = await d.ask<Classified>('cert-classify', classifyPrompt(pages), CLASSIFY_SCHEMA)
  if ((!c.ok && c.error.code === 'aborted') || d.signal?.aborted) { await rm(file, { force: true }); return fail(t('취소했습니다')) } // 같은 해시의 교재가 없으니 방금 복사한 파일이다
  const cls: Classified = c.ok ? cleanClassify(c.value) : { name: basename(path).replace(/\.pdf$/i, '').slice(0, 60), kind: '기타', subjects: ['전체'], rules: DEFAULT_RULES, evidence: '' }
  const missing = c.ok ? unverifiedSubjects(cls.subjects, pages) : []
  const checkNote = [cls.evidence && t('판별 근거: {s}', { s: cls.evidence }), missing.length > 0 && `교재 글에서 찾지 못한 과목: ${missing.join(', ')} — 이름이 맞는지 확인해 주세요`].filter(Boolean).join('\n')
  d.stage({ stage: 'classify', state: 'done', note: c.ok ? `${cls.name} · ${cls.kind} · ${t('{n}과목', { n: cls.subjects.length })}${missing.length ? ` · ${t('원문에 없는 과목 {n}', { n: missing.length })}` : ''}` : t('판별하지 못했어요 — 직접 적어 주세요') })
  const bookId = S.tx(d.db, () => {
    const id = S.createBook(d.db, { name: cls.name, kind: cls.kind, subjects: cls.subjects, rules: cls.rules, pdfPath: file, sha256: sha, pages: pages.length, now, checkNote })
    S.putPages(d.db, id, pages)
    S.putChunks(d.db, id, chunkPlan(pages.length))
    return id
  })
  return { ok: true, bookId, existing: false }
}

export function confirmBook(d: CertDeps, bookId: number, p: CertPatch): CertBook {
  return S.updateBook(d.db, bookId, { name: p.name, kind: p.kind, subjects: p.subjects, rules: p.rules, examDate: p.examDate, confirmed: true })
}

// 본문 다시 자르기 — 묶음이 하나 끝날 때마다 전체 시작 위치로. 마지막 항목은 마친 묶음의 끝 쪽까지
function rebuild(db: DatabaseSync, bookId: number, t: BookText): ReturnType<typeof cutBodies> {
  const done = S.chunksOf(db, bookId).filter(c => c.state === 'done')
  const lastTo = Math.max(0, ...done.map(c => c.to))
  const cuts = cutBodies(t, S.anchorsOf(db, bookId), t.starts[lastTo] ?? t.full.length)
  S.setBodies(db, cuts)
  return cuts
}
const donePages = (db: DatabaseSync, bookId: number): Set<number> => {
  const s = new Set<number>()
  for (const c of S.chunksOf(db, bookId)) if (c.state === 'done') for (let p = c.from; p <= c.to; p++) s.add(p)
  return s
}
const unsplitOf = (db: DatabaseSync, bookId: number, t: BookText): number[] => {
  const failed = S.chunksOf(db, bookId).filter(c => c.state === 'failed').flatMap(c => Array.from({ length: c.to - c.from + 1 }, (_, i) => c.from + i))
  const sus = suspiciousPages(cutBodies(t, S.anchorsOf(db, bookId), t.full.length), donePages(db, bookId))
  return [...new Set([...failed, ...sus])].sort((a, b) => a - b)
}

export async function segmentBook(d: CertDeps, bookId: number): Promise<{ ok: true; items: number; unsplit: number[] } | { ok: false; error: string }> {
  const book = S.getBook(d.db, bookId)
  if (!book) return fail(t('과정을 찾지 못했습니다'))
  const pages = S.getPages(d.db, bookId), bt = bookText(pages)
  for (const c of S.chunksOf(d.db, bookId)) if (c.state === 'failed') S.setChunk(d.db, bookId, c.chunk, 'todo') // [다시 시도]
  // 취소 — 시도로 세지 않는다. 다시 보던 마친 묶음은 마친 채로(처음 찾은 항목은 그대로 있다)
  const cancel = (): { ok: false; error: string } => {
    for (const c of S.chunksOf(d.db, bookId)) if (c.state === 'retry') S.setChunk(d.db, bookId, c.chunk, 'done')
    return fail(t('취소했습니다'))
  }
  const retried = new Set<number>() // 이번 실행에서 한 번 실패해 다시 돌린 묶음
  d.stage({ stage: 'segment', state: 'on' })
  for (let pass = 0; pass < 2; pass++) {
    const all = S.chunksOf(d.db, bookId)
    const sus = pass ? suspiciousPages(rebuild(d.db, bookId, bt), donePages(d.db, bookId)) : []
    for (const c of all.filter(x => x.state === 'todo' || x.state === 'retry')) {
      if (d.signal?.aborted) return cancel()
      const donePg = Math.max(0, ...S.chunksOf(d.db, bookId).filter(x => x.state === 'done').map(x => x.to))
      d.stage({ stage: 'segment', state: 'on', note: t('{from}~{to}쪽 읽는 중 · 항목 {n}개', { from: c.from, to: Math.min(c.to, pages.length), n: S.anchorsOf(d.db, bookId).length }), progress: [donePg, pages.length] })
      const r = await segmentChunk(d.ask, book.subjects, bt, pages, c, sus.filter(p => p >= c.from && p <= c.to))
      if (!r.ok) {
        if (r.error.code === 'aborted' || d.signal?.aborted) return cancel()
        // 다시 보던 마친 묶음은 마친 채로, 처음 실패한 묶음은 다음 차례에 한 번 더, 두 번 실패하면 실패
        S.setChunk(d.db, bookId, c.chunk, c.state === 'retry' ? 'done' : retried.has(c.chunk) ? 'failed' : 'todo', true)
        retried.add(c.chunk)
        continue
      }
      S.addAnchors(d.db, bookId, r.found)
      S.setChunk(d.db, bookId, c.chunk, 'done', true)
      rebuild(d.db, bookId, bt)
    }
    const sus2 = suspiciousPages(rebuild(d.db, bookId, bt), donePages(d.db, bookId))
    if (pass) break // 둘째 차례 뒤에는 표시하지 않는다(남은 retry 가 마친 쪽에서 빠지지 않게)
    let again = S.chunksOf(d.db, bookId).some(c => c.state === 'todo')
    for (const c of S.chunksOf(d.db, bookId)) if (c.state === 'done' && c.tries < 2 && sus2.some(p => p >= c.from && p <= c.to)) { S.setChunk(d.db, bookId, c.chunk, 'retry'); again = true }
    if (!again) break
  }
  const unsplit = unsplitOf(d.db, bookId, bt)
  S.updateBook(d.db, bookId, { status: unsplit.length ? 'partial' : 'ready' })
  const items = S.anchorsOf(d.db, bookId).length
  d.stage({ stage: 'segment', state: 'done', note: `${t('항목 {n}개', { n: items })}${unsplit.length ? ` · ${t('못 나눈 쪽 {n}', { n: unsplit.length })}` : ''}` })
  return { ok: true, items, unsplit }
}

export function homeOf(d: CertDeps, bookId: number, now: Date): CertHome {
  const book = S.getBook(d.db, bookId)
  if (!book) throw new Error(t('과정을 찾지 못했습니다'))
  const items = S.itemsOf(d.db, bookId), reviews = S.reviewsOf(d.db, bookId), by = new Map(reviews.map(r => [r.itemId, r]))
  const q = studyQueue(items, reviews, now)
  const bt = bookText(S.getPages(d.db, bookId))
  return {
    book, daysLeft: daysLeft(now, book.examDate), due: q.filter(e => e.kind === 'review').length, fresh: q.filter(e => e.kind === 'new').length,
    subjects: subjectMastery(book.subjects, items, reviews).map(s => ({ ...s, recent: S.recentRate(d.db, bookId, s.subject) })),
    map: items.map(i => ({ id: i.id, title: i.title, subject: i.subject, mastery: masteryOf(by.get(i.id)) })),
    wrongs: S.wrongNote(d.db, bookId).filter(w => !w.fixed).length, pairs: S.pairsOf(d.db, bookId).filter(p => p.count >= 2).length,
    unsplit: book.status === 'importing' ? [] : unsplitOf(d.db, bookId, bt)
  }
}

// 같은 항목을 두 번 만들지 않게 — 만들고 있는 것은 같은 약속을 돌려준다. DB 마다 따로(시험에서 DB 가 여럿이고 항목 id 가 겹친다)
type Made = Promise<{ ok: true; added: number } | { ok: false; error: string }>
const flyingOf = new WeakMap<DatabaseSync, Map<string, Made>>()
export function ensureMaterial(d: CertDeps, itemId: number, variant = false, show = false): Made {
  const flying = flyingOf.get(d.db) ?? new Map<string, Made>()
  flyingOf.set(d.db, flying)
  const key = `${itemId}:${variant}`
  const f = flying.get(key)
  if (f) return f
  // show: 지금 공부 화면이 기다리는 항목이면 작은 단계를 알린다(미리 만들기 · 모의 시험 준비는 알리지 않는다)
  const stage: MStage | undefined = show ? (id, state, note) => d.stage({ stage: id, state, note }) : undefined
  const p = (async () => {
    const item = S.getItem(d.db, itemId)
    if (!item) return fail(t('항목을 찾지 못했습니다'))
    const book = S.getBook(d.db, item.bookId)!
    const same = S.itemsOf(d.db, item.bookId).filter(i => i.subject === item.subject)
    const have = S.ownQuestions(d.db, itemId)
    if (!variant) {
      if (have.length) return { ok: true as const, added: 0 }
      const r = await runMaterial(d.ask, item, same, book.kind, stage)
      if (!r.ok) return fail(r.error.message)
      const added = S.tx(d.db, () => { S.putMaterial(d.db, itemId, r.material, d.cli, d.model, new Date()); return S.addQuestions(d.db, itemId, r.questions, 'item').length })
      return { ok: true as const, added }
    }
    const confusions = S.getMaterial(d.db, itemId)?.confusions.map(c => c.title) ?? []
    const r = await runVariant(d.ask, item, same, have.map(q => q.stem), confusions, stage)
    if (!r.ok) return fail(r.error.message)
    return { ok: true as const, added: S.addQuestions(d.db, itemId, r.questions, 'variant').length }
  })().finally(() => flying.delete(key))
  flying.set(key, p)
  return p
}

export async function nextCard(d: CertDeps, bookId: number, subject: string | null, now: Date): Promise<CertNext> {
  const items = S.itemsOf(d.db, bookId), reviews = S.reviewsOf(d.db, bookId)
  const pairs = S.pairsOf(d.db, bookId).filter(p => p.count >= 2).map(p => [p.a, p.b] as [number, number])
  const queue = studyQueue(items, reviews, now, { subject, pairs })
  if (!queue.length) {
    const next = reviews.filter(r => !subject || items.find(i => i.id === r.itemId)?.subject === subject).map(r => r.dueAt).sort()[0] ?? null
    return { done: true, nextDue: next }
  }
  const head = queue[0]!, item = items.find(i => i.id === head.itemId)!
  let qs = S.ownQuestions(d.db, item.id)
  if (!qs.length) {
    const r = await ensureMaterial(d, item.id, false, true) // 공부 화면에 작은 단계를 보인다
    if (!r.ok) return { error: r.error }
    qs = S.ownQuestions(d.db, item.id)
  }
  if (!qs.length) return { explainOnly: { itemId: item.id, title: item.title, subject: item.subject, material: S.getMaterial(d.db, item.id), body: item.body, pageFrom: item.pageFrom } }
  const counts = S.attemptCounts(d.db, bookId)
  let pick = qs.find(q => !counts.get(q.id))
  if (!pick && head.kind === 'review') {
    const v = await ensureMaterial(d, item.id, true, true) // 다 풀었으면 변형 문제
    if (v.ok && v.added) pick = S.ownQuestions(d.db, item.id).find(q => !counts.get(q.id))
  }
  pick ??= [...qs].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0))[0]!
  // 다음 3 항목은 미리 만든다(기다리지 않는다, 하나씩)
  const ahead = queue.slice(1, 4).map(e => e.itemId).filter(id => !S.ownQuestions(d.db, id).length)
  void (async () => { for (const id of ahead) await ensureMaterial(d, id).catch(() => null) })()
  return {
    card: {
      questionId: pick.id, stem: pick.stem, choices: pick.choices, kind: head.kind,
      item: { id: item.id, subject: item.subject, freq: item.freq, freqNote: item.freqNote },
      left: { due: queue.filter(e => e.kind === 'review').length, fresh: queue.filter(e => e.kind === 'new').length }
    }
  }
}

function bumpLure(d: CertDeps, bookId: number, itemId: number, title: string): { title: string; count: number } | null {
  const other = title ? S.itemsOf(d.db, bookId).find(i => i.title === title && i.id !== itemId) : undefined
  return other ? { title: other.title, count: S.bumpPair(d.db, bookId, itemId, other.id) } : null
}
export function answerQuestion(d: CertDeps, questionId: number, picked: number, sure: boolean, mode: 'learn' | 'review', now: Date): CertFeedback {
  const q = S.getQuestion(d.db, questionId)
  if (!q) throw new Error(t('문제를 찾지 못했습니다'))
  const item = S.getItem(d.db, q.itemId)!, book = S.getBook(d.db, item.bookId)!
  const correct = picked === q.answer
  S.addAttempt(d.db, { questionId, picked, correct, sure, mode, now })
  // 틀리면 늘 처음부터. 맞히면 때가 된 항목만 단계를 올린다(오답 노트 · 쌍 문제를 연달아 맞혀 간격을 건너뛰지 않게)
  const prev = S.reviewsOf(d.db, book.id).find(r => r.itemId === item.id)
  const dueAt = !correct || !prev || Date.parse(prev.dueAt) <= now.getTime() ? S.gradeItem(d.db, item.id, gradeOf(correct, sure), correct, now, book.examDate).dueAt : prev.dueAt
  const pair = correct ? null : bumpLure(d, book.id, item.id, q.choiceItems[picked] ?? '')
  return {
    correct, sure, answer: q.answer, why: q.why, notes: q.notes, refute: q.refute, quote: q.quote,
    item: { id: item.id, title: item.title, subject: item.subject, pageFrom: item.pageFrom, body: item.body },
    material: S.getMaterial(d.db, item.id), dueAt, pair
  }
}
// 문제 없이 설명만 본 항목 — 헷갈림으로 두어 다시 나오게
export function markSeen(d: CertDeps, itemId: number, now: Date): void {
  const item = S.getItem(d.db, itemId)
  if (item) S.gradeItem(d.db, itemId, '헷갈림', true, now, S.getBook(d.db, item.bookId)?.examDate ?? null)
}
export const pageText = (d: CertDeps, bookId: number, page: number): string => S.getPages(d.db, bookId)[page - 1] ?? ''

export async function startMock(d: CertDeps, bookId: number, now: Date): Promise<CertPaper | { error: string }> {
  const book = S.getBook(d.db, bookId)
  if (!book) return { error: t('과정을 찾지 못했습니다') }
  const items = S.itemsOf(d.db, bookId)
  const pick = (): ReturnType<typeof pickMock> => pickMock({ subjects: book.subjects, rules: book.rules, items, questions: S.bookQuestions(d.db, bookId), seen: new Set(S.attemptCounts(d.db, bookId).keys()) })
  let p = pick()
  // 모자란 과목은 문제가 없는 항목(출제 많은 순)부터 자료를 더 만든다
  for (const s of p.short) {
    const cand = items.filter(i => i.subject === s.subject && !S.ownQuestions(d.db, i.id).length).sort((a, b) => b.freq - a.freq || a.ord - b.ord)
    let need = s.missing
    for (const it of cand) {
      if (need <= 0 || d.signal?.aborted) break
      d.stage({ stage: 'material', state: 'on', note: t('{subject} 문제 준비 · {a} / {b}', { subject: s.subject, a: s.missing - need, b: s.missing }) })
      const r = await ensureMaterial(d, it.id)
      if (r.ok) need -= Math.min(2, r.added)
    }
  }
  d.stage({ stage: 'material', state: 'done' })
  if (d.signal?.aborted) return { error: t('취소했습니다') }
  p = pick()
  if (!p.questionIds.length) return { error: t('모의 시험에 낼 문제를 만들지 못했습니다') }
  const mockId = S.createMock(d.db, bookId, p.questionIds, now)
  return {
    mockId, minutes: book.rules.minutes, short: p.short,
    questions: p.questionIds.map(id => { const q = S.getQuestion(d.db, id)!; return { id, subject: S.getItem(d.db, q.itemId)!.subject, stem: q.stem, choices: q.choices } })
  }
}
export function submitMock(d: CertDeps, mockId: number, picks: Record<number, number | null>, now: Date): CertMockResult {
  const m = S.getMock(d.db, mockId)
  if (!m || m.finishedAt) throw new Error(t('끝난 시험이거나 없는 시험입니다'))
  const book = S.getBook(d.db, m.bookId)!
  const asked = m.questionIds.map(id => { const q = S.getQuestion(d.db, id)!; const item = S.getItem(d.db, q.itemId)!; return { q, item } })
  const score = scoreMock({ subjects: book.subjects, rules: book.rules, asked: asked.map(a => ({ questionId: a.q.id, subject: a.item.subject, answer: a.q.answer })), picks })
  S.tx(d.db, () => {
    for (const { q, item } of asked) {
      const picked = picks[q.id] ?? null, correct = picked === q.answer
      S.addAttempt(d.db, { questionId: q.id, picked, correct, sure: false, mode: 'mock', mockId, now }) // 모의 시험은 확실 여부를 묻지 않는다
      if (!correct) {
        S.gradeItem(d.db, item.id, '몰랐음', false, now, book.examDate) // 모의 시험에서 틀리면 처음부터
        if (picked !== null) bumpLure(d, book.id, item.id, q.choiceItems[picked] ?? '')
      }
    }
    S.finishMock(d.db, mockId, score, now)
  })
  return { score, review: asked.map(({ q, item }) => ({ questionId: q.id, subject: item.subject, stem: q.stem, choices: q.choices, answer: q.answer, picked: picks[q.id] ?? null, why: q.why, notes: q.notes })) }
}

export async function pairCardOf(d: CertDeps, bookId: number, a: number, b: number): Promise<CertPairCard | { error: string }> {
  const row = S.getPair(d.db, bookId, a, b), x = S.getItem(d.db, a), y = S.getItem(d.db, b)
  if (!row || !x || !y) return { error: t('쌍을 찾지 못했습니다') }
  let card = row.card
  if (!card) {
    const r = await runPair(d.ask, x, y)
    if (!r.ok) return { error: r.error.message }
    card = { diffs: r.diffs, common: r.common, questionIds: S.addQuestions(d.db, x.id, r.questions, 'pair') }
    S.setPairCard(d.db, bookId, a, b, card)
  }
  return { aTitle: x.title, bTitle: y.title, aBody: x.body.slice(0, 400), bBody: y.body.slice(0, 400), diffs: card.diffs, common: card.common, questions: card.questionIds.map(id => S.getQuestion(d.db, id)).filter(q => q !== null).map(q => ({ id: q.id, stem: q.stem, choices: q.choices })) }
}

export async function removeBook(d: CertDeps, bookId: number): Promise<void> {
  const file = S.deleteBook(d.db, bookId)
  if (file) await rm(file, { force: true })
}
