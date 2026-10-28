// tests/approach-rules.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validate } from '../src/main/ai/schema.ts'
import { APPROACHES_SCHEMA, approachesPrompt, clueFound, ruleCheck } from '../src/main/theory/approach.ts'
import { cleanApproaches } from '../src/main/theory/prompts.ts'
import type { Approach, Problem } from '../src/shared/types.ts'

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/ai/${n}.json`, import.meta.url), 'utf8'))
const prob = { id: 1, title: 'Two Sum', html: '<p>정수 배열 nums 와 target 이 주어집니다. 같은 원소를 두 번 쓸 수 없습니다.</p>', classification: { tags: ['해시'], nature: 'hybrid', complexityNote: 'N ≤ 10^4', difficulty: 1, anyOrder: true } } as unknown as Problem
const LIM = { lines: ['2 <= nums.length <= 10^4'], n: 10000, allowed: 'O(N log N)' as const, source: 'text' as const, note: '' }
const ap = (name: string, keys: string[], complexity: Approach['complexity'], clue: string): Approach =>
  ({ name, nature: 'algorithm', why: '단서', concepts: keys.map(k => ({ key: k, name: k, nature: 'algorithm', tag: '' })), complexity, clue })

test('가짜 응답은 새 스키마를 지킨다', () => {
  assert.equal(validate(fx('approach-write'), APPROACHES_SCHEMA), null)
})

test('프롬프트 — 제약 줄 · 허용 복잡도를 따로, 태그는 주지 않는다, 절차 금지, 비슷한 문제', () => {
  const t = approachesPrompt(prob, { keys: ['hash-map'], limits: LIM, similar: [{ title: '두 수의 합 II', approach: '해시로 짝 찾기' }] })
  assert.ok(t.includes('2 <= nums.length <= 10^4') && t.includes('O(N log N)'))
  assert.ok(!t.includes('태그'))
  assert.ok(t.includes('절차'))
  assert.ok(t.includes('두 수의 합 II'))
  assert.ok(t.includes('hash-map'))
  assert.ok(approachesPrompt(prob, { keys: [], limits: { ...LIM, lines: [], n: null, allowed: null, source: 'ai', note: 'N ≤ 10^4' }, similar: [] }).includes('N ≤ 10^4'))
  assert.ok(approachesPrompt(prob, { keys: [], limits: LIM, similar: [], issues: ['단서가 원문에 없음: x'] }).includes('단서가 원문에 없음'))
})

test('단서 대조 — 공백 · 문장부호를 무시하고 그대로 있어야', () => {
  assert.ok(clueFound('같은 원소를 두 번 쓸 수 없습니다', prob.html.replace(/<[^>]+>/g, '')))
  assert.ok(clueFound('같은 원소를  두번 쓸 수 없습니다.', '같은 원소를 두 번 쓸 수 없습니다'))
  assert.ok(!clueFound('정렬되어 있습니다', '정수 배열 nums'))
  assert.ok(!clueFound('', '아무 글'))
})

test('규칙 — 단서 없음 · 허용보다 느림 · 같은 개념 묶음 · 같은 이름을 뺀다', () => {
  const text = '정수 배열 nums 와 target 이 주어집니다. 같은 원소를 두 번 쓸 수 없습니다.'
  const r = ruleCheck([
    ap('해시', ['hash-map'], 'O(N)', '정수 배열 nums 와 target'),
    ap('이중 반복', ['brute'], 'O(N^2)', '정수 배열 nums'),
    ap('해시 2', ['hashmap'], 'O(N)', '같은 원소를 두 번 쓸 수 없습니다'),
    ap('정렬', ['sorting', 'two-pointers'], 'O(N log N)', '없는 문장'),
    ap('해시', ['sorting'], 'O(N log N)', '정수 배열 nums')
  ], { text, allowed: 'O(N log N)' })
  assert.deepEqual(r.list.map(a => a.name), ['해시'])
  assert.equal(r.dropped.length, 4)
  assert.ok(r.dropped.some(d => d.includes('O(N^2)')))
  assert.ok(r.dropped.some(d => d.includes('단서')))
})

test('허용 복잡도를 모르면 복잡도로 빼지 않는다', () => {
  const r = ruleCheck([ap('a', ['x-a'], 'O(N^2)', 'nums'), ap('b', ['x-b'], 'O(N!)', 'nums')], { text: 'nums', allowed: null })
  assert.equal(r.list.length, 2)
})

test('cleanApproaches — 복잡도 · 단서 보존, key · 태그 정규화, min 으로 개수 하한', () => {
  const raw = { approaches: [
    { name: 'a', nature: 'algorithm', why: '단서', complexity: 'O(N)', clue: '원문', concepts: [{ key: 'bfs', name: '너비', nature: 'algorithm', tag: '' }] }
  ] }
  assert.equal(cleanApproaches(raw), null)
  const one = cleanApproaches(raw, 1)!
  assert.deepEqual([one[0].complexity, one[0].clue, one[0].concepts[0].key, one[0].concepts[0].tag], ['O(N)', '원문', 'breadth-first-search', 'BFS'])
  const bad = cleanApproaches({ approaches: [{ ...raw.approaches[0], complexity: '빠름' }] }, 1)!
  assert.equal(bad[0].complexity, undefined)
})
