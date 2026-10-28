import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guessStage } from '../src/shared/stage.ts'

const starter = 'def solution(a):\n    answer = 0\n    return answer'
const g = (code: string, runs: { passed: boolean }[] = [], manual = false) => guessStage({ code, starter, runs, current: 'plan', manual })

test('단계 판정', () => {
  assert.equal(g(starter), 'understand')
  assert.equal(g('  ' + starter + '\n'), 'understand')
  assert.equal(g(starter + '\n# 투 포인터로 양쪽에서 줄인다\n'), 'plan')
  assert.equal(g('def solution(a):\n    return sum(a)'), 'implement')
  assert.equal(g('def solution(a):\n    return 1', [{ passed: false }]), 'debug')
  assert.equal(g('def solution(a):\n    return 1', [{ passed: false }, { passed: true }]), 'reflect')
  assert.equal(g('def solution(a):\n    return 1', [{ passed: true }], true), 'plan')
})
