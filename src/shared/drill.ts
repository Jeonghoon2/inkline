import type { Concept } from './types.ts'
import { midnight } from './review.ts'

export const INTERVALS = [1, 3, 7, 14, 30] // 일
export const GRADES = ['몰랐음', '헷갈림', '알았음'] as const
export type Grade = (typeof GRADES)[number]
export interface DrillRow { concept: string; q: number; step: number; dueAt: string; last: Grade; createdAt: string }
export interface DrillCard { concept: string; q: number }

const localDay = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
// 오늘 새로 만든 카드 수를 뺀 만큼만 새 카드를 내놓는다
const freshLeft = (rows: DrillRow[], now: Date, newLimit: number): number => Math.max(0, newLimit - rows.filter(r => localDay(new Date(r.createdAt)) === localDay(now)).length)

export function nextState(prev: { step: number } | null, grade: Grade, now: Date): { step: number; dueAt: string } {
  const cur = Math.max(0, Math.min(prev?.step ?? 0, INTERVALS.length - 1))
  if (grade === '몰랐음') return { step: 0, dueAt: midnight(now, 1).toISOString() }
  const step = grade === '알았음' ? Math.min(cur + 1, INTERVALS.length - 1) : cur
  return { step, dueAt: midnight(now, INTERVALS[step]).toISOString() }
}

const names = (concepts: Record<string, Concept>): string[] => Object.keys(concepts).sort((a, b) => a.localeCompare(b, 'ko'))

function parts(concepts: Record<string, Concept>, rows: DrillRow[], now: Date): { due: DrillCard[]; fresh: DrillCard[] } {
  const by = new Map(rows.map(r => [`${r.concept}\n${r.q}`, r]))
  const due = rows
    .filter(r => concepts[r.concept] && r.q < concepts[r.concept].qs.length && Date.parse(r.dueAt) <= now.getTime())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.concept.localeCompare(b.concept, 'ko') || a.q - b.q)
    .map(r => ({ concept: r.concept, q: r.q }))
  const fresh: DrillCard[] = []
  for (const concept of names(concepts)) {
    const n = concepts[concept].qs.length
    let q = 0
    while (q < n && by.has(`${concept}\n${q}`)) q++
    if (q >= n) continue
    // 앞 질문을 모두 '알았음' 한 번 이상 한 뒤에야 다음 질문이 새 카드
    let ok = true
    for (let i = 0; i < q; i++) if ((by.get(`${concept}\n${i}`)?.step ?? 0) < 1) ok = false
    if (ok) fresh.push({ concept, q })
  }
  return { due, fresh }
}

export function todayQueue(concepts: Record<string, Concept>, rows: DrillRow[], now: Date, newLimit = 10): DrillCard[] {
  const { due, fresh } = parts(concepts, rows, now)
  return [...due, ...fresh.slice(0, freshLeft(rows, now, newLimit))]
}

export function stats(concepts: Record<string, Concept>, rows: DrillRow[], now: Date, newLimit = 10): { due: number; newAvailable: number; learned: number; total: number } {
  const { due, fresh } = parts(concepts, rows, now)
  return {
    due: due.length,
    newAvailable: Math.min(fresh.length, freshLeft(rows, now, newLimit)),
    learned: rows.filter(r => r.step >= 2 && concepts[r.concept] && r.q < concepts[r.concept].qs.length).length,
    total: Object.values(concepts).reduce((n, c) => n + c.qs.length, 0)
  }
}
