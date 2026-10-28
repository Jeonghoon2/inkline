import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSelfExplain } from '../src/main/tutor/gate.ts'
import { nextLevel } from '../src/shared/hintLevel.ts'
import type { Hint } from '../src/shared/types.ts'

const h = (level: number): Hint => ({ id: level + 1, attemptId: 1, level: level as Hint['level'], body: { kind: 'text', text: 't' }, selfExplain: null, at: '' })

test('다음 단계는 받은 힌트 수, 7개 다음은 없음', () => {
  assert.equal(nextLevel([]), 0)
  assert.equal(nextLevel([h(0), h(1), h(2)]), 3)
  assert.equal(nextLevel([0, 1, 2, 3, 4, 5, 6].map(h)), null)
})

test('L3 부터 자기설명 5자 이상 500자 이하', () => {
  assert.equal(checkSelfExplain(2, null), null)
  assert.match(checkSelfExplain(3, '  ab ')!, /5자 이상/)
  assert.equal(checkSelfExplain(3, '합을 비교해야 해서'), null)
  assert.match(checkSelfExplain(6, 'x'.repeat(501))!, /500자/)
})

test('자기설명 경계: 5자 · 500자는 통과', () => {
  assert.equal(checkSelfExplain(3, '12345'), null)
  assert.notEqual(checkSelfExplain(3, '1234'), null)
  assert.equal(checkSelfExplain(3, 'x'.repeat(500)), null)
})
