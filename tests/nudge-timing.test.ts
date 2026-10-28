import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nudgeDue, countedMs } from '../src/shared/nudgeTiming.ts'

const b = { openedAt: 1000, lastActivity: 1000, quietMs: 5000, idleMs: 2000, hidden: false }

test('넛지 시점', () => {
  assert.equal(nudgeDue({ ...b, now: 5999 }), false) // 쉬는 시간 안
  assert.equal(nudgeDue({ ...b, now: 6000 }), true)
  assert.equal(nudgeDue({ ...b, now: 7000, lastActivity: 6000 }), false) // 활동 뒤 idle 전
  assert.equal(nudgeDue({ ...b, now: 8000, lastActivity: 6000 }), true)
  assert.equal(nudgeDue({ ...b, now: 9000, hidden: true }), false)
})

test('단계 시계는 멈춤 뒤를 세지 않는다', () => {
  assert.equal(countedMs({ since: 0, now: 1000, lastActivity: 900, idleMs: 2000 }), 1000)
  assert.equal(countedMs({ since: 0, now: 10_000, lastActivity: 1000, idleMs: 2000 }), 3000)
  assert.equal(countedMs({ since: 5000, now: 10_000, lastActivity: 1000, idleMs: 2000 }), 0)
})

test('활동 사이 멈춤은 이전 활동 기준으로 끊어 센다', () => {
  assert.equal(countedMs({ since: 0, now: 40_000, lastActivity: 0, idleMs: 10_000 }), 10_000)
  assert.equal(countedMs({ since: 40_000, now: 45_000, lastActivity: 40_000, idleMs: 10_000 }), 5_000)
})
