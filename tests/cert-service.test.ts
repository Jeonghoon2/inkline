// tests/cert-service.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../src/main/db.ts'
import * as S from '../src/main/cert/store.ts'
import { answerQuestion, confirmBook, homeOf, importPdf, isScanned, nextCard, removeBook, segmentBook, startMock, submitMock, pairCardOf, type CertDeps } from '../src/main/cert/service.ts'
import type { Ask } from '../src/main/ai/run.ts'
import type { CertStage } from '../src/shared/cert.ts'

const now = new Date(2026, 9, 21, 15, 0)
const fx = async (t: string) => JSON.parse(await readFile(`tests/fixtures/ai/${t}.json`, 'utf8'))
const fakeAsk = (calls: string[] = []): Ask => (async (task: string) => { calls.push(task); return { ok: true, value: await fx(task) } }) as Ask
const deps = (calls: string[] = [], stages: CertStage[] = []): CertDeps => ({ db: openDb(':memory:'), ask: fakeAsk(calls), stage: s => { stages.push(s) }, cli: 'codex', model: 'm' })

test('스캔본 판정 — 글이 거의 없는 쪽이 80% 넘으면', () => {
  assert.equal(isScanned(['', ' ', 'a', '긴 글'.repeat(30), '', '']), true)
  assert.equal(isScanned(['긴 글'.repeat(30), '긴 글'.repeat(30)]), false)
})

test('가져오기 → 확인 → 항목 나누기 → 홈, 같은 PDF 는 다시 만들지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const calls: string[] = [], stages: CertStage[] = []
    const d = deps(calls, stages)
    const r = await importPdf(d, dir, 'tests/fixtures/cert/sample.pdf', now)
    assert.ok(r.ok && !r.existing)
    assert.ok((await stat(join(dir, 'certs'))).isDirectory())
    const b = S.getBook(d.db, r.bookId)!
    assert.deepEqual([b.name, b.kind, b.subjects, b.pages, b.status, b.confirmed], ['정보처리기사', '필기', ['소프트웨어 설계', '소프트웨어 개발'], 3, 'importing', false])
    assert.deepEqual(stages.filter(s => s.state === 'done').map(s => s.stage), ['import', 'classify'])
    assert.match(b.checkNote, /^판별 근거: p\.1/) // 근거는 확인 카드에, 과목은 교재 글에 있어 '찾지 못한 과목' 줄은 없다
    assert.doesNotMatch(b.checkNote, /찾지 못한 과목/)
    const again = await importPdf(d, dir, 'tests/fixtures/cert/sample.pdf', now)
    assert.deepEqual(again, { ok: true, bookId: r.bookId, existing: true })
    confirmBook(d, r.bookId, { name: '정보처리기사', kind: '필기', subjects: b.subjects, rules: b.rules, examDate: '2026-11-20' })
    const seg = await segmentBook(d, r.bookId)
    assert.deepEqual(seg, { ok: true, items: 4, unsplit: [] })
    // 항목 나누기 진행 알림은 [끝난 쪽, 전체 쪽] 을 싣는다 — 화면의 쪽 진행 막대
    const prog = stages.filter(s => s.stage === 'segment' && s.state === 'on' && s.progress).map(s => s.progress)
    assert.deepEqual(prog[0], [0, 3])
    assert.match(stages.filter(s => s.stage === 'segment' && s.state === 'on' && s.note).at(-1)!.note!, /^1~3쪽 읽는 중 · 항목 \d+개$/)
    assert.equal(S.getBook(d.db, r.bookId)!.status, 'ready')
    const items = S.itemsOf(d.db, r.bookId)
    assert.deepEqual(items.map(i => i.title), ['폭포수 모형', '나선형 모형', '화이트박스 테스트', '블랙박스 테스트'])
    assert.match(items[0]!.body.replace(/\s+/g, ''), /^폭포수모형은이전단계로.*이항목은시험에자주나온다\.$/)
    items.slice(0, -1).forEach((it, k) => assert.ok(!it.body.replace(/\s+/g, '').endsWith(items[k + 1]!.title.replace(/\s+/g, ''))))
    const h = homeOf(d, r.bookId, now)
    assert.deepEqual([h.fresh, h.due, h.daysLeft, h.subjects.map(s => s.total)], [4, 0, 30, [2, 2]])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

const ready = async (d: CertDeps, dir: string): Promise<number> => {
  const r = await importPdf(d, dir, 'tests/fixtures/cert/sample.pdf', now)
  if (!r.ok) throw new Error(r.error)
  const b = S.getBook(d.db, r.bookId)!
  confirmBook(d, r.bookId, { name: b.name, kind: b.kind, subjects: b.subjects, rules: b.rules, examDate: null })
  await segmentBook(d, r.bookId)
  return r.bookId
}

test('공부 — 출제 많은 항목부터, 자료를 만들고 답하면 채점 · 다음 복습 · 헷갈리는 쌍', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const calls: string[] = []
    const d = deps(calls)
    const id = await ready(d, dir)
    const n = await nextCard(d, id, null, now)
    assert.ok('card' in n)
    assert.equal(n.card.item.freq, 3) // 폭포수 모형(출제 3)
    assert.equal(n.card.kind, 'new')
    assert.ok(!('answer' in n.card)) // 정답은 카드에 싣지 않는다
    // 오답 — 픽스처 2번 문제의 헷갈리는 항목 보기 '나선형 모형' 을 고른다(늘 쌍이 올라간다)
    const q = S.questionsOf(d.db, n.card.item.id)[1]!
    const lure = q.choiceItems.indexOf('나선형 모형')
    assert.ok(lure >= 0 && lure !== q.answer)
    const fb = answerQuestion(d, q.id, lure, true, 'learn', now)
    assert.equal(fb.correct, false)
    assert.ok(fb.material?.explain)
    assert.equal(S.reviewsOf(d.db, id).find(r => r.itemId === fb.item.id)!.last, '몰랐음')
    assert.deepEqual(fb.pair, { title: '나선형 모형', count: 1 })
    assert.equal(S.wrongNote(d.db, id).length, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('모의 시험 — 문제가 모자라면 자료를 더 만들고, 채점 · 틀린 항목은 처음부터', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const d = deps()
    const id = await ready(d, dir)
    const paper = await startMock(d, id, now)
    assert.ok('mockId' in paper)
    assert.equal(paper.questions.length, 4) // 과목당 2문제(픽스처 rules.perSubject = 2)
    assert.equal(paper.minutes, 10)
    const picks = Object.fromEntries(paper.questions.map(q => [q.id, null]))
    const res = submitMock(d, paper.mockId, picks, now)
    assert.equal(res.score.passed, false)
    assert.ok(res.review.every(r => r.picked === null))
    assert.ok(S.reviewsOf(d.db, id).every(r => r.step === 0))
    const w = S.wrongNote(d.db, id)
    assert.ok(w.length > 0 && w.every(x => !x.sure)) // 모의 시험은 확실 여부를 묻지 않는다
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('쌍 비교 카드 — 한 번 만들면 다시 쓰고, 지우면 PDF 까지 없앤다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const calls: string[] = []
    const d = deps(calls)
    const id = await ready(d, dir)
    const [x, y] = S.itemsOf(d.db, id).slice(2).map(i => i.id)
    S.bumpPair(d.db, id, x!, y!)
    const c1 = await pairCardOf(d, id, x!, y!)
    assert.ok('diffs' in c1 && c1.questions.length === 2 && c1.aBody.length > 0 && c1.bBody.length > 0)
    await pairCardOf(d, id, x!, y!)
    assert.equal(calls.filter(t => t === 'cert-pair').length, 1)
    await removeBook(d, id)
    assert.equal(S.getBook(d.db, id), null)
    assert.equal((await stat(join(dir, 'certs'))).isDirectory(), true)
    assert.equal((await import('node:fs')).readdirSync(join(dir, 'certs')).length, 0)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

const AB = (): AbortController => new AbortController()
const failOnce = (calls: string[], task: string): Ask => {
  let left = 1
  return (async (t: string) => { calls.push(t); if (t === task && left-- > 0) return { ok: false, error: { code: 'timeout', message: '시간 초과' } }; return { ok: true, value: await fx(t) } }) as Ask
}

test('항목 나누기 — 실패한 묶음은 같은 실행에서 한 번 더, 취소는 시도로 세지 않고 묶음을 남긴다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const calls: string[] = []
    const d = deps(calls)
    d.ask = failOnce(calls, 'cert-segment')
    const r = await importPdf(d, dir, 'tests/fixtures/cert/sample.pdf', now)
    assert.ok(r.ok)
    const b = S.getBook(d.db, r.bookId)!
    confirmBook(d, r.bookId, { name: b.name, kind: b.kind, subjects: b.subjects, rules: b.rules, examDate: null })
    assert.deepEqual(await segmentBook(d, r.bookId), { ok: true, items: 4, unsplit: [] })
    assert.equal(calls.filter(t => t === 'cert-segment').length, 2)

    const ac = AB(), d2 = { ...deps(), signal: ac.signal }
    const r2 = await importPdf(d2, dir, 'tests/fixtures/cert/sample.pdf', now)
    assert.ok(r2.ok)
    d2.ask = (async (t: string) => { if (t === 'cert-segment') { ac.abort(); return { ok: false, error: { code: 'aborted', message: '취소했습니다' } } } return { ok: true, value: await fx(t) } }) as Ask
    assert.deepEqual(await segmentBook(d2, r2.bookId), { ok: false, error: '취소했습니다' })
    assert.ok(S.chunksOf(d2.db, r2.bookId).every(c => c.state === 'todo' && c.tries === 0))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('쌍 비교 문제만 있는 항목도 제 자료 · 문제를 만든다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const calls: string[] = []
    const d = deps(calls)
    const id = await ready(d, dir)
    const first = S.itemsOf(d.db, id).find(i => i.freq === 3)!
    S.addQuestions(d.db, first.id, (await fx('cert-pair')).questions, 'pair')
    const n = await nextCard(d, id, null, now)
    assert.ok('card' in n && n.card.item.id === first.id)
    assert.ok(calls.includes('cert-explain') && calls.includes('cert-write') && calls.includes('cert-blind'))
    assert.ok(S.getMaterial(d.db, first.id))
    assert.notEqual(S.getQuestion(d.db, n.card.questionId)!.origin, 'pair')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('간격 — 아직 때가 안 된 항목을 연달아 맞혀도 단계가 한 번만 오른다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const d = deps()
    const id = await ready(d, dir)
    const n = await nextCard(d, id, null, now)
    assert.ok('card' in n)
    const q = S.getQuestion(d.db, n.card.questionId)!
    const first = answerQuestion(d, q.id, q.answer, true, 'learn', now)
    const step = S.reviewsOf(d.db, id).find(r => r.itemId === q.itemId)!.step
    for (let k = 0; k < 2; k++) assert.equal(answerQuestion(d, q.id, q.answer, true, 'review', now).dueAt, first.dueAt)
    assert.equal(S.reviewsOf(d.db, id).find(r => r.itemId === q.itemId)!.step, step)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('취소 — 모의 시험 준비는 시험을 만들지 않고, 가져오기는 교재를 만들지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cert-'))
  try {
    const d = deps()
    const id = await ready(d, dir)
    const ac = AB(); ac.abort()
    assert.deepEqual(await startMock({ ...d, signal: ac.signal }, id, now), { error: '취소했습니다' })
    assert.equal((d.db.prepare('SELECT COUNT(*) AS n FROM cert_mocks').get() as { n: number }).n, 0)

    const dir2 = await mkdtemp(join(tmpdir(), 'cert-'))
    const ac2 = AB(), d2 = { ...deps(), signal: ac2.signal }
    d2.ask = (async () => { ac2.abort(); return { ok: false, error: { code: 'aborted', message: '취소했습니다' } } }) as Ask
    assert.deepEqual(await importPdf(d2, dir2, 'tests/fixtures/cert/sample.pdf', now), { ok: false, error: '취소했습니다' })
    assert.equal(S.listBooks(d2.db).length, 0)
    assert.deepEqual((await import('node:fs')).readdirSync(join(dir2, 'certs')), [])
    await rm(dir2, { recursive: true, force: true })
  } finally { await rm(dir, { recursive: true, force: true }) }
})
