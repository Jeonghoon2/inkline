import type { DatabaseSync } from 'node:sqlite'
import { nextState, type DrillRow, type Grade } from '../../shared/drill.ts'

export function drillRows(db: DatabaseSync): DrillRow[] {
  return db.prepare('SELECT concept, q, step, due_at AS dueAt, last, created_at AS createdAt FROM drill ORDER BY concept, q').all().map(r => ({ ...r })) as unknown as DrillRow[]
}
export function gradeDrill(db: DatabaseSync, concept: string, q: number, grade: Grade, now: Date): DrillRow[] {
  const prev = db.prepare('SELECT step FROM drill WHERE concept = ? AND q = ?').get(concept, q) as { step: number } | undefined
  const s = nextState(prev ?? null, grade, now)
  db.prepare('INSERT INTO drill (concept, q, step, due_at, last, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(concept, q) DO UPDATE SET step = excluded.step, due_at = excluded.due_at, last = excluded.last, updated_at = excluded.updated_at')
    .run(concept, q, s.step, s.dueAt, grade, now.toISOString(), now.toISOString())
  return drillRows(db)
}
