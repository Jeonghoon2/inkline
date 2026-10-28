import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkParsons, movePiece, shuffleOrder } from '../src/shared/parsons.ts'

const blocks = ['a', '  b', '  b', 'c'], dis = ['x']
test('섞기: 같은 씨앗은 같은 순서, 모든 조각 하나씩', () => {
  assert.deepEqual(shuffleOrder(5, 7), shuffleOrder(5, 7))
  assert.deepEqual([...shuffleOrder(5, 7)].sort(), [0, 1, 2, 3, 4])
})
test('확인', () => {
  assert.deepEqual(checkParsons([0, 1, 2, 3], blocks, dis), { ok: true })
  assert.deepEqual(checkParsons([0, 2, 1, 3], blocks, dis), { ok: true }) // 글자가 같은 줄
  assert.deepEqual(checkParsons([0, 3, 1, 2], blocks, dis), { ok: false, kind: 'mismatch', pos: 2 })
  assert.deepEqual(checkParsons([0, 1], blocks, dis), { ok: false, kind: 'mismatch', pos: 3 })
  assert.deepEqual(checkParsons([0, 4, 1, 2, 3], blocks, dis), { ok: false, kind: 'distractor' })
})

test('movePiece', () => {
  assert.deepEqual(movePiece([0, 1, 2, 3], 0, 3), [1, 2, 0, 3]) // 아래로
  assert.deepEqual(movePiece([0, 1, 2, 3], 3, 1), [0, 3, 1, 2]) // 위로
  assert.deepEqual(movePiece([0, 1, 2], 1, 1), [0, 1, 2]) // 제자리
  assert.deepEqual(movePiece([0, 1, 2], 0, null), [1, 2, 0]) // 맨 뒤
  assert.deepEqual(movePiece([0, 1], 4, 1), [0, 4, 1]) // 조각 칸에서
})
