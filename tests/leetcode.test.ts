import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLeetCode, type LeetQuestion } from '../src/main/coding/leetcode.ts'

const load = (n: string): LeetQuestion => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/leetcode', n), 'utf8'))

test('기본 정보', () => {
  const d = parseLeetCode(load('two-sum.json'))!
  assert.equal(d.title, '1. Two Sum')
  assert.equal(d.url, 'https://leetcode.com/problems/two-sum/')
  assert.equal(d.siteId, 'two-sum')
  assert.equal(d.siteLevel, 'Easy')
  assert.deepEqual(d.siteTags, ['Array', 'Hash Table'])
  assert.deepEqual(Object.keys(d.starter).sort(), ['cpp', 'java', 'javascript', 'python3'])
})

test('시그니처', () => {
  assert.deepEqual(parseLeetCode(load('two-sum.json'))!.signature, {
    name: 'twoSum',
    params: [{ name: 'nums', type: { array: 'int' } }, { name: 'target', type: 'int' }],
    returns: { array: 'int' }
  })
})

test('예제: 옛 <pre> 꼴과 새 example-io 꼴 모두', () => {
  assert.deepEqual(parseLeetCode(load('two-sum.json'))!.examples, [
    { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
    { args: [[3, 2, 4], 6], expected: [1, 2] }
  ])
})

test('설계형 문제는 시그니처 · 예제 없음', () => {
  const d = parseLeetCode(load('design.json'))!
  assert.equal(d.signature, null)
  assert.deepEqual(d.examples, [])
})

test('본문이 없으면(유료 · 로그인 필요) null', () => {
  assert.equal(parseLeetCode({ ...load('two-sum.json'), content: null, isPaidOnly: true }), null)
})

test('topicTags 가 null 이면 siteTags 는 빈 배열', () => {
  const q = { ...load('two-sum.json'), topicTags: null } as unknown as Parameters<typeof parseLeetCode>[0]
  assert.deepEqual(parseLeetCode(q)!.siteTags, [])
})

test('출력 매개변수 (return void + output.paramindex)', () => {
  const q = load('two-sum.json')
  q.metaData = '{"name":"rotate","params":[{"name":"nums","type":"integer[]"},{"name":"k","type":"integer"}],"return":{"type":"void"},"output":{"paramindex":0}}'
  const sig = parseLeetCode(q)!.signature!
  assert.equal(sig.outParam, 0)
  assert.equal(sig.returns, 'unknown')
})
