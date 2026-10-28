import type { ProblemSummary } from './types.ts'

// 같은 태그 문제: 묶음 문제들의 태그와 겹치는 다른 문제, 아직 통과 안 한 것 우선
export function relatedProblems(ownIds: number[], rows: ProblemSummary[], passed: Set<number>, limit = 3): ProblemSummary[] {
  const own = new Set(ownIds)
  const tags = new Set(rows.filter(r => own.has(r.id)).flatMap(r => r.classification?.tags ?? []))
  return rows.filter(r => !own.has(r.id) && r.classification?.tags.some(t => tags.has(t)))
    .sort((a, b) => Number(passed.has(a.id)) - Number(passed.has(b.id))).slice(0, limit)
}
