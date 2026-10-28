import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/main/db.ts'
import { insertProblem } from '../src/main/coding/problems.ts'
import { startAttempt } from '../src/main/practice/attempts.ts'
import { addHint, listHints, setStageAnswer, addMistake, hasMistake, listMistakes, mistakesByType } from '../src/main/tutor/store.ts'

function setup() {
  const db = openDb(':memory:')
  const p = insertProblem(db, { site: 'programmers', siteId: '1', url: 'u1', title: '두 큐', html: '', examples: [], starter: {}, signature: null, siteLevel: 'Lv. 2', siteTags: [] })
  const q = insertProblem(db, { site: 'leetcode', siteId: 'x', url: 'u2', title: 'Two Sum', html: '', examples: [], starter: {}, signature: null, siteLevel: 'Easy', siteTags: [] })
  return { db, p, q, a: startAttempt(db, p.id, 'python3'), b: startAttempt(db, q.id, 'python3') }
}

test('힌트 저장 · 순서 · L0 답', () => {
  const { db, a } = setup()
  const h0 = addHint(db, a.id, 0, { kind: 'stage', question: '지금 어디쯤?', answer: null }, null)
  addHint(db, a.id, 1, { kind: 'text', text: '예제 1 을 손으로' }, null)
  setStageAnswer(db, h0.id, 'plan')
  const list = listHints(db, a.id)
  assert.deepEqual(list.map(h => h.level), [0, 1])
  assert.deepEqual(list[0].body, { kind: 'stage', question: '지금 어디쯤?', answer: 'plan' })
})

test('오답: 같은 코드 해시는 한 번만, 유형별 모음', () => {
  const { db, p, q, a, b } = setup()
  addMistake(db, { attemptId: a.id, problemId: p.id, type: 'offbyone', line: 3, note: 'range 끝', codeHash: 'h1' })
  assert.equal(hasMistake(db, a.id, 'h1'), true)
  assert.equal(hasMistake(db, a.id, 'h2'), false)
  addMistake(db, { attemptId: a.id, problemId: p.id, type: 'boundary', line: null, note: '빈 배열', codeHash: 'h2' })
  addMistake(db, { attemptId: b.id, problemId: q.id, type: 'offbyone', line: 1, note: '인덱스', codeHash: 'h3' })
  assert.equal(listMistakes(db, p.id).length, 2)
  const g = mistakesByType(db)
  assert.deepEqual(g.map(x => [x.type, x.count]), [['offbyone', 2], ['boundary', 1]])
  assert.deepEqual(g[0].items.map(m => m.title).sort(), ['Two Sum', '두 큐'])
})
