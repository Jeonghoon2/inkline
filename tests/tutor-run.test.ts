import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/main/db.ts'
import { createTutor, REVIEW_GATE } from '../src/main/tutor/run.ts'

function setup(replies: Record<string, unknown[]>) {
  const db = openDb(':memory:')
  db.prepare(`INSERT INTO problems (id, site, site_id, url, title, html, examples, starter, site_level, site_tags, created_at)
    VALUES (1, 'leetcode', '1', 'u1', 'Two Sum', '<p>배열과 target</p>', '[]', '{}', '', '[]', '2026-10-19')`).run()
  const att = (mode: 'learn' | 'review') => Number(db.prepare(`INSERT INTO attempts (problem_id, mode, lang, code, stage, stage_ms, started_at) VALUES (1, ?, 'python3', '{}', 'understand', '{}', '2026-10-19')`).run(mode).lastInsertRowid)
  const calls: string[] = []
  const ask = async (o: { task: string }) => {
    calls.push(o.task)
    const q = replies[o.task] ?? []
    const v = q.shift()
    return v instanceof Error ? { ok: false as const, error: { code: 'cli-error' as const, message: v.message } } : { ok: true as const, value: v }
  }
  const tutor = createTutor(db, ask as never, { nudgeEnabled: () => true })
  return { db, att, calls, tutor }
}

test('넛지: 같은 코드는 다시 묻지 않는다', async () => {
  const { att, calls, tutor } = setup({ nudge: [{ text: '입력 크기를 다시 볼까요?' }] })
  const n = att('learn')
  assert.equal(await tutor.nudge(n, 'x = 1', 'understand'), '입력 크기를 다시 볼까요?')
  assert.equal(await tutor.nudge(n, 'x = 1', 'understand'), null)
  assert.deepEqual(calls, ['nudge'])
})

test('넛지: AI 오류면 단계별 대체 문장', async () => {
  const { att, tutor } = setup({ nudge: [new Error('x')] })
  const t = await tutor.nudge(att('learn'), 'y', 'plan')
  assert.equal(typeof t, 'string')
  assert.ok(t!.length > 0)
})

test('힌트: L0 은 AI 없이, L1 은 L0 답 전에 막힌다', async () => {
  const { att, calls, tutor } = setup({ hint: [{ text: '입력 크기부터 보세요.' }] })
  const n = att('learn')
  const h0 = await tutor.nextHint(n, '', 'understand', null)
  assert.equal((h0 as { level: number }).level, 0)
  assert.deepEqual(await tutor.nextHint(n, '', 'understand', null), { gate: '먼저 위 질문에 답해 주세요' })
  assert.deepEqual(calls, [])
})

test('힌트: L4 AI 오류는 단계를 올리지 않는다', async () => {
  const { db, att, tutor } = setup({ hint: [new Error('down')] })
  const n = att('learn')
  for (const lv of [0, 1, 2, 3]) db.prepare(`INSERT INTO hints (attempt_id, level, body, at) VALUES (?, ?, ?, 'x')`).run(n, lv, JSON.stringify(lv === 0 ? { kind: 'stage', question: 'q', answer: 'plan' } : { kind: 'text', text: 't' }))
  const r = await tutor.nextHint(n, '', 'plan', '지금까지 양 끝에서 좁히는 걸 생각했어요')
  assert.equal((r as { code: string }).code, 'cli-error')
  assert.equal((db.prepare('SELECT COUNT(*) n FROM hints WHERE attempt_id = ?').get(n) as { n: number }).n, 4)
})

test('복습 모드: 넛지 null, 힌트 관문, AI 를 부르지 않는다', async () => {
  const { att, calls, tutor } = setup({ nudge: [{ text: 'x' }], hint: [{ text: 'x' }] })
  const n = att('review')
  assert.equal(await tutor.nudge(n, 'code', 'implement'), null)
  assert.deepEqual(await tutor.nextHint(n, 'code', 'implement', null), { gate: REVIEW_GATE })
  assert.deepEqual(calls, [])
})
