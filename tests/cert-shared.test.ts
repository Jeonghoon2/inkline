import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gradeOf, nextReview, masteryOf, studyQueue, subjectMastery, pickMock, scoreMock, daysLeft, DEFAULT_RULES, type CertItem, type CertQuestion, type CertReview } from '../src/shared/cert.ts'

const now = new Date(2026, 9, 21, 15, 0) // 로컬 10.21 15시
const day = (n: number): string => new Date(2026, 9, 21 + n).toISOString() // 로컬 자정
const item = (id: number, subject: string, freq: number, ord: number): CertItem => ({ id, bookId: 1, subject, title: `t${id}`, freq, freqNote: '', pageFrom: 1, pageTo: 1, body: 'b', ord })
const rev = (itemId: number, step: number, dueAt: string, last: CertReview['last'] = '알았음'): CertReview => ({ itemId, step, dueAt, last, right: 1, wrong: 0 })
const q = (id: number, itemId: number, answer = 0): CertQuestion => ({ id, itemId, stem: `q${id}`, choices: ['a', 'b', 'c', 'd'], answer, why: '', notes: ['', '', '', ''], quote: '', choiceItems: ['', '', '', ''], refute: '', origin: 'item' })

test('채점 — 맞음 + 확실 = 알았음, 맞음 + 애매 = 헷갈림, 틀림 = 몰랐음', () => {
  assert.equal(gradeOf(true, true), '알았음')
  assert.equal(gradeOf(true, false), '헷갈림')
  assert.equal(gradeOf(false, true), '몰랐음')
})

test('간격 — 시험일이 없으면 드릴과 같고, 있으면 남은 날의 20%(최소 1일)로 자른다', () => {
  assert.deepEqual(nextReview({ step: 3 }, '알았음', now, null), { step: 4, dueAt: day(30) })
  assert.equal(daysLeft(now, '2026-10-31'), 10)
  assert.deepEqual(nextReview({ step: 3 }, '알았음', now, '2026-10-31'), { step: 4, dueAt: day(2) }) // ⌊10 × 0.2⌋ = 2
  assert.deepEqual(nextReview({ step: 3 }, '알았음', now, '2026-10-24'), { step: 4, dueAt: day(1) }) // ⌊0.6⌋ = 0 → 1
  assert.deepEqual(nextReview(null, '몰랐음', now, '2026-10-31'), { step: 0, dueAt: day(1) })
  assert.deepEqual(nextReview({ step: 3 }, '알았음', now, '2026-10-22'), { step: 4, dueAt: day(1) }) // 시험 내일 → 내일
  assert.deepEqual(nextReview({ step: 3 }, '알았음', now, '2026-10-21'), { step: 4, dueAt: day(1) }) // 시험 오늘 → 내일
  assert.deepEqual(nextReview({ step: 3 }, '알았음', now, '2026-10-01'), { step: 4, dueAt: day(30) }) // 지난 시험은 무시
  assert.equal(daysLeft(now, '2026/10/31'), null)
})

test('숙달도 — 못 봄 · 배우는 중(단계 0~2) · 익힘(단계 3 이상, 마지막이 몰랐음 아님)', () => {
  assert.equal(masteryOf(undefined), 'unseen')
  assert.equal(masteryOf(rev(1, 2, day(1))), 'learning')
  assert.equal(masteryOf(rev(1, 3, day(1))), 'mastered')
  assert.equal(masteryOf(rev(1, 3, day(1), '몰랐음')), 'learning')
  const s = subjectMastery(['A', 'B'], [item(1, 'A', 0, 1), item(2, 'A', 0, 2), item(3, 'B', 0, 3)], [rev(1, 3, day(1)), rev(2, 0, day(1))])
  assert.deepEqual(s, [{ subject: 'A', total: 2, mastered: 1, learning: 1, unseen: 0 }, { subject: 'B', total: 1, mastered: 0, learning: 0, unseen: 1 }])
})

test('공부 순서 — 복습(밀린 순) 먼저, 새 항목은 출제 많은 순 · 같으면 교재 순, 과목 거르기, 헷갈리는 쌍은 이어서', () => {
  const items = [item(1, 'A', 0, 1), item(2, 'A', 5, 2), item(3, 'A', 5, 3), item(4, 'B', 9, 4), item(5, 'A', 0, 5)]
  const reviews = [rev(1, 1, day(-2)), rev(5, 1, day(-1))]
  assert.deepEqual(studyQueue(items, reviews, now).map(e => `${e.kind}:${e.itemId}`), ['review:1', 'review:5', 'new:4', 'new:2', 'new:3'])
  assert.deepEqual(studyQueue(items, reviews, now, { subject: 'B' }).map(e => e.itemId), [4])
  assert.deepEqual(studyQueue(items, reviews, now, { pairs: [[1, 3]] }).map(e => e.itemId), [1, 3, 5, 4, 2])
  assert.deepEqual(studyQueue(items, [rev(1, 1, day(1))], now).map(e => e.itemId), [4, 2, 3, 5]) // 기한 전 복습은 오늘 없음
})

test('모의 시험 고르기 — 안 푼 문제 먼저, 출제 많은 항목 먼저, 한 항목에서 2문제까지, 모자란 수', () => {
  const items = [item(1, 'A', 5, 1), item(2, 'A', 1, 2), item(3, 'B', 0, 3)]
  const qs = [q(11, 1), q(12, 1), q(13, 1), q(14, 2), q(15, 3)]
  const p = pickMock({ subjects: ['A', 'B'], rules: { ...DEFAULT_RULES, perSubject: 2 }, items, questions: qs, seen: new Set([11]), rand: () => 0 })
  assert.deepEqual(p.questionIds, [12, 13, 15])
  assert.deepEqual(p.short, [{ subject: 'B', missing: 1 }])
})

test('모의 시험 채점 — 과목 점수(100점 환산) · 평균 · 과락 · 합격', () => {
  const asked = [{ questionId: 12, subject: 'A', answer: 0 }, { questionId: 13, subject: 'A', answer: 1 }, { questionId: 15, subject: 'B', answer: 2 }]
  const rules = { ...DEFAULT_RULES, minSubject: 40, minAvg: 60 }
  const ok = scoreMock({ subjects: ['A', 'B'], rules, asked, picks: { 12: 0, 13: 0, 15: 2 } })
  assert.deepEqual(ok.subjects.map(s => [s.subject, s.right, s.total, s.score, s.failed]), [['A', 1, 2, 50, false], ['B', 1, 1, 100, false]])
  assert.equal(ok.avg, 75)
  assert.equal(ok.passed, true)
  const bad = scoreMock({ subjects: ['A', 'B'], rules, asked, picks: { 12: 1, 13: 0, 15: 2 } })
  assert.equal(bad.subjects[0]!.failed, true)
  assert.equal(bad.passed, false) // 평균 50 · 과락
  assert.equal(scoreMock({ subjects: ['A', 'B'], rules, asked: asked.slice(0, 2), picks: { 12: 0, 13: 1 } }).passed, false) // 문제가 없는 과목이 있으면 합격 아님
})
