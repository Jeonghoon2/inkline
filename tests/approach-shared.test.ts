import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RANKS, rankIndex, normalizeKey, tagOfKey, approachKey } from '../src/shared/approach.ts'

test('순위 — 느릴수록 큰 번호, 모르는 글은 -1', () => {
  assert.equal(RANKS.length, 9)
  assert.ok(rankIndex('O(N log N)') < rankIndex('O(N^2)'))
  assert.equal(rankIndex('O(N)'), 3)
  assert.equal(rankIndex('빠름'), -1)
})

test('개념 key 별칭은 표준 key 로', () => {
  assert.equal(normalizeKey('bfs'), 'breadth-first-search')
  assert.equal(normalizeKey('two-pointer'), 'two-pointers')
  assert.equal(normalizeKey('min-heap'), 'priority-queue')
  assert.equal(normalizeKey('hashmap'), 'hash-map')
  assert.equal(normalizeKey('DP'), 'dynamic-programming')
  assert.equal(normalizeKey('segment-tree'), 'segment-tree') // 표에 없으면 그대로(소문자)
})

test('태그는 표에서 — 모르면 빈 글', () => {
  assert.equal(tagOfKey('breadth-first-search'), 'BFS')
  assert.equal(tagOfKey('hash-map'), '해시')
  assert.equal(tagOfKey('segment-tree'), '')
})

test('접근 key — 정규화 · 정렬 · +', () => {
  assert.equal(approachKey(['queue', 'greedy']), 'greedy+queue')
  assert.equal(approachKey(['bfs']), 'breadth-first-search')
})
