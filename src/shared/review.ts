import type { DueItem, ProblemStatus } from './types.ts'

export const INTERVALS = [1, 3, 7, 21]

export const midnight = (now: Date, plusDays = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + plusDays)

export function nextReview(cur: { step: number } | null, ok: boolean, now: Date): { step: number; dueAt: string; status: 'due' | 'mastered' } {
  const step = ok && cur ? cur.step + 1 : 0
  if (step >= INTERVALS.length) return { step: INTERVALS.length - 1, dueAt: midnight(now).toISOString(), status: 'mastered' }
  return { step, dueAt: midnight(now, INTERVALS[step]).toISOString(), status: 'due' }
}

export function dueLabel(dueAt: string, now: Date): string {
  const n = Math.round((midnight(new Date(dueAt)).getTime() - midnight(now).getTime()) / 86_400_000)
  return n <= 0 ? '오늘' : `D-${n}`
}

export function statusLabel(s: ProblemStatus, now: Date): string {
  switch (s.kind) {
    case 'new': return ''
    case 'solving': return '풀이 중'
    case 'passed': return '통과'
    case 'review': return '복습 ' + dueLabel(s.dueAt, now)
    case 'mastered': return '익힘'
  }
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => deepEq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export function predictedRight(predicted: string | null, expected: unknown): boolean | null {
  if (predicted === null || predicted.trim() === '') return null
  if (predicted.replace(/\s/g, '') === (JSON.stringify(expected) ?? '').replace(/\s/g, '')) return true
  try {
    if (deepEq(JSON.parse(predicted), expected)) return true
  } catch { /* JSON 이 아니면 문자열 비교로 */ }
  return typeof expected === 'string' && predicted.trim() === expected
}

export const sortDue = (items: DueItem[]): DueItem[] =>
  [...items].sort((a, b) => b.maxHint - a.maxHint || (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0))

export const isPassedKind = (k: string): boolean => k === 'passed' || k === 'review' || k === 'mastered' // 어느 사이트든 통과한 것

/** 사이드바 태그 거르기 — 통과한 문제의 태그만 센다(통과 전 유형은 숨김) */
export function passedTagCount(rows: { id: number; classification?: { tags: string[] } | null }[], statuses: Record<number, { kind: string }>): [string, number][] {
  const m = new Map<string, number>()
  for (const r of rows) if (isPassedKind(statuses[r.id]?.kind ?? '')) for (const t of r.classification?.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
