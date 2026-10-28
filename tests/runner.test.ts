import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runExamples } from '../src/main/practice/runner.ts'
import { execFileSync } from 'node:child_process'
import type { Problem } from '../src/shared/types.ts'

const has = (c: string) => { try { execFileSync('/bin/sh', ['-c', `command -v ${c}`]); return true } catch { return false } }
const py = { skip: !has('python3') }

const P: Problem = {
  id: 1, site: 'leetcode', siteId: 'two-sum', url: 'https://leetcode.com/problems/two-sum/', title: '1. Two Sum',
  html: '<p>You can return the answer in any order.</p>', starter: {}, siteLevel: 'Easy', siteTags: [], classification: null, createdAt: '',
  signature: { name: 'twoSum', params: [{ name: 'nums', type: { array: 'int' } }, { name: 'target', type: 'int' }], returns: { array: 'int' } },
  examples: [{ args: [[2, 7, 11, 15], 9], expected: [0, 1] }, { args: [[3, 2, 4], 6], expected: [1, 2] }]
}

test('통과 · 순서 무관 · 사용자 출력', py, async () => {
  const code = 'class Solution:\n    def twoSum(self, nums, target):\n        print("찾는 중")\n        d = {}\n        for i, x in enumerate(nums):\n            if target - x in d: return [i, d[target - x]]\n            d[x] = i'
  const r = await runExamples({ lang: 'python3', problem: P, code, timeoutMs: 3000 })
  assert.equal(r.passed, true)
  assert.deepEqual(r.results.map(x => x.status), ['pass', 'pass'])
  assert.equal(r.aborted, false)
  assert.equal(r.results[0].stdout, '찾는 중')
  assert.deepEqual(r.results[0].actual, [1, 0])
})

test('사용자가 마커를 출력해도 마지막 줄이 이긴다', py, async () => {
  const code = 'class Solution:\n    def twoSum(self, nums, target):\n        print("\\n__INKLINE__[9,9]")\n        return [0, 1]'
  const r = await runExamples({ lang: 'python3', problem: { ...P, examples: [P.examples[0]] }, code, timeoutMs: 3000 })
  assert.equal(r.results[0].status, 'pass')
  assert.match(r.results[0].stdout, /__INKLINE__\[9,9\]/)
})

test('실패 · 오류 · 시간 초과', py, async () => {
  const fail = await runExamples({ lang: 'python3', problem: P, code: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 0]', timeoutMs: 3000 })
  assert.deepEqual(fail.results.map(x => x.status), ['fail', 'fail'])
  assert.equal(fail.passed, false)
  const err = await runExamples({ lang: 'python3', problem: P, code: 'class Solution:\n    def twoSum(self, nums, target):\n        return nums[99]', timeoutMs: 3000 })
  assert.equal(err.results[0].status, 'error')
  assert.match(err.results[0].stderr, /IndexError/)
  const slow = await runExamples({ lang: 'python3', problem: P, code: 'class Solution:\n    def twoSum(self, nums, target):\n        while True: pass', timeoutMs: 300 })
  assert.deepEqual(slow.results.map(x => x.status), ['timeout', 'timeout'])
})

test('중단하면 남은 예제는 error', py, async () => {
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 300)
  const r = await runExamples({ lang: 'python3', problem: P, code: 'class Solution:\n    def twoSum(self, nums, target):\n        while True: pass', timeoutMs: 5000, signal: ac.signal })
  assert.equal(r.results.length, 2)
  assert.deepEqual(r.results.map(x => x.status), ['error', 'error'])
  assert.equal(r.results[1].stderr, '실행을 멈췄습니다')
  assert.equal(r.aborted, true)
  assert.equal(r.passed, false)
})

test('컴파일 오류', { skip: !has('javac') }, async () => {
  const r = await runExamples({ lang: 'java', problem: P, code: 'class Solution { public int[] twoSum(int[] nums, int target) { return nums } }', timeoutMs: 3000 })
  assert.match(r.compileError!, /error/)
  assert.deepEqual(r.results, [])
})

test('지원 안 함', async () => {
  const r = await runExamples({ lang: 'python3', problem: { ...P, signature: null }, code: '', timeoutMs: 3000 })
  assert.match(r.unsupported!, /함수 모양/)
})

test('출력이 너무 길면 잘라 낸다', py, async () => {
  const code = 'class Solution:\n    def twoSum(self, nums, target):\n        print("x" * 100000)\n        return [0, 1]'
  const r = await runExamples({ lang: 'python3', problem: { ...P, examples: [P.examples[0]] }, code, timeoutMs: 3000 })
  assert.ok(r.results[0].stdout.length <= 20100)
  assert.ok(r.results[0].stdout.endsWith('(출력이 너무 길어 잘랐습니다)'))
})

test('결과가 너무 크면 생략하되 판정은 먼저 한다', py, async () => {
  const code = 'class Solution:\n    def twoSum(self, nums, target):\n        return list(range(100000))'
  const r = await runExamples({ lang: 'python3', problem: { ...P, examples: [P.examples[0]] }, code, timeoutMs: 5000 })
  assert.equal(r.results[0].status, 'fail')
  assert.equal(r.results[0].actual, '(결과가 너무 커서 생략했습니다)')
})

const ONE: Problem = { ...P, site: 'programmers', html: '', signature: { name: 'solution', params: [{ name: 'a', type: 'int' }], returns: 'int' }, examples: [{ args: [1], expected: 1 }] }

test('C++ 비정상 종료(널 포인터)는 error, 앞서 찍은 출력은 남는다', { skip: !has('g++') }, async () => {
  const code = 'int solution(int a) {\n  cout << "before";\n  int* volatile p = nullptr;\n  return *p + a;\n}'
  const r = await runExamples({ lang: 'cpp', problem: ONE, code, timeoutMs: 3000 })
  assert.equal(r.results[0].status, 'error')
  assert.match(r.results[0].stderr, /비정상 종료 \(SIG/)
  assert.match(r.results[0].stdout, /before/)
})

const noTmp = (t: string) => assert.ok(!t.includes('/inkline-run-'), t)
test('Python 오류 줄 번호는 사용자 코드 기준, 임시 경로는 숨긴다', py, async () => {
  const r = await runExamples({ lang: 'python3', problem: ONE, code: 'def solution(a):\n    x = 1\n    return a // 0', timeoutMs: 3000 })
  assert.match(r.results[0].stderr, /solution\.py", line 3/)
  assert.doesNotMatch(r.results[0].stderr, /solution\.py", line (?!3\b)/) // 감싸는 코드 줄은 사용자 줄로 바꾸지 않는다
  noTmp(r.results[0].stderr)
})
test('JavaScript 오류 줄 번호', { skip: !has('node') }, async () => {
  const r = await runExamples({ lang: 'javascript', problem: ONE, code: 'function solution(a) {\n  const x = 1\n  return a.b.c\n}', timeoutMs: 3000 })
  assert.match(r.results[0].stderr, /solution\.js:3/)
  noTmp(r.results[0].stderr)
})
test('Java 컴파일 오류 줄 번호', { skip: !has('javac') }, async () => {
  const r = await runExamples({ lang: 'java', problem: ONE, code: 'import java.util.*;\nclass Solution {\n  public int solution(int a) { return a +; }\n}', timeoutMs: 3000 })
  assert.match(r.compileError!, /Solution\.java:3: error/)
  noTmp(r.compileError!)
})
test('Java 실행 오류 줄 번호', { skip: !has('javac') }, async () => {
  const r = await runExamples({ lang: 'java', problem: ONE, code: 'class Solution {\n  public int solution(int a) {\n    return a / 0;\n  }\n}', timeoutMs: 5000 })
  assert.match(r.results[0].stderr, /Solution\.java:3\)/)
})
test('C++ 컴파일 오류 줄 번호', { skip: !has('g++') }, async () => {
  const r = await runExamples({ lang: 'cpp', problem: ONE, code: 'int solution(int a) {\n  int x = 1;\n  return a +;\n}', timeoutMs: 3000 })
  assert.match(r.compileError!, /solution\.cpp:3:\d+: error/)
  noTmp(r.compileError!)
})

test('timeoutMs 는 1초 아래로 내려가지 않는다', py, async () => {
  const r = await runExamples({ lang: 'python3', problem: ONE, code: 'import time\ndef solution(a):\n    time.sleep(0.3)\n    return a', timeoutMs: 1 })
  assert.equal(r.results[0].status, 'pass')
})

test('출력이 1MB 를 넘어 결과 줄을 잃으면 알린다', py, async () => {
  const r = await runExamples({ lang: 'python3', problem: ONE, code: 'def solution(a):\n    for i in range(200000): print("debug line", i)\n    return 1', timeoutMs: 5000 })
  assert.equal(r.results[0].status, 'error')
  assert.match(r.results[0].stderr, /1MB 를 넘어/)
})
