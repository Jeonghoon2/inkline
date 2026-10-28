import type { DatabaseSync } from 'node:sqlite'
import type { CustomCase, Problem, RunResult } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

export const MAX_CASES = 20
const MAX_BYTES = 64 * 1024

export function listCases(db: DatabaseSync, problemId: number): CustomCase[] {
  const rows = db.prepare('SELECT id, args, expected FROM custom_cases WHERE problem_id = ? ORDER BY id').all(problemId) as { id: number; args: string; expected: string }[]
  return rows.map(r => ({ id: r.id, args: JSON.parse(r.args), expected: JSON.parse(r.expected) }))
}

export function addCase(db: DatabaseSync, p: Pick<Problem, 'id' | 'examples'>, args: unknown, expected: unknown, now: string): CustomCase {
  if (!Array.isArray(args)) throw new Error(t('입력은 인자를 담은 배열이어야 합니다'))
  const want = p.examples[0]?.args.length
  if (want !== undefined && args.length !== want) throw new Error(t('입력 인자는 {n}개여야 합니다', { n: want }))
  const a = JSON.stringify(args), e = JSON.stringify(expected)
  if (e === undefined) throw new Error(t('기대값이 올바르지 않습니다'))
  if (a.length + e.length > MAX_BYTES) throw new Error(t('예제가 너무 큽니다 (64KB 이하)'))
  const n = (db.prepare('SELECT COUNT(*) AS n FROM custom_cases WHERE problem_id = ?').get(p.id) as { n: number }).n
  if (n >= MAX_CASES) throw new Error(t('내 예제는 문제마다 {n}개까지입니다', { n: MAX_CASES }))
  const r = db.prepare('INSERT INTO custom_cases (problem_id, args, expected, created_at) VALUES (?, ?, ?, ?)').run(p.id, a, e, now)
  return { id: Number(r.lastInsertRowid), args, expected }
}

export function removeCase(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM custom_cases WHERE id = ?').run(id)
}

// 사이트 예제 뒤에 내 예제를 붙인다. mark 는 실행 결과의 내 예제 칸에 custom 표시를 단다
export function withCases(p: Problem, cases: CustomCase[]): { merged: Problem; mark: (r: RunResult) => RunResult } {
  const n = p.examples.length
  return {
    merged: { ...p, examples: [...p.examples, ...cases.map(c => ({ args: c.args, expected: c.expected }))] },
    mark: r => ({ ...r, results: r.results.map(x => (x.index >= n && cases[x.index - n] ? { ...x, custom: { id: cases[x.index - n].id, args: cases[x.index - n].args } } : x)) })
  }
}
