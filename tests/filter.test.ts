import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matches, weekHint, type Filter } from '../src/renderer/history/filter.ts'

const e = { category: 'A', date: '2026-10-07', title: 'Docker 정리', type: '기능', tags: [{ major: '인프라', minor: '컨테이너' }], body: '==둘로|화면 분할== 했다', sections: {} }
const none: Filter = { cat: null, type: null, tag: null, day: null, q: '' }
const m = (f: Partial<Filter>, skip = false, keys: string[] = ['화면 분할']) => matches(e, { ...none, ...f }, keys, skip)

test('거르기 없음 · 프로젝트 · 날짜', () => {
  assert.ok(m({}))
  assert.ok(m({ cat: 'A' }) && !m({ cat: 'B' }))
  assert.ok(m({ day: '2026-10-07' }) && !m({ day: '2026-10-08' }))
})

test('종류는 skipType 이면 보지 않는다', () => {
  assert.ok(!m({ type: '수정' }))
  assert.ok(m({ type: '수정' }, true))
})

test('분류: major 또는 "major - minor"', () => {
  assert.ok(m({ tag: '인프라' }) && m({ tag: '인프라 - 컨테이너' }))
  assert.ok(!m({ tag: '컨테이너' }) && !m({ tag: '다른' }))
})

test('검색: 제목 · 본문(형광펜 풀어서) · 분류 · 개념, 대소문자 무시', () => {
  assert.ok(m({ q: 'DOCKER' }))
  assert.ok(m({ q: '둘로 했다' }) && !m({ q: '==' }))
  assert.ok(m({ q: '컨테이너' }))
  assert.ok(m({ q: '분할' }, false, ['화면 분할']))
  assert.ok(!m({ q: '없는말' }))
  assert.ok(m({ q: '  docker  ' }))
})

test('weekHint — 보고가 있으면 표시', () => {
  assert.equal(weekHint(18, false), '18건')
  assert.equal(weekHint(18, true), '18건 · 보고 있음')
})
