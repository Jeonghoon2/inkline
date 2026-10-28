import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeEntities, parseLiteral } from '../src/main/coding/literal.ts'
import { javaType, leetType } from '../src/main/coding/types.ts'

test('엔티티 풀기', () => {
  assert.equal(decodeEntities('&lt;a&gt; &amp; &quot;x&quot; &#39;y&#39;&nbsp;&#65;&#x42;'), '<a> & "x" \'y\' AB')
})

test('예제 칸 → 값', () => {
  assert.deepEqual(parseLiteral(' [3, 2, 7, 2] '), [3, 2, 7, 2])
  assert.deepEqual(parseLiteral('[["a", "b"], ["c"]]'), [['a', 'b'], ['c']])
  assert.equal(parseLiteral('-1'), -1)
  assert.equal(parseLiteral('"hello"'), 'hello')
  assert.deepEqual(parseLiteral("['x', 'y']"), ['x', 'y'])
  assert.equal(parseLiteral('true'), true)
  assert.equal(parseLiteral('abc def'), 'abc def')
})

test('Java 타입', () => {
  assert.equal(javaType('int'), 'int')
  assert.deepEqual(javaType('int[]'), { array: 'int' })
  assert.deepEqual(javaType('String[][]'), { array: { array: 'string' } })
  assert.equal(javaType('boolean'), 'bool')
  assert.equal(javaType('Map<String,Integer>'), 'unknown')
})

test('LeetCode 타입', () => {
  assert.deepEqual(leetType('integer[]'), { array: 'int' })
  assert.deepEqual(leetType('list<list<integer>>'), { array: { array: 'int', list: true }, list: true })
  assert.equal(leetType('character'), 'char')
  assert.equal(leetType('ListNode'), 'ListNode')
  assert.equal(leetType('void'), 'unknown')
})
