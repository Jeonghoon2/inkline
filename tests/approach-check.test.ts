import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validate } from '../src/main/ai/schema.ts'
import { CHECK_SCHEMA, checkable, checkRun, parseRun, judge } from '../src/main/theory/approach.ts'
import { canSandbox, runPy } from '../src/main/theory/sandbox.ts'
import type { Approach, Problem } from '../src/shared/types.ts'

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/ai/${n}.json`, import.meta.url), 'utf8'))
const two = {
  id: 1, title: 'Two Sum', html: '', classification: { anyOrder: true },
  signature: { name: 'twoSum', params: [{ name: 'nums', type: { array: 'int' } }, { name: 'target', type: 'int' }], returns: { array: 'int' } },
  examples: [{ args: [[2, 7, 11, 15], 9], expected: [0, 1] }, { args: [[3, 2, 4], 6], expected: [1, 2] }]
} as unknown as Problem
const A = (name: string): Approach => ({ name, nature: 'algorithm', why: 'w', concepts: [{ key: 'hash-map', name: '해시', nature: 'datastructure', tag: '해시' }] })

test('가짜 응답은 검산 스키마를 지킨다', () => {
  assert.equal(validate(fx('approach-check'), CHECK_SCHEMA), null)
})

test('검산할 수 없는 문제는 까닭', () => {
  assert.equal(checkable(two), null)
  assert.match(checkable({ ...two, signature: null } as Problem)!, /함수 모양/)
  assert.match(checkable({ ...two, examples: [] } as Problem)!, /예제/)
  const node = { ...two, signature: { ...two.signature!, returns: 'ListNode' } } as Problem
  assert.match(checkable(node)!, /ListNode|TreeNode/)
})

test('순서 상관없음 — 분류가 없으면 문제 글로 짐작한다(풀이 실행과 같은 규칙)', () => {
  const any = (html: string, classification: Problem['classification']) => checkRun({ ...two, html, classification } as Problem, 0).postlude
  assert.match(any('<p>You can return the answer in any order.</p>', null), /_ANY = True/)
  assert.match(any('<p>Return the indices.</p>', null), /_ANY = False/)
  assert.match(any('<p>any order</p>', { anyOrder: false } as Problem['classification']), /_ANY = False/) // 분류가 있으면 분류를 따른다
})

test('실행 결과 읽기', () => {
  assert.deepEqual(parseRun(['잡음', '{"solve":"pass","brute":"ok"}']), { solve: 'pass', brute: 'ok' })
  assert.equal(parseRun(['없음']), null)
})

test('판정 — 통과가 있으면 틀림은 뺀다, 모두 틀림이면 확인 못 함으로 낮춘다', () => {
  const ok = judge([A('a'), A('b'), A('c')], [{ solve: 'pass', brute: 'ok' }, { solve: 'fail', brute: 'ok', ex: { args: [[1], 1], expected: [0, 0] } }, { error: '시간 초과' }])
  assert.deepEqual(ok.list.map(a => [a.name, a.check?.status]), [['a', 'pass'], ['c', 'unknown']])
  assert.equal(ok.fails[0].name, 'b')
  const none = judge([A('a'), A('b')], [{ solve: 'fail', brute: 'ok' }, { solve: 'fail', brute: 'bad' }])
  assert.deepEqual(none.list.map(a => a.check?.status), ['unknown', 'unknown'])
})

test('실제 격리 실행 — 맞는 풀이는 통과, 틀린 풀이는 반례', { skip: !canSandbox() }, async () => {
  const brute = 'def brute(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []'
  // 2의 거듭제곱끼리의 합은 짝마다 달라 답이 하나로 정해진다(답이 여럿이면 brute 와 해시 풀이가 다른 짝을 낼 수 있다)
  const gen = 'def gen(rnd):\n    n = rnd.randint(2, 6)\n    nums = [2 ** k for k in rnd.sample(range(20), n)]\n    i, j = rnd.sample(range(n), 2)\n    return [nums, nums[i] + nums[j]]'
  const good = 'def solve(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n    return []'
  const bad = 'def solve(nums, target):\n    return [0, 1]'
  for (const [code, want] of [[good, 'pass'], [bad, 'fail']] as const) {
    const run = checkRun(two, 0)
    const r = await runPy([brute, gen, code].join('\n\n'), { ...run, maxCode: 8000, timeoutMs: 15000 })
    assert.ok(r.ok, r.ok ? '' : r.error)
    assert.equal(parseRun(r.lines)?.solve, want)
  }
})

const mz = {
  id: 2, title: 'Move Zeroes', html: '', classification: {},
  signature: { name: 'moveZeroes', params: [{ name: 'nums', type: { array: 'int' } }], returns: 'unknown', outParam: 0 },
  examples: [{ args: [[0, 1, 0, 3, 12]], expected: [1, 3, 12, 0, 0] }]
} as unknown as Problem

test('제자리 고치는 문제도 검산할 수 있다', () => {
  assert.equal(checkable(mz), null)
})

test('실제 격리 실행 — 제자리 고치는 풀이는 그 매개변수를 결과로 읽는다', { skip: !canSandbox() }, async () => {
  const brute = 'def brute(nums):\n    z = [x for x in nums if x == 0]\n    r = [x for x in nums if x != 0] + z\n    for i in range(len(nums)):\n        nums[i] = r[i]'
  const gen = 'def gen(rnd):\n    return [[rnd.randint(0, 2) for _ in range(rnd.randint(1, 6))]]'
  const good = 'def solve(nums):\n    j = 0\n    for i in range(len(nums)):\n        if nums[i] != 0:\n            nums[j], nums[i] = nums[i], nums[j]\n            j += 1'
  const bad = 'def solve(nums):\n    nums.reverse()'
  for (const [code, want] of [[good, 'pass'], [bad, 'fail']] as const) {
    const r = await runPy([brute, gen, code].join('\n\n'), { ...checkRun(mz, 0), maxCode: 8000, timeoutMs: 15000 })
    assert.ok(r.ok, r.ok ? '' : r.error)
    assert.equal(parseRun(r.lines)?.solve, want)
  }
})

test('판정 — 오류 문구는 마지막 예외 줄만 남겨 코드가 새지 않는다', () => {
  const r = judge([A('a')], [{ error: '  File "main.py", line 3\n    return [secret_ref[5], 3]\nIndexError: list index out of range' }])
  const why = r.list[0].check?.why ?? ''
  assert.match(why, /IndexError/)
  assert.doesNotMatch(why, /secret_ref/)
})

test('실제 격리 실행 — List 주석이 붙은 풀이도 통과', { skip: !canSandbox() }, async () => {
  const brute = 'def brute(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []'
  const gen = 'def gen(rnd):\n    return [[2, 7, 11, 15], 9]'
  const solve = 'def solve(nums: List[int], target: int) -> List[int]:\n    seen: Dict[int, int] = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n    return []'
  const r = await runPy([brute, gen, solve].join('\n\n'), { ...checkRun(two, 0), maxCode: 8000, timeoutMs: 15000 })
  assert.ok(r.ok, r.ok ? '' : r.error)
  assert.equal(parseRun(r.lines)?.solve, 'pass')
})
