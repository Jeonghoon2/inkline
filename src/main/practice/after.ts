import type { DatabaseSync } from 'node:sqlite'
import { toTheoryLog } from '../theory/store.ts'
import type { DueItem, HintLevel, ProblemStatus, Reflection, SessionReport, Stage } from '../../shared/types.ts'
import { nextReview, predictedRight, sortDue } from '../../shared/review.ts'
import { t } from '../../shared/i18n.ts'

type ARow = { id: number; problem_id: number; mode: 'learn' | 'review'; stage_ms: string; predicted: string | null; theory: string | null; started_at: string; ended_at: string | null }
type RvRow = { problem_id: number; due_at: string; step: number; status: string }

const reviewOf = (db: DatabaseSync, pid: number) => db.prepare('SELECT * FROM reviews WHERE problem_id = ?').get(pid) as RvRow | undefined

function setReview(db: DatabaseSync, pid: number, r: { step: number; dueAt: string; status: string }): void {
  db.prepare('INSERT INTO reviews (problem_id, due_at, step, status) VALUES (?, ?, ?, ?) ON CONFLICT(problem_id) DO UPDATE SET due_at = excluded.due_at, step = excluded.step, status = excluded.status')
    .run(pid, r.dueAt, r.step, r.status)
}

function close(db: DatabaseSync, id: number, sitePassed: boolean, reflection: Reflection | null, now: Date): void {
  db.prepare('UPDATE attempts SET ended_at = ?, site_passed = ?, reflection = ? WHERE id = ?')
    .run(now.toISOString(), sitePassed ? 1 : 0, reflection ? JSON.stringify(reflection) : null, id)
}

export function finishAttempt(db: DatabaseSync, attemptId: number, sitePassed: boolean, reflection: Reflection | null, now = new Date()): SessionReport {
  const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId) as ARow | undefined
  if (!a) throw new Error(t('시도 {id} 없음', { id: attemptId }))
  // 이미 끝났거나, learn 의 [아직] 은 건드리지 않는다
  if (a.ended_at === null && (a.mode === 'review' || sitePassed)) {
    db.exec('BEGIN')
    try {
      const cur = reviewOf(db, a.problem_id)
      if (a.mode === 'learn') {
        if (!cur) setReview(db, a.problem_id, nextReview(null, true, now))
      } else {
        setReview(db, a.problem_id, nextReview(cur ?? null, sitePassed, now))
      }
      close(db, attemptId, sitePassed, reflection, now)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return sessionReport(db, attemptId, now)!
}

export function giveUp(db: DatabaseSync, attemptId: number, now = new Date()): void {
  const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId) as ARow | undefined
  if (!a || a.mode !== 'review' || a.ended_at !== null) return
  finishAttempt(db, attemptId, false, null, now)
}

export function dueReviews(db: DatabaseSync, now = new Date()): DueItem[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const rows = db.prepare(
    `SELECT r.problem_id AS problemId, p.title AS title, r.due_at AS dueAt, r.step AS step,
      COALESCE((SELECT MAX(h.level) FROM hints h JOIN attempts a ON a.id = h.attempt_id WHERE a.problem_id = r.problem_id AND a.mode = 'learn'), -1) AS maxHint
     FROM reviews r JOIN problems p ON p.id = r.problem_id WHERE r.status = 'due' AND r.due_at < ?`
  ).all(end) as unknown as DueItem[]
  return sortDue(rows)
}

export function problemStatuses(db: DatabaseSync): Record<number, ProblemStatus> {
  const out: Record<number, ProblemStatus> = {}
  const att = db.prepare('SELECT problem_id, MAX(site_passed) AS passed, MAX(ended_at IS NULL) AS open FROM attempts GROUP BY problem_id').all() as { problem_id: number; passed: number; open: number }[]
  for (const r of att) out[r.problem_id] = r.passed ? { kind: 'passed' } : r.open ? { kind: 'solving' } : { kind: 'new' }
  for (const r of db.prepare('SELECT * FROM reviews').all() as RvRow[])
    out[r.problem_id] = r.status === 'mastered' ? { kind: 'mastered' } : { kind: 'review', dueAt: r.due_at, step: r.step }
  return out
}

export function sessionReport(db: DatabaseSync, attemptId: number, now = new Date()): SessionReport | null {
  const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId) as ARow | undefined
  if (!a) return null
  const t0 = Date.parse(a.started_at)
  const rel = (at: string) => Math.max(0, Date.parse(at) - t0)
  const stageMs = JSON.parse(a.stage_ms) as Partial<Record<Stage, number>>
  const totalMs = Object.values(stageMs).reduce<number>((n, v) => n + (v ?? 0), 0) // 켜 둔 시간이 아니라 실제로 쓴 시간
  const wallMs = Math.max(0, (a.ended_at ? Date.parse(a.ended_at) : now.getTime()) - t0)
  const onAxis = (ms: number) => (wallMs > totalMs ? (ms / wallMs) * totalMs : Math.min(ms, totalMs)) // 벽시계가 더 길면 비율로 줄여 같은 축에 둔다
  const hints = (db.prepare('SELECT level, at FROM hints WHERE attempt_id = ? ORDER BY id').all(attemptId) as { level: number; at: string }[])
    .map(h => ({ level: h.level as HintLevel, atMs: Math.round(onAxis(rel(h.at))) }))
  const runs = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE attempt_id = ?').get(attemptId) as { n: number }
  const pass = db.prepare('SELECT at FROM runs WHERE attempt_id = ? AND passed = 1 ORDER BY id LIMIT 1').get(attemptId) as { at: string } | undefined
  const pr = db.prepare('SELECT examples FROM problems WHERE id = ?').get(a.problem_id) as { examples: string } | undefined
  const examples = pr ? (JSON.parse(pr.examples) as { expected: unknown }[]) : []
  const rv = a.ended_at ? reviewOf(db, a.problem_id) : undefined
  let previous: SessionReport['previous'] = null
  if (a.mode === 'review') {
    const pa = db.prepare("SELECT id, ended_at, reflection, theory FROM attempts WHERE problem_id = ? AND mode = 'learn' AND ended_at IS NOT NULL AND id <> ? ORDER BY ended_at DESC, id DESC LIMIT 1").get(a.problem_id, attemptId) as { id: number; ended_at: string; reflection: string | null; theory: string | null } | undefined
    if (pa) {
      const selfExplains = (db.prepare("SELECT self_explain FROM hints WHERE attempt_id = ? AND TRIM(COALESCE(self_explain, '')) <> '' ORDER BY id").all(pa.id) as { self_explain: string }[]).map(h => h.self_explain)
      previous = { at: pa.ended_at, reflection: pa.reflection ? (JSON.parse(pa.reflection) as Reflection) : null, selfExplains, theory: toTheoryLog(pa.theory ? JSON.parse(pa.theory) : null) }
    }
  }
  return {
    attemptId, mode: a.mode, stageMs, hints, runs: runs.n,
    firstPassMs: pass && rel(pass.at) <= 86_400_000 ? rel(pass.at) : null, // 며칠에 걸친 시도는 의미 없다
    predicted: a.predicted,
    predictedRight: examples.length ? predictedRight(a.predicted, examples[0].expected) : null,
    theory: toTheoryLog(a.theory ? JSON.parse(a.theory) : null),
    totalMs,
    next: !rv ? null : rv.status === 'mastered' ? 'mastered' : { dueAt: rv.due_at, step: rv.step },
    previous
  }
}
