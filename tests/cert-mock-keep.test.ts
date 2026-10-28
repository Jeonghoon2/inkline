import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropMock, keepMock, leftSecs, resumeMock, unansweredNote } from '../src/renderer/cert/mockKeep.ts'
import type { CertPaper } from '../src/shared/cert.ts'

const q = (id: number) => ({ id, subject: 'A', stem: '?', choices: ['1', '2', '3', '4'] })
const paper: CertPaper = { mockId: 1, minutes: 10, short: [], questions: [q(11), q(12), q(13), q(14)] }

test('남은 시간은 마감 시각으로 다시 센다', () => {
  assert.equal(leftSecs(10_000, 0), 10)
  assert.equal(leftSecs(10_000, 9_001), 1) // 남은 조각은 올림
  assert.equal(leftSecs(10_000, 20_000), 0) // 지났으면 0 — 자동 제출
})

test('같은 교재로 돌아오면 답 · 표시 · 위치를 그대로, 다른 교재 · 그만둔 뒤엔 없음', () => {
  keepMock({ bookId: 3, paper, picks: { 11: 0, 12: 2, 13: null, 14: null }, flags: [12], at: 1, deadline: 600_000 })
  const r = resumeMock(3, 300_000)
  assert.deepEqual(r && { picks: r.picks, flags: r.flags, at: r.at, left: r.left }, { picks: { 11: 0, 12: 2, 13: null, 14: null }, flags: [12], at: 1, left: 300 })
  assert.equal(resumeMock(4, 300_000), null)
  keepMock(null)
  assert.equal(resumeMock(3, 300_000), null)
})

test('제출 확인 문구 — 안 푼 문제 수와 번호', () => {
  assert.equal(unansweredNote(paper, { 11: 0, 12: 1, 13: null, 14: null }), '안 푼 문제 2개(3 · 4번)')
  assert.equal(unansweredNote(paper, { 11: 0, 12: 1, 13: 2, 14: 3 }), '')
  const big: CertPaper = { ...paper, questions: [1, 2, 3, 4, 5, 6, 7].map(q) }
  assert.equal(unansweredNote(big, {}), '안 푼 문제 7개(1 · 2 · 3 · 4 · 5번 …)')
})

test('교재를 지우면 그 교재의 시험만 버린다(같은 id 로 새 교재가 들어와도 이어지지 않게)', () => {
  const k = { bookId: 3, paper, picks: {}, flags: [], at: 0, deadline: 600_000 }
  keepMock(k); dropMock(4)
  assert.ok(resumeMock(3, 0))
  dropMock(3)
  assert.equal(resumeMock(3, 0), null)
})
