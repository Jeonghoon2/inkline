import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/main/db.ts'
import { insertProblem } from '../src/main/coding/problems.ts'
import { listCases, addCase, removeCase, withCases, MAX_CASES } from '../src/main/practice/cases.ts'
import type { RunResult } from '../src/shared/types.ts'

const setup = () => {
  const db = openDb(':memory:')
  const p = insertProblem(db, { site: 'programmers', siteId: '1', url: 'u1', title: 't', html: '', examples: [{ args: [1, 2], expected: 3 }], starter: {}, signature: null, siteLevel: 'Lv. 1', siteTags: [] })
  return { db, p }
}

test('add · list · remove', () => {
  const { db, p } = setup()
  const c = addCase(db, p, [3, 4], 7, 'now')
  assert.deepEqual(listCases(db, p.id), [{ id: c.id, args: [3, 4], expected: 7 }])
  removeCase(db, c.id)
  assert.deepEqual(listCases(db, p.id), [])
})

test('검사 — 배열 · 인자 수 · 크기 · 개수', () => {
  const { db, p } = setup()
  assert.throws(() => addCase(db, p, 'x', 1, 'n'))
  assert.throws(() => addCase(db, p, [1], 1, 'n'), /2개/)
  assert.throws(() => addCase(db, p, [1, 2], undefined, 'n'))
  assert.throws(() => addCase(db, p, ['x'.repeat(70000), 1], 1, 'n'), /64KB/)
  for (let i = 0; i < MAX_CASES; i++) addCase(db, p, [i, 1], 1, 'n')
  assert.throws(() => addCase(db, p, [1, 1], 1, 'n'), /20개/)
})

test('withCases — 예제 뒤에 붙이고 내 예제 결과에만 표시', () => {
  const { db, p } = setup()
  const c = addCase(db, p, [3, 4], 7, 'n')
  const { merged, mark } = withCases(p, listCases(db, p.id))
  assert.equal(merged.examples.length, 2)
  const ex = { status: 'pass' as const, expected: 0, actual: 0, stdout: '', stderr: '', ms: 1 }
  const r = mark({ lang: 'python3', compileError: null, unsupported: null, passed: true, aborted: false, results: [{ ...ex, index: 0 }, { ...ex, index: 1 }] } as RunResult)
  assert.equal(r.results[0].custom, undefined)
  assert.deepEqual(r.results[1].custom, { id: c.id, args: [3, 4] })
})

test('마이그레이션 v8 — custom_cases 표', () => {
  const db = openDb(':memory:')
  const cols = (db.prepare('PRAGMA table_info(custom_cases)').all() as { name: string }[]).map(c => c.name)
  assert.deepEqual(cols, ['id', 'problem_id', 'args', 'expected', 'created_at'])
})
