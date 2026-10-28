import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/main/db.ts'
import { insertProblem, getProblem, getProblemByUrl, listProblems, setClassification } from '../src/main/coding/problems.ts'
import type { ProblemDraft } from '../src/shared/types.ts'

const draft = (n: number): ProblemDraft => ({
  site: 'programmers',
  siteId: String(n),
  url: `https://school.programmers.co.kr/learn/courses/30/lessons/${n}`,
  title: `문제 ${n}`,
  html: '<p>본문</p>',
  examples: [{ args: [[1, 2], 3], expected: 4 }],
  starter: { python3: 'def solution(a, b):\n    return 0' },
  signature: { name: 'solution', params: [{ name: 'a', type: { array: 'int' } }, { name: 'b', type: 'int' }], returns: 'int' },
  siteLevel: 'Lv. 2',
  siteTags: []
})

test('넣고 읽으면 같은 값, 분류는 처음에 null', () => {
  const db = openDb(':memory:')
  const p = insertProblem(db, draft(1))
  assert.equal(p.id, 1)
  assert.equal(p.classification, null)
  assert.deepEqual(getProblem(db, 1), p)
  assert.deepEqual(getProblemByUrl(db, draft(1).url), p)
  assert.equal(getProblem(db, 99), null)
})

test('같은 주소는 두 번 넣지 못한다', () => {
  const db = openDb(':memory:')
  insertProblem(db, draft(1))
  assert.throws(() => insertProblem(db, draft(1)))
})

test('목록은 최근 것이 위, 분류를 저장하면 함께 보인다', () => {
  const db = openDb(':memory:')
  insertProblem(db, draft(1))
  insertProblem(db, draft(2))
  setClassification(db, 1, { difficulty: 2, tags: ['큐', '투 포인터'], nature: 'algorithm', complexityNote: 'O(N)', anyOrder: false })
  const list = listProblems(db)
  assert.deepEqual(list.map(p => p.id), [2, 1])
  assert.deepEqual(list[1].classification?.tags, ['큐', '투 포인터'])
  assert.equal(list[0].classification, null)
})
