import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runApproaches } from '../src/main/theory/approach.ts'
import type { Problem, TheoryStage } from '../src/shared/types.ts'

const p = {
  id: 1, title: 'Two Sum', classification: { anyOrder: true, complexityNote: '' },
  html: '<p>정수 배열 nums 와 정수 target 이 주어집니다. 합이 target 인 두 수의 번호를 돌려줍니다.</p><p><strong>Constraints:</strong></p><ul><li>2 &lt;= nums.length &lt;= 10<sup>4</sup></li></ul>',
  signature: { name: 'twoSum', params: [{ name: 'nums', type: { array: 'int' } }, { name: 'target', type: 'int' }], returns: { array: 'int' } },
  examples: [{ args: [[2, 7, 11, 15], 9], expected: [0, 1] }]
} as unknown as Problem
const A = (name: string, key: string, complexity: string, clue: string) => ({ name, nature: 'algorithm', why: '단서가 이 개념을 부른다', complexity, clue, concepts: [{ key, name: key, nature: 'algorithm', tag: '' }] })
const okWrite = { approaches: [A('해시', 'hash-map', 'O(N)', '합이 target 인 두 수'), A('정렬 투 포인터', 'two-pointers', 'O(N log N)', '정수 배열 nums')] }
const fake = (answers: Record<string, unknown[]>, calls: string[]) => (async (task: string) => { calls.push(task); const v = answers[task]?.shift(); return v === undefined ? { ok: false, error: { code: 'cli-error', message: `없음 ${task}` } } : { ok: true, value: v } }) as never
const log = () => { const l: string[] = []; return { l, on: (s: TheoryStage) => l.push(`${s.stage}:${s.state}`) } }
const py = (outs: string[]) => async () => ({ ok: true as const, lines: [outs.shift() ?? '{"solve":"pass","brute":"ok"}'] })

test('흐름 — 단계 순서 · AI 호출(쓰기 → 검산) · 통과 표시', async () => {
  const calls: string[] = [], s = log()
  const r = await runApproaches({ problem: p, ask: fake({ 'approach-write': [okWrite], 'approach-check': [{ brute: 'def brute(nums, target):\n    return []', gen: 'def gen(rnd):\n    return [[1, 2], 3]', solves: ['def solve(nums, target):\n    return [0, 1]', 'def solve(nums, target):\n    return [0, 1]'] }] }, calls), runPy: py([]), stage: s.on, keys: [], similar: [] })
  assert.ok(r.ok)
  assert.deepEqual(calls, ['approach-write', 'approach-check'])
  assert.deepEqual(s.l.filter(x => x.endsWith(':on')).map(x => x.split(':')[0]), ['a-limits', 'a-similar', 'a-write', 'a-rules', 'a-exec'])
  assert.ok(r.ok && r.list.every(a => a.check?.status === 'pass'))
})

test('규칙으로 2개 미만이면 까닭을 붙여 한 번 더 쓴다', async () => {
  const calls: string[] = []
  const bad = { approaches: [A('해시', 'hash-map', 'O(N)', '없는 문장입니다'), A('이중', 'nested-loop', 'O(N^2)', '정수 배열 nums')] }
  const r = await runApproaches({ problem: p, ask: fake({ 'approach-write': [bad, okWrite], 'approach-check': [{ brute: 'def brute(nums, target):\n    return []', gen: 'def gen(rnd):\n    return [[1], 1]', solves: ['def solve(nums, target):\n    return []', 'def solve(nums, target):\n    return []'] }] }, calls), runPy: py([]), stage: () => {}, keys: [], similar: [] })
  assert.deepEqual(calls, ['approach-write', 'approach-write', 'approach-check'])
  assert.ok(r.ok && r.list.length === 2)
})

test('검산할 수 없는 문제는 AI 검산을 부르지 않고 확인 못 함', async () => {
  const calls: string[] = []
  const r = await runApproaches({ problem: { ...p, examples: [] } as Problem, ask: fake({ 'approach-write': [okWrite] }, calls), runPy: py([]), stage: () => {}, keys: [], similar: [] })
  assert.deepEqual(calls, ['approach-write'])
  assert.ok(r.ok && r.list.every(a => a.check?.status === 'unknown' && /예제/.test(a.check.why ?? '')))
})

test('검산 AI 가 실패해도 접근은 확인 못 함으로 남는다', async () => {
  const r = await runApproaches({ problem: p, ask: fake({ 'approach-write': [okWrite] }, []), runPy: py([]), stage: () => {}, keys: [], similar: [] })
  assert.ok(r.ok && r.list.length === 2 && r.list.every(a => a.check?.status === 'unknown'))
})

test('취소는 실패가 아니다 — aborted 로 끝낸다', async () => {
  const ask = (async () => ({ ok: false, error: { code: 'aborted', message: '취소했습니다' } })) as never
  const r = await runApproaches({ problem: p, ask, runPy: py([]), stage: () => {}, keys: [], similar: [] })
  assert.ok(!r.ok && r.error.code === 'aborted')
})

test('다시 쓰기 호출이 실패해도 앞 라운드의 1개로 검산까지 진행한다', async () => {
  const calls: string[] = []
  const one = { approaches: [A('해시', 'hash-map', 'O(N)', '합이 target 인 두 수'), A('이중', 'nested-loop', 'O(N^2)', '없는 문장입니다')] }
  const r = await runApproaches({ problem: p, ask: fake({ 'approach-write': [one], 'approach-check': [{ brute: 'def brute(nums, target):\n    return []', gen: 'def gen(rnd):\n    return [[1, 2], 3]', solves: ['def solve(nums, target):\n    return [0, 1]'] }] }, calls), runPy: py([]), stage: () => {}, keys: [], similar: [] })
  assert.deepEqual(calls, ['approach-write', 'approach-write', 'approach-check'])
  assert.ok(r.ok && r.list.length === 1 && r.list[0].check?.status === 'pass')
})
