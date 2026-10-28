import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passedTagCount } from '../src/shared/review.ts'

const rows = [
  { id: 1, classification: { tags: ['DP', '구현'] } },
  { id: 2, classification: { tags: ['DP'] } },
  { id: 3, classification: { tags: ['그래프'] } },
  { id: 4, classification: null }
]

test('태그 개수는 통과한 문제만', () => {
  const st = { 1: { kind: 'passed' }, 2: { kind: 'solving' }, 3: { kind: 'new' }, 4: { kind: 'mastered' } }
  assert.deepEqual(passedTagCount(rows, st), [['구현', 1], ['DP', 1]])
})
test('review · mastered 도 세고, 통과가 없으면 빈 목록', () => {
  assert.deepEqual(passedTagCount(rows, { 1: { kind: 'review' }, 2: { kind: 'mastered' } }), [['DP', 2], ['구현', 1]])
  assert.deepEqual(passedTagCount(rows, {}), [])
})
