import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plain } from '../src/shared/highlight.ts'

test('형광펜 벗기기 — 글자만 남기고(==글자|개념== · ==글자==) 공백은 하나로, 앞뒤는 잘라낸다', () => {
  assert.equal(plain('  ==나눠 읽기|청크== 로\n\n  ==멱등성== 을  지킨다 '), '나눠 읽기 로 멱등성 을 지킨다')
  assert.equal(plain('표시 없는 글'), '표시 없는 글')
  assert.equal(plain('a == b 는 같다'), 'a == b 는 같다') // 짝이 아닌 == 는 그대로
})
