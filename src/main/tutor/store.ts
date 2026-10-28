import type { DatabaseSync } from 'node:sqlite'
import type { Hint, HintBody, HintLevel, Mistake, MistakeType, Stage } from '../../shared/types.ts'

type HRow = { id: number; attempt_id: number; level: number; body: string; self_explain: string | null; at: string }
type MRow = { id: number; attempt_id: number; problem_id: number; type: string; line: number | null; note: string; at: string }

const toHint = (r: HRow): Hint => ({ id: r.id, attemptId: r.attempt_id, level: r.level as HintLevel, body: JSON.parse(r.body), selfExplain: r.self_explain, at: r.at })
const toMistake = (r: MRow): Mistake => ({ id: r.id, attemptId: r.attempt_id, problemId: r.problem_id, type: r.type as MistakeType, line: r.line, note: r.note, at: r.at })

export function addHint(db: DatabaseSync, attemptId: number, level: HintLevel, body: HintBody, selfExplain: string | null): Hint {
  const info = db.prepare('INSERT INTO hints (attempt_id, level, body, self_explain, at) VALUES (?, ?, ?, ?, ?)')
    .run(attemptId, level, JSON.stringify(body), selfExplain, new Date().toISOString())
  return toHint(db.prepare('SELECT * FROM hints WHERE id = ?').get(Number(info.lastInsertRowid)) as HRow)
}

export const listHints = (db: DatabaseSync, attemptId: number): Hint[] =>
  (db.prepare('SELECT * FROM hints WHERE attempt_id = ? ORDER BY level, id').all(attemptId) as HRow[]).map(toHint)

export function setStageAnswer(db: DatabaseSync, hintId: number, stage: Stage): void {
  const r = db.prepare('SELECT * FROM hints WHERE id = ?').get(hintId) as HRow | undefined
  if (!r) return
  const body = JSON.parse(r.body) as HintBody
  if (body.kind !== 'stage') return
  db.prepare('UPDATE hints SET body = ? WHERE id = ?').run(JSON.stringify({ ...body, answer: stage }), hintId)
}

export function addMistake(db: DatabaseSync, m: Omit<Mistake, 'id' | 'at'> & { codeHash: string }): Mistake {
  const info = db.prepare('INSERT INTO mistakes (attempt_id, problem_id, type, line, note, code_hash, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(m.attemptId, m.problemId, m.type, m.line, m.note, m.codeHash, new Date().toISOString())
  return toMistake(db.prepare('SELECT * FROM mistakes WHERE id = ?').get(Number(info.lastInsertRowid)) as MRow)
}

export const hasMistake = (db: DatabaseSync, attemptId: number, codeHash: string): boolean =>
  !!db.prepare('SELECT 1 FROM mistakes WHERE attempt_id = ? AND code_hash = ?').get(attemptId, codeHash)

export function listMistakes(db: DatabaseSync, problemId?: number): Mistake[] {
  const rows = problemId === undefined
    ? db.prepare('SELECT * FROM mistakes ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM mistakes WHERE problem_id = ? ORDER BY id DESC').all(problemId)
  return (rows as MRow[]).map(toMistake)
}

export function mistakesByType(db: DatabaseSync): { type: MistakeType; count: number; items: (Mistake & { title: string })[] }[] {
  const rows = db.prepare('SELECT m.*, p.title AS title FROM mistakes m JOIN problems p ON p.id = m.problem_id ORDER BY m.id DESC').all() as (MRow & { title: string })[]
  const g = new Map<MistakeType, (Mistake & { title: string })[]>()
  for (const r of rows) {
    const items = g.get(r.type as MistakeType) ?? []
    items.push({ ...toMistake(r), title: r.title })
    g.set(r.type as MistakeType, items)
  }
  return [...g].map(([type, items]) => ({ type, count: items.length, items })).sort((a, b) => b.count - a.count)
}

// 시도 · 유형당 한 줄: 있으면 고치고 없으면 넣는다
export function upsertMistake(db: DatabaseSync, m: Omit<Mistake, 'id' | 'at'> & { codeHash: string }): Mistake {
  const old = db.prepare('SELECT id FROM mistakes WHERE attempt_id = ? AND type = ?').get(m.attemptId, m.type) as { id: number } | undefined
  if (!old) return addMistake(db, m)
  db.prepare('UPDATE mistakes SET line = ?, note = ?, code_hash = ?, at = ? WHERE id = ?').run(m.line, m.note, m.codeHash, new Date().toISOString(), old.id)
  return toMistake(db.prepare('SELECT * FROM mistakes WHERE id = ?').get(old.id) as MRow)
}
