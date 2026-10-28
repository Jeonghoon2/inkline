import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameResult, anyOrderHint } from '../src/main/practice/compare.ts'

test('깊은 비교와 실수 오차', () => {
  assert.equal(sameResult([1, [2, 3]], [1, [2, 3]], { anyOrder: false }), true)
  assert.equal(sameResult(0.1 + 0.2, 0.3, { anyOrder: false }), true)
  assert.equal(sameResult(2, 2.0000001, { anyOrder: false }), true)
  assert.equal(sameResult(3, 2, { anyOrder: false }), false)
  assert.equal(sameResult(null, [], { anyOrder: false }), false)
  assert.equal(sameResult('a', 'a', { anyOrder: false }), true)
})

test('순서 무관: 바깥 정렬, 안쪽 배열도 정렬', () => {
  assert.equal(sameResult([1, 0], [0, 1], { anyOrder: true }), true)
  assert.equal(sameResult([[2, -1, -1], [0, 1, -1]], [[-1, -1, 2], [-1, 0, 1]], { anyOrder: true }), true)
  assert.equal(sameResult([1, 0], [0, 1], { anyOrder: false }), false)
})

test('본문 힌트', () => {
  assert.equal(anyOrderHint('<p>You can return the answer in any order.</p>'), true)
  assert.equal(anyOrderHint('<p>답의 순서는 상관없습니다</p>'), true)
  assert.equal(anyOrderHint('<p>Return indices.</p>'), false)
})
