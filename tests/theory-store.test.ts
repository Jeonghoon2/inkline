import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/main/db.ts'
import { getApproaches, setApproaches, getScenes, putScenes, conceptKeys, toTheoryLog, getTheoryLog, chooseApproach, addExplain, passedWithTag, clearMapScenes, similarSolved } from '../src/main/theory/store.ts'
import type { Approach } from '../src/shared/types.ts'

function setup() {
  const db = openDb(':memory:')
  const add = (id: number, tags: string[]) => db.prepare(`INSERT INTO problems (id, site, site_id, url, title, html, examples, starter, site_level, site_tags, classification, created_at)
    VALUES (?, 'leetcode', ?, ?, 't', '', '[]', '{}', '', '[]', ?, '2026-10-19')`).run(id, String(id), `u${id}`, JSON.stringify({ difficulty: 2, tags, nature: 'algorithm', complexityNote: '', anyOrder: false }))
  add(1, ['투 포인터']); add(2, ['투 포인터', '정렬']); add(3, ['투 포인터']); add(4, ['DP'])
  const att = (pid: number, passed: number) => Number(db.prepare(`INSERT INTO attempts (problem_id, mode, lang, code, stage, stage_ms, site_passed, started_at) VALUES (?, 'learn', 'python3', '{}', 'understand', '{}', ?, '2026-10-19')`).run(pid, passed).lastInsertRowid)
  return { db, att }
}

test('approaches 저장 · 읽기', () => {
  const { db } = setup()
  assert.equal(getApproaches(db, 1), null)
  const a: Approach[] = [{ name: '투 포인터', nature: 'algorithm', why: '정렬된 배열', concepts: [{ key: 'two-pointers', name: '투 포인터', nature: 'algorithm', tag: '투 포인터' }] }]
  setApproaches(db, 1, a)
  assert.deepEqual(getApproaches(db, 1), a)
})

test('장면 캐시 저장 · 덮어쓰기 · 개념 key 목록', () => {
  const { db } = setup()
  const set = { summary: ['한 줄'], scenes: [{ component: 'Caption' as const, title: 't', props: {}, beats: [{ caption: 'c', highlight: [], state: {} }] }] }
  putScenes(db, 'concept:two-pointers', set, 'claude', 'haiku')
  assert.deepEqual(getScenes(db, 'concept:two-pointers'), set)
  putScenes(db, 'concept:two-pointers', { ...set, summary: ['둘'] }, 'claude', 'haiku')
  assert.deepEqual(getScenes(db, 'concept:two-pointers')?.summary, ['둘'])
  putScenes(db, 'concept:hash-map', set, 'claude', 'haiku'); putScenes(db, 'map:1:two-pointers', set, 'claude', 'haiku')
  assert.deepEqual(conceptKeys(db).sort(), ['hash-map', 'two-pointers'])
})

test('이론 로그는 시도 행에 저장된다', () => {
  const { db, att } = setup()
  const id = att(1, 0)
  addExplain(db, id, '양 끝에서 좁힌다')
  const row = db.prepare('SELECT theory FROM attempts WHERE id = ?').get(id) as { theory: string }
  assert.equal(JSON.parse(row.theory).explain, '양 끝에서 좁힌다')
})

test('같은 태그로 통과한 다른 문제 수', () => {
  const { db, att } = setup()
  att(2, 1); att(2, 1); att(3, 1); att(4, 1); att(1, 1)
  assert.equal(passedWithTag(db, '투 포인터', 1), 2) // 문제 2 · 3 (1 은 지금 문제라 뺀다, 2 는 한 번만)
  assert.equal(passedWithTag(db, 'DP', 1), 1)
  assert.equal(passedWithTag(db, '', 1), 0)
})

test('conceptKeys — 접근의 key 를 포함하고 자주 나온 key 가 앞', () => {
  const { db } = setup()
  const c = (key: string) => ({ key, name: key, nature: 'algorithm' as const, tag: '' })
  const ap = (...keys: string[]): Approach[] => [{ name: 'a', nature: 'algorithm', why: '', concepts: keys.map(c) }]
  setApproaches(db, 1, ap('hash-map', 'sort')); setApproaches(db, 2, ap('hash-map'))
  assert.deepEqual(conceptKeys(db), ['hash-map', 'sort'])
})

test('clearMapScenes — 그 문제의 map 장면만 지운다', () => {
  const { db } = setup()
  const set = { summary: ['x'], scenes: [] }
  for (const k of ['map:1:a', 'map:1:b', 'map:2:a', 'map:11:a', 'concept:a']) putScenes(db, k, set, null, 'm')
  clearMapScenes(db, 1)
  assert.deepEqual((db.prepare('SELECT key FROM scenes ORDER BY key').all() as { key: string }[]).map(r => r.key), ['concept:a', 'map:11:a', 'map:2:a'])
})

test('similarSolved — 태그가 겹치고 통과한 다른 문제만', () => {
  const { db, att } = setup()
  att(1, 1); att(2, 1); att(3, 0); att(4, 1)
  assert.deepEqual(similarSolved(db, 1).map(r => r.title), ['t'])
  assert.equal(similarSolved(db, 1).length, 1) // 2 만 (3 은 미통과, 4 는 태그 다름, 1 은 자기 자신)
})

test('theory 로그 — 옛 꼴을 새 꼴로 옮긴다', () => {
  assert.deepEqual(toTheoryLog({ approach: '해시', firstTry: '내 생각', explain: '설명', at: 't' }),
    { own: '내 생각', approach: { name: '해시', complexity: '', concepts: [], clue: '' }, explain: '설명', at: 't' })
  assert.equal(toTheoryLog(null), null)
  assert.deepEqual(toTheoryLog({ approach: '', firstTry: '', explain: '', at: 't' })!.approach, null)
})

test('고르는 순간 저장 — 설명은 덧붙인다, 다시 고르면 접근 · 내 접근만 바뀐다', () => {
  const { db, att } = setup()
  const aid = att(1, 0)
  const a = { name: '해시', complexity: 'O(N)' as const, concepts: [{ key: 'hash-map', name: '해시 맵' }], clue: '두 수' }
  chooseApproach(db, aid, a, '내 생각')
  addExplain(db, aid, '이렇게 쓴다')
  chooseApproach(db, aid, { ...a, name: '정렬' }, '다시 생각')
  const l = getTheoryLog(db, aid)!
  assert.deepEqual([l.own, l.approach?.name, l.explain], ['다시 생각', '정렬', '이렇게 쓴다'])
})

test('similarSolved — 그때 고른 접근 이름', () => {
  const { db, att } = setup()
  att(1, 1); const a2 = att(2, 1)
  chooseApproach(db, a2, { name: '해시', complexity: '', concepts: [], clue: '' }, '')
  assert.equal(similarSolved(db, 1)[0].approach, '해시')
})
