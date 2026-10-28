import type { DatabaseSync } from 'node:sqlite'
import type { Attempt, Lang, RunResult, Stage } from '../../shared/types.ts'

type Row = { id: number; problem_id: number; mode: string; lang: string; code: string; stage: string; stage_ms: string; predicted: string | null; passed: number; started_at: string; ended_at: string | null }

const toAttempt = (r: Row): Attempt => ({
  id: r.id, problemId: r.problem_id, mode: r.mode as Attempt['mode'], lang: r.lang as Lang, code: JSON.parse(r.code), stage: r.stage as Stage,
  stageMs: JSON.parse(r.stage_ms), predicted: r.predicted, passed: r.passed === 1, startedAt: r.started_at, endedAt: r.ended_at
})

export function getAttempt(db: DatabaseSync, id: number): Attempt | null {
  const r = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id) as Row | undefined
  return r ? toAttempt(r) : null
}

export function startAttempt(db: DatabaseSync, problemId: number, lang: Lang, mode: Attempt['mode'] = 'learn'): Attempt {
  const open = db.prepare('SELECT * FROM attempts WHERE problem_id = ? AND mode = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(problemId, mode) as Row | undefined
  if (open) return toAttempt(open)
  const info = db
    .prepare("INSERT INTO attempts (problem_id, mode, lang, code, stage, stage_ms, started_at) VALUES (?, ?, ?, '{}', 'understand', '{}', ?)")
    .run(problemId, mode, lang, new Date().toISOString())
  return getAttempt(db, Number(info.lastInsertRowid))!
}

export function saveCode(db: DatabaseSync, id: number, lang: Lang, code: string): void {
  const a = getAttempt(db, id)
  if (!a) return
  db.prepare('UPDATE attempts SET code = ?, lang = ? WHERE id = ?').run(JSON.stringify({ ...a.code, [lang]: code }), lang, id)
}

export function saveStage(db: DatabaseSync, id: number, stage: Stage, addMs: Partial<Record<Stage, number>>): void {
  const a = getAttempt(db, id)
  if (!a) return
  const ms = { ...a.stageMs }
  for (const [k, v] of Object.entries(addMs)) ms[k as Stage] = Math.min((ms[k as Stage] ?? 0) + v, 1e12)
  db.prepare('UPDATE attempts SET stage = ?, stage_ms = ? WHERE id = ? AND ended_at IS NULL').run(stage, JSON.stringify(ms), id)
}

export function savePredicted(db: DatabaseSync, id: number, text: string): void {
  db.prepare('UPDATE attempts SET predicted = ? WHERE id = ?').run(text, id)
}

export function addRun(db: DatabaseSync, id: number, r: RunResult): void {
  db.prepare('INSERT INTO runs (attempt_id, lang, results, passed, at) VALUES (?, ?, ?, ?, ?)').run(id, r.lang, JSON.stringify(r), r.passed ? 1 : 0, new Date().toISOString())
  if (r.passed) db.prepare('UPDATE attempts SET passed = 1 WHERE id = ?').run(id)
}

export function lastRun(db: DatabaseSync, id: number): RunResult | null {
  const r = db.prepare('SELECT results FROM runs WHERE attempt_id = ? ORDER BY id DESC LIMIT 1').get(id) as { results: string } | undefined
  return r ? JSON.parse(r.results) : null
}
