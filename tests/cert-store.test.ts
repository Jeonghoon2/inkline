import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/main/db.ts'
import * as S from '../src/main/cert/store.ts'
import { DEFAULT_RULES, type NewQuestion } from '../src/shared/cert.ts'

const now = new Date(2026, 9, 21, 15, 0)
const nq = (stem: string, answer = 0): NewQuestion => ({ stem, choices: ['가', '나', '다', '라'], answer, why: 'w', notes: ['1', '2', '3', '4'], quote: 'q', choiceItems: ['', 'B', '', ''], refute: 'r' })
const setup = () => {
  const db = openDb(':memory:')
  const id = S.createBook(db, { name: '정보처리기사', kind: '필기', subjects: ['A', 'B'], rules: DEFAULT_RULES, pdfPath: '/x/a.pdf', sha256: 'abc', pages: 3, now })
  return { db, id }
}

test('책 — 만들기 · 해시로 찾기 · 고치기', () => {
  const { db, id } = setup()
  assert.equal(S.bookBySha(db, 'abc'), id)
  assert.equal(S.bookBySha(db, 'zzz'), null)
  const b = S.updateBook(db, id, { examDate: '2026-11-01', confirmed: true, subjects: ['A', 'B', 'C'] })
  assert.deepEqual([b.examDate, b.confirmed, b.subjects, b.status, b.rules.perSubject], ['2026-11-01', true, ['A', 'B', 'C'], 'importing', 20])
  assert.equal(S.listBooks(db).length, 1)
})

test('쪽 · 묶음 · 시작 위치(±20자 안 겹침은 하나로) · 본문', () => {
  const { db, id } = setup()
  S.putPages(db, id, ['p1', 'p2', 'p3'])
  assert.deepEqual(S.getPages(db, id), ['p1', 'p2', 'p3'])
  S.putChunks(db, id, [{ chunk: 0, from: 1, to: 3 }])
  S.setChunk(db, id, 0, 'done', true)
  assert.deepEqual(S.chunksOf(db, id), [{ chunk: 0, from: 1, to: 3, state: 'done', tries: 1 }])
  const a = { subject: 'A', title: '폭포수', freq: 2, freqNote: '24.7', anchor: '폭포수 모형은', pos: 100 }
  assert.equal(S.addAnchors(db, id, [a, { ...a, title: '나선형', pos: 500 }, { ...a, pos: 110 }]), 2)
  const anchors = S.anchorsOf(db, id)
  assert.deepEqual(anchors.map(x => x.pos), [100, 500])
  S.setBodies(db, anchors.map((x, i) => ({ id: x.id, body: `본문${i}`, pageFrom: 1, pageTo: 2, ord: i })))
  assert.deepEqual(S.itemsOf(db, id).map(i => [i.title, i.body, i.ord]), [['폭포수', '본문0', 0], ['나선형', '본문1', 1]])
})

test('자료 · 문제 · 채점 · 시도 · 오답 노트 · 쌍 · 지우기', () => {
  const { db, id } = setup()
  S.addAnchors(db, id, [{ subject: 'A', title: 'A1', freq: 0, freqNote: '', anchor: 'x', pos: 0 }, { subject: 'A', title: 'B', freq: 0, freqNote: '', anchor: 'y', pos: 50 }])
  const [i1, i2] = S.anchorsOf(db, id).map(x => x.id)
  S.putMaterial(db, i1!, { explain: 'e', mnemonic: '', confusions: [{ title: 'B', diff: 'd' }] }, 'codex', 'm', now)
  assert.deepEqual(S.getMaterial(db, i1!), { explain: 'e', mnemonic: '', confusions: [{ title: 'B', diff: 'd' }] })
  const [q1, q2] = S.addQuestions(db, i1!, [nq('물음1'), nq('물음2', 2)], 'item')
  assert.equal(S.questionsOf(db, i1!).length, 2)
  assert.equal(S.getQuestion(db, q2!)!.answer, 2)
  assert.equal(S.bookQuestions(db, id).length, 2)
  const r = S.gradeItem(db, i1!, '알았음', true, now, null)
  assert.deepEqual([r.step, r.right, r.wrong], [1, 1, 0])
  S.addAttempt(db, { questionId: q1!, picked: 1, correct: false, sure: true, mode: 'learn', now })
  S.addAttempt(db, { questionId: q2!, picked: 2, correct: true, sure: false, mode: 'learn', now })
  assert.deepEqual([...S.attemptCounts(db, id)].sort(), [[q1, 1], [q2, 1]])
  assert.equal(S.recentRate(db, id, 'A'), 50)
  const w = S.wrongNote(db, id)
  assert.deepEqual(w.map(x => [x.questionId, x.picked, x.sure, x.fixed]), [[q1, 1, true, false]])
  assert.equal(S.bumpPair(db, id, i2!, i1!), 1)
  assert.equal(S.bumpPair(db, id, i1!, i2!), 2)
  assert.deepEqual(S.pairsOf(db, id).map(p => [p.a, p.b, p.count, p.hasCard]), [[Math.min(i1!, i2!), Math.max(i1!, i2!), 2, false]])
  S.setPairCard(db, id, i1!, i2!, { diffs: ['1', '2', '3'], common: 'c', questionIds: [q1!] })
  assert.equal(S.getPair(db, id, i2!, i1!)!.card!.common, 'c')
  const m = S.createMock(db, id, [q1!, q2!], now)
  assert.deepEqual(S.getMock(db, m)!.questionIds, [q1, q2])
  S.finishMock(db, m, { subjects: [], avg: 0, passed: false }, now)
  assert.ok(S.getMock(db, m)!.finishedAt)
  assert.equal(S.deleteBook(db, id), '/x/a.pdf')
  assert.equal(S.getBook(db, id), null)
  assert.equal(S.itemsOf(db, id).length, 0)
})

test('tx — 던지면 되돌린다', () => {
  const { db, id } = setup()
  assert.throws(() => S.tx(db, () => { S.putPages(db, id, ['p1']); throw new Error('x') }))
  assert.deepEqual(S.getPages(db, id), [])
  assert.equal(S.tx(db, () => { S.putPages(db, id, ['p1']); return 1 }), 1)
  assert.deepEqual(S.getPages(db, id), ['p1'])
})
