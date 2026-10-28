import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, MIGRATIONS } from '../src/main/db.ts'
import { insertProblem } from '../src/main/coding/problems.ts'
import { finishAttempt, giveUp, dueReviews, problemStatuses, sessionReport } from '../src/main/practice/after.ts'
import { upsertMistake } from '../src/main/tutor/store.ts'

const now = new Date(2026, 9, 19, 15)
const mk = (db: DatabaseSync, n: string) => insertProblem(db, { site: 'programmers', siteId: n, url: 'u' + n, title: 't' + n, html: '', examples: [{ args: [1], expected: [0, 1] }], starter: {}, signature: null, siteLevel: 'Lv. 1', siteTags: [] })
const attempt = (db: DatabaseSync, pid: number, mode: string, startedAt: Date, ended: string | null = null) =>
  Number(db.prepare("INSERT INTO attempts (problem_id, mode, lang, code, stage, stage_ms, started_at, ended_at) VALUES (?, ?, 'python3', '{}', 'understand', '{}', ?, ?)").run(pid, mode, startedAt.toISOString(), ended).lastInsertRowid)
const hint = (db: DatabaseSync, a: number, level: number, at: Date) => db.prepare("INSERT INTO hints (attempt_id, level, body, at) VALUES (?, ?, '{}', ?)").run(a, level, at.toISOString())
const run = (db: DatabaseSync, a: number, passed: number, at: Date) => db.prepare("INSERT INTO runs (attempt_id, lang, results, passed, at) VALUES (?, 'python3', '{}', ?, ?)").run(a, passed, at.toISOString())
const review = (db: DatabaseSync) => db.prepare('SELECT * FROM reviews').all() as { problem_id: number; step: number; status: string; due_at: string }[]

function learned() {
  const db = openDb(':memory:')
  const p = mk(db, '1')
  const start = new Date(now.getTime() - 600_000)
  const a = attempt(db, p.id, 'learn', start)
  for (const [i, l] of [0, 3, 5].entries()) hint(db, a, l, new Date(start.getTime() + (i + 1) * 60_000))
  run(db, a, 0, new Date(start.getTime() + 100_000)); run(db, a, 1, new Date(start.getTime() + 200_000)); run(db, a, 0, new Date(start.getTime() + 300_000))
  db.prepare("UPDATE attempts SET predicted = '[0,1]', theory = '{}', stage_ms = '{\"understand\":200000,\"code\":400000}' WHERE id = ?").run(a)
  return { db, p, a }
}

test('learn 시도를 통과로 끝내면 리포트와 복습 행', () => {
  const { db, a } = learned()
  const r = finishAttempt(db, a, true, { idea: '해시', complexity: 'O(n)', mistake: '없음' }, now)
  assert.equal(r.runs, 3)
  assert.deepEqual(r.hints.map(h => h.level), [0, 3, 5])
  assert.equal(r.hints[0].atMs, 60_000)
  assert.equal(r.firstPassMs, 200_000)
  assert.equal(r.totalMs, 600_000)
  assert.equal(r.predictedRight, true)
  assert.ok(r.theory)
  assert.equal(r.next && r.next !== 'mastered' ? r.next.step : -1, 0)
  const row = db.prepare('SELECT * FROM attempts WHERE id = ?').get(a) as { ended_at: string; site_passed: number; reflection: string }
  assert.ok(row.ended_at); assert.equal(row.site_passed, 1)
  assert.deepEqual(JSON.parse(row.reflection), { idea: '해시', complexity: 'O(n)', mistake: '없음' })
  const rv = review(db)
  assert.equal(rv.length, 1); assert.equal(rv[0].step, 0); assert.equal(rv[0].status, 'due')
  assert.deepEqual(sessionReport(db, a), r)
})

test('다시 끝내도 reviews 는 그대로', () => {
  const { db, p, a } = learned()
  finishAttempt(db, a, true, null, now)
  db.prepare('UPDATE reviews SET step = 2 WHERE problem_id = ?').run(p.id)
  finishAttempt(db, a, true, null, new Date(2026, 9, 25))
  assert.equal(review(db)[0].step, 2)
})

test('복습 시도: 통과면 step 1, 포기면 step 0', () => {
  const { db, p, a } = learned()
  finishAttempt(db, a, true, null, now)
  const r1 = attempt(db, p.id, 'review', now)
  const rep = finishAttempt(db, r1, true, null, now)
  assert.equal(review(db)[0].step, 1)
  assert.equal(rep.mode, 'review')
  const r2 = attempt(db, p.id, 'review', now)
  giveUp(db, r2, now)
  assert.equal(review(db)[0].step, 0)
  assert.ok((db.prepare('SELECT ended_at FROM attempts WHERE id = ?').get(r2) as { ended_at: string }).ended_at)
})

test('step 3 에서 복습 통과하면 익힘', () => {
  const { db, p, a } = learned()
  finishAttempt(db, a, true, null, now)
  db.prepare('UPDATE reviews SET step = 3 WHERE problem_id = ?').run(p.id)
  const rep = finishAttempt(db, attempt(db, p.id, 'review', now), true, null, now)
  assert.equal(rep.next, 'mastered')
  assert.equal(problemStatuses(db)[p.id].kind, 'mastered')
})

test('dueReviews: 힌트 많이 쓴 문제 먼저, 미래 것은 제외', () => {
  const db = openDb(':memory:')
  const [p1, p2, p3] = [mk(db, '1'), mk(db, '2'), mk(db, '3')]
  const a1 = attempt(db, p1.id, 'learn', now, now.toISOString()); hint(db, a1, 1, now)
  const a2 = attempt(db, p2.id, 'learn', now, now.toISOString()); hint(db, a2, 5, now); hint(db, a2, 2, now)
  const ins = db.prepare('INSERT INTO reviews (problem_id, due_at, step, status) VALUES (?, ?, 0, ?)')
  ins.run(p1.id, new Date(2026, 9, 20).toISOString(), 'due')
  ins.run(p2.id, new Date(2026, 9, 21).toISOString(), 'due')
  ins.run(p3.id, new Date(2026, 9, 25).toISOString(), 'due')
  const out = dueReviews(db, new Date(2026, 9, 21, 9))
  assert.deepEqual(out.map(x => x.problemId), [p2.id, p1.id])
  assert.equal(out[0].maxHint, 5)
  assert.equal(out[0].title, 't2')
})

test('problemStatuses', () => {
  const db = openDb(':memory:')
  const [a, b, c, d] = [mk(db, '1'), mk(db, '2'), mk(db, '3'), mk(db, '4')]
  attempt(db, a.id, 'learn', now)
  const ins = db.prepare('INSERT INTO reviews (problem_id, due_at, step, status) VALUES (?, ?, ?, ?)')
  ins.run(b.id, '2026-10-20T00:00:00.000Z', 1, 'due')
  ins.run(c.id, '2026-10-20T00:00:00.000Z', 3, 'mastered')
  const s = problemStatuses(db)
  assert.equal(s[a.id].kind, 'solving')
  assert.deepEqual(s[b.id], { kind: 'review', dueAt: '2026-10-20T00:00:00.000Z', step: 1 })
  assert.equal(s[c.id].kind, 'mastered')
  assert.ok(!s[d.id] || s[d.id].kind === 'new')
})

test('upsertMistake: 같은 시도 · 유형이면 한 줄', () => {
  const { db, p, a } = learned()
  const m = { attemptId: a, problemId: p.id, type: 'logic' as const, line: 1, note: '처음', codeHash: 'h1' }
  upsertMistake(db, m)
  upsertMistake(db, { ...m, line: 2, note: '나중', codeHash: 'h2' })
  const rows = db.prepare('SELECT * FROM mistakes').all() as { note: string; line: number; code_hash: string }[]
  assert.equal(rows.length, 1); assert.equal(rows[0].note, '나중'); assert.equal(rows[0].line, 2); assert.equal(rows[0].code_hash, 'h2')
})

test('리포트 시간은 켜 둔 시간이 아니라 단계 시간의 합', () => {
  const { db, a } = learned()
  db.prepare("UPDATE attempts SET stage_ms = '{\"code\":300000}' WHERE id = ?").run(a)
  const r = sessionReport(db, a, now)!
  assert.equal(r.totalMs, 300_000)
  assert.deepEqual(r.hints.map(h => h.atMs), [30_000, 60_000, 90_000]) // 벽시계 60/120/180초를 300/600 비율로
  assert.ok(r.hints.every(h => h.atMs <= r.totalMs))
})

test('첫 통과가 하루를 넘으면 null', () => {
  const { db, a } = learned()
  db.prepare('DELETE FROM runs WHERE attempt_id = ?').run(a)
  run(db, a, 1, new Date(now.getTime() - 600_000 + 2 * 86_400_000))
  assert.equal(sessionReport(db, a, new Date(now.getTime() + 3 * 86_400_000))!.firstPassMs, null)
})

test('복습 시도를 sitePassed=false 로 끝내면 step 0, 내일', () => {
  const { db, p, a } = learned()
  finishAttempt(db, a, true, null, now)
  db.prepare('UPDATE reviews SET step = 2 WHERE problem_id = ?').run(p.id)
  finishAttempt(db, attempt(db, p.id, 'review', now), false, null, now)
  const rv = review(db)[0]
  assert.equal(rv.step, 0)
  assert.equal(rv.due_at, new Date(2026, 9, 20).toISOString())
})

test('learn 을 [아직] 으로 끝내면 아무 일 없음, learn 포기도 무시', () => {
  const { db, a } = learned()
  finishAttempt(db, a, false, null, now)
  giveUp(db, a, now)
  assert.equal((db.prepare('SELECT ended_at FROM attempts WHERE id = ?').get(a) as { ended_at: string | null }).ended_at, null)
  assert.equal(review(db).length, 0)
})

test('dueReviews maxHint: 힌트 없으면 -1, L0 만이면 0', () => {
  const db = openDb(':memory:')
  const [p1, p2] = [mk(db, '1'), mk(db, '2')]
  attempt(db, p1.id, 'learn', now, now.toISOString())
  const a2 = attempt(db, p2.id, 'learn', now, now.toISOString()); hint(db, a2, 0, now)
  const ins = db.prepare("INSERT INTO reviews (problem_id, due_at, step, status) VALUES (?, ?, 0, 'due')")
  ins.run(p1.id, new Date(2026, 9, 20).toISOString()); ins.run(p2.id, new Date(2026, 9, 20).toISOString())
  const m = Object.fromEntries(dueReviews(db, new Date(2026, 9, 20, 9)).map(x => [x.problemId, x.maxHint]))
  assert.equal(m[p1.id], -1); assert.equal(m[p2.id], 0)
})

test('problemStatuses: reviews 행 없이 site_passed 시도만 있어도 passed', () => {
  const db = openDb(':memory:')
  const p = mk(db, '1')
  const a = attempt(db, p.id, 'learn', now, now.toISOString())
  db.prepare('UPDATE attempts SET site_passed = 1 WHERE id = ?').run(a)
  assert.equal(problemStatuses(db)[p.id].kind, 'passed')
})

test('MIGRATIONS[6] 은 중복 오답을 정리한다', () => {
  assert.ok(MIGRATIONS[6].includes('GROUP BY attempt_id, type'))
})

test('복습 리포트의 previous: 마지막으로 끝난 learn 시도의 회고와 자기 설명', () => {
  const { db, p, a } = learned()
  assert.equal(sessionReport(db, a, now)!.previous, null)
  const r0 = attempt(db, p.id, 'review', now)
  assert.equal(sessionReport(db, r0, now)!.previous, null) // 끝난 learn 없음
  const old = attempt(db, p.id, 'learn', new Date(2026, 9, 1), new Date(2026, 9, 1, 1).toISOString())
  db.prepare("UPDATE attempts SET reflection = '{\"idea\":\"옛\",\"complexity\":\"\",\"mistake\":\"\"}' WHERE id = ?").run(old)
  db.prepare("UPDATE hints SET self_explain = ' ' WHERE attempt_id = ?").run(a)
  db.prepare("UPDATE hints SET self_explain = '첫째' WHERE attempt_id = ? AND level = 0").run(a)
  db.prepare("UPDATE hints SET self_explain = '둘째' WHERE attempt_id = ? AND level = 5").run(a)
  finishAttempt(db, a, true, { idea: '해시', complexity: 'O(n)', mistake: '없음' }, now)
  const prev = sessionReport(db, r0, now)!.previous
  assert.deepEqual(prev, { at: now.toISOString(), reflection: { idea: '해시', complexity: 'O(n)', mistake: '없음' }, selfExplains: ['첫째', '둘째'], theory: { own: '', approach: null, explain: '', at: '' } })
})

test('복습 리포트의 previous.theory — 그때 고른 접근', () => {
  const { db, p, a } = learned()
  const log = { own: '', approach: { name: '해시', complexity: 'O(N)', concepts: [], clue: '' }, explain: '', at: 't' }
  db.prepare('UPDATE attempts SET theory = ? WHERE id = ?').run(JSON.stringify(log), a)
  finishAttempt(db, a, true, null, now)
  const rv = attempt(db, p.id, 'review', now)
  assert.equal(sessionReport(db, rv, now)!.previous!.theory!.approach!.name, '해시')
})
