import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb, MIGRATIONS } from '../src/main/db.ts'
import { drillRows, gradeDrill } from '../src/main/drill/store.ts'
import { nextState, todayQueue, stats, type DrillRow } from '../src/shared/drill.ts'

const now = new Date(2026, 9, 20, 15, 30) // 로컬 시각
const day = (n: number): string => new Date(2026, 9, 20 + n).toISOString() // 로컬 자정
const C = (n: number) => ({ why: 'w', qs: Array.from({ length: n }, (_, i) => ({ q: `q${i}`, a: `a${i}` })) })
const row = (concept: string, q: number, step: number, dueAt: string): DrillRow => ({ concept, q, step, dueAt, last: '알았음', createdAt: day(-30) })

test('nextState', () => {
  assert.deepEqual(nextState(null, '알았음', now), { step: 1, dueAt: day(3) })
  assert.deepEqual(nextState({ step: 4 }, '알았음', now), { step: 4, dueAt: day(30) })
  assert.deepEqual(nextState({ step: 2 }, '헷갈림', now), { step: 2, dueAt: day(7) })
  assert.deepEqual(nextState(null, '헷갈림', now), { step: 0, dueAt: day(1) })
  assert.deepEqual(nextState({ step: 3 }, '몰랐음', now), { step: 0, dueAt: day(1) })
})

test('todayQueue: 기한 지난 것 먼저(오래된 순), 새 카드는 앞 질문을 알았음 한 뒤', () => {
  const concepts = { B: C(2), A: C(3), Z: C(2) }
  const rows = [row('A', 0, 1, day(-1)), row('B', 0, 0, day(-3)), row('Z', 0, 1, day(5))]
  assert.deepEqual(todayQueue(concepts, rows, now), [
    { concept: 'B', q: 0 }, { concept: 'A', q: 0 }, // 기한 지남, 오래된 순
    { concept: 'A', q: 1 }, { concept: 'Z', q: 1 } // B 는 q0 이 몰랐음(step 0)이라 q1 은 아직
  ])
})

test('todayQueue: 새 카드 한도 · 0번 질문은 늘 가능', () => {
  const concepts = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${String(i).padStart(2, '0')}`, C(1)]))
  const q = todayQueue(concepts, [], now)
  assert.equal(q.length, 10)
  assert.equal(q[0].concept, 'c00')
  assert.equal(todayQueue(concepts, [], now, Infinity).length, 12)
})

test('stats', () => {
  const concepts = { A: C(3), B: C(2) }
  const rows = [row('A', 0, 2, day(-1)), row('A', 1, 1, day(2))]
  assert.deepEqual(stats(concepts, rows, now), { due: 1, newAvailable: 2, learned: 1, total: 5 })
})

test('v9 drill 표 · gradeDrill', () => {
  assert.ok(MIGRATIONS.length >= 9)
  const db = openDb(':memory:')
  let r = gradeDrill(db, 'A', 0, '알았음', now)
  assert.deepEqual(r, [{ concept: 'A', q: 0, step: 1, dueAt: day(3), last: '알았음', createdAt: now.toISOString() }])
  r = gradeDrill(db, 'A', 0, '알았음', now)
  assert.equal(r[0].step, 2)
  r = gradeDrill(db, 'A', 0, '몰랐음', now)
  assert.equal(r.length, 1)
  assert.deepEqual([r[0].step, r[0].last, r[0].dueAt], [0, '몰랐음', day(1)])
  assert.equal(drillRows(db).length, 1)
})

test('새 카드 하루 한도 — 오늘 만든 행만 센다', () => {
  const concepts = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${String(i).padStart(2, '0')}`, C(1)]))
  const made = (n: number, at: Date): DrillRow[] => Array.from({ length: n }, (_, i) => ({ ...row(`c${String(i).padStart(2, '0')}`, 0, 1, day(5)), createdAt: at.toISOString() }))
  assert.equal(todayQueue(concepts, made(10, now), now).length, 0)
  assert.equal(stats(concepts, made(10, now), now).newAvailable, 0)
  assert.equal(todayQueue(concepts, made(4, now), now).length, 6)
  assert.equal(todayQueue(concepts, made(10, new Date(2026, 9, 19, 23, 59)), now).length, 10) // 어제 만든 것은 안 센다
})
