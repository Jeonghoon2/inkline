import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INTERVALS, nextReview, dueLabel, statusLabel, predictedRight, sortDue } from '../src/shared/review.ts'

const at = (y: number, m: number, d: number, h = 15) => new Date(y, m - 1, d, h)
const day = (iso: string) => { const d = new Date(iso); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()] }

test('간격 1 → 3 → 7 → 21 → 익힘', () => {
  assert.deepEqual(INTERVALS, [1, 3, 7, 21])
  const now = at(2026, 10, 19)
  const a = nextReview(null, true, now)
  assert.equal(a.step, 0); assert.deepEqual(day(a.dueAt), [2026, 10, 20, 0])
  const b = nextReview({ step: 0 }, true, now)
  assert.equal(b.step, 1); assert.deepEqual(day(b.dueAt), [2026, 10, 22, 0])
  assert.deepEqual(day(nextReview({ step: 1 }, true, now).dueAt), [2026, 10, 26, 0])
  assert.deepEqual(day(nextReview({ step: 2 }, true, now).dueAt), [2026, 11, 9, 0])
  assert.equal(nextReview({ step: 3 }, true, now).status, 'mastered')
})

test('실패 · 포기면 1일로 돌아간다', () => {
  const r = nextReview({ step: 2 }, false, at(2026, 10, 19))
  assert.equal(r.step, 0); assert.equal(r.status, 'due'); assert.deepEqual(day(r.dueAt), [2026, 10, 20, 0])
})

test('D-n 은 달력 날짜 차이', () => {
  const now = at(2026, 10, 19, 23)
  assert.equal(dueLabel(new Date(2026, 9, 20, 0).toISOString(), now), 'D-1')
  assert.equal(dueLabel(new Date(2026, 9, 19, 0).toISOString(), now), '오늘')
  assert.equal(dueLabel(new Date(2026, 9, 10, 0).toISOString(), now), '오늘')
  assert.equal(statusLabel({ kind: 'review', dueAt: new Date(2026, 9, 22).toISOString(), step: 1 }, now), '복습 D-3')
  assert.equal(statusLabel({ kind: 'mastered' }, now), '익힘')
  assert.equal(statusLabel({ kind: 'new' }, now), '')
})

test('예측 맞음 판정', () => {
  assert.equal(predictedRight(null, [0, 1]), null)
  assert.equal(predictedRight('[0, 1]', [0, 1]), true)
  assert.equal(predictedRight(' [0,1] ', [0, 1]), true)
  assert.equal(predictedRight('[1,0]', [0, 1]), false)
  assert.equal(predictedRight('abc', 'abc'), true)
  assert.equal(predictedRight('"abc"', 'abc'), true)
  assert.equal(predictedRight('3', 3), true)
})

test('오늘 복습 순서: 높은 힌트 먼저, 같으면 이른 날 먼저', () => {
  const it = (problemId: number, maxHint: number, dueAt: string) => ({ problemId, title: 't', dueAt, step: 0, maxHint })
  const out = sortDue([it(1, 2, '2026-10-19'), it(2, 6, '2026-10-19'), it(3, 2, '2026-10-18'), it(4, -1, '2026-10-01')])
  assert.deepEqual(out.map(x => x.problemId), [2, 3, 1, 4])
})
