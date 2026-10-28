import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/main/db.ts'
import { insertProblem } from '../src/main/coding/problems.ts'
import { startAttempt, getAttempt, saveCode, saveStage, savePredicted, addRun, lastRun } from '../src/main/practice/attempts.ts'

function setup() {
  const db = openDb(':memory:')
  const p = insertProblem(db, { site: 'programmers', siteId: '1', url: 'u1', title: 't', html: '', examples: [], starter: {}, signature: null, siteLevel: 'Lv. 1', siteTags: [] })
  return { db, p }
}

test('시작하면 이어서 하던 시도를 돌려준다', () => {
  const { db, p } = setup()
  const a = startAttempt(db, p.id, 'python3')
  assert.equal(a.stage, 'understand')
  assert.equal(startAttempt(db, p.id, 'java').id, a.id)
})

test('코드 · 단계 · 예측 · 실행 저장', () => {
  const { db, p } = setup()
  const a = startAttempt(db, p.id, 'python3')
  saveCode(db, a.id, 'python3', 'x = 1')
  saveCode(db, a.id, 'java', 'class A {}')
  saveStage(db, a.id, 'implement', { understand: 1000 })
  saveStage(db, a.id, 'implement', { understand: 500, implement: 200 })
  savePredicted(db, a.id, '2')
  const r = { lang: 'python3' as const, compileError: null, unsupported: null, results: [], passed: true, aborted: false }
  addRun(db, a.id, r)
  const b = getAttempt(db, a.id)!
  assert.deepEqual(b.code, { python3: 'x = 1', java: 'class A {}' })
  assert.equal(b.lang, 'java')
  assert.equal(b.stage, 'implement')
  assert.deepEqual(b.stageMs, { understand: 1500, implement: 200 })
  assert.equal(b.predicted, '2')
  assert.equal(b.passed, true)
  assert.deepEqual(lastRun(db, a.id), r)
})
