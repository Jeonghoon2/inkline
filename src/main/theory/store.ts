import type { DatabaseSync } from 'node:sqlite'
import type { Approach, ChosenApproach, SceneSet, TheoryLog } from '../../shared/types.ts'

const json = <T>(s: string | null | undefined): T | null => { if (!s) return null; try { return JSON.parse(s) as T } catch { return null } }

export function getApproaches(db: DatabaseSync, problemId: number): Approach[] | null {
  const r = db.prepare('SELECT approaches FROM problems WHERE id = ?').get(problemId) as { approaches: string | null } | undefined
  return json<Approach[]>(r?.approaches)
}
export function setApproaches(db: DatabaseSync, problemId: number, list: Approach[]): void {
  db.prepare('UPDATE problems SET approaches = ? WHERE id = ?').run(JSON.stringify(list), problemId)
}
export function getScenes(db: DatabaseSync, key: string): SceneSet | null {
  const r = db.prepare('SELECT body FROM scenes WHERE key = ?').get(key) as { body: string } | undefined
  return json<SceneSet>(r?.body)
}
export function putScenes(db: DatabaseSync, key: string, set: SceneSet, cli: string | null, model: string): void {
  db.prepare('INSERT INTO scenes (key, body, cli, model, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, cli = excluded.cli, model = excluded.model, created_at = excluded.created_at')
    .run(key, JSON.stringify(set), cli, model, new Date().toISOString())
}
// 지금까지 나온 개념 key — 모든 문제의 접근 + 이론 장면, 자주 쓴 순
export function conceptKeys(db: DatabaseSync): string[] {
  const n = new Map<string, number>()
  const add = (k: string): void => { n.set(k, (n.get(k) ?? 0) + 1) }
  for (const r of db.prepare('SELECT approaches FROM problems WHERE approaches IS NOT NULL').all() as { approaches: string }[])
    for (const a of json<Approach[]>(r.approaches) ?? []) for (const c of a.concepts) add(c.key)
  for (const r of db.prepare("SELECT substr(key, 9) AS k FROM scenes WHERE key LIKE 'concept:%'").all() as { k: string }[]) add(r.k)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k)
}
// 참고 풀이 · 검산 결과 — main 전용(rowToProblem 에 넣지 않는다)
export function setApproachCheck(db: DatabaseSync, problemId: number, v: unknown): void {
  db.prepare('UPDATE problems SET approach_check = ? WHERE id = ?').run(v === null ? null : JSON.stringify(v), problemId)
}
export function clearMapScenes(db: DatabaseSync, problemId: number): void {
  db.prepare("DELETE FROM scenes WHERE key LIKE 'map:' || ? || ':%'").run(String(problemId))
}
// 같은 태그로 통과한 다른 문제 최대 3개와 그때 고른 접근
export function similarSolved(db: DatabaseSync, problemId: number): { title: string; approach: string }[] {
  const rows = db.prepare(`SELECT p.id, p.title, (SELECT a.theory FROM attempts a WHERE a.problem_id = p.id AND a.site_passed = 1 AND a.theory IS NOT NULL ORDER BY a.id DESC LIMIT 1) AS theory FROM problems p
    WHERE p.id != ? AND EXISTS (SELECT 1 FROM attempts a WHERE a.problem_id = p.id AND a.site_passed = 1)
    AND EXISTS (SELECT 1 FROM json_each(json_extract(p.classification, '$.tags')) t WHERE t.value IN (SELECT value FROM json_each(json_extract((SELECT classification FROM problems WHERE id = ?), '$.tags'))))
    ORDER BY p.id DESC LIMIT 3`).all(problemId, problemId) as { title: string; theory: string | null }[]
  return rows.map(r => ({ title: r.title, approach: toTheoryLog(json(r.theory))?.approach?.name ?? '' }))
}
export function toTheoryLog(raw: unknown): TheoryLog | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if ('own' in r) return r as unknown as TheoryLog
  const name = typeof r.approach === 'string' ? r.approach : '' // 옛 꼴
  return { own: typeof r.firstTry === 'string' ? r.firstTry : '', approach: name ? { name, complexity: '', concepts: [], clue: '' } : null, explain: typeof r.explain === 'string' ? r.explain : '', at: typeof r.at === 'string' ? r.at : '' }
}
export function getTheoryLog(db: DatabaseSync, attemptId: number): TheoryLog | null {
  const r = db.prepare('SELECT theory FROM attempts WHERE id = ?').get(attemptId) as { theory: string | null } | undefined
  return toTheoryLog(json(r?.theory))
}
// 고르는 순간 저장 — 이미 쓴 설명은 그대로
export function chooseApproach(db: DatabaseSync, attemptId: number, a: ChosenApproach, own: string): TheoryLog {
  const prev = getTheoryLog(db, attemptId)
  const log: TheoryLog = { own, approach: a, explain: prev?.explain ?? '', at: new Date().toISOString() }
  db.prepare('UPDATE attempts SET theory = ? WHERE id = ?').run(JSON.stringify(log), attemptId)
  return log
}
export function addExplain(db: DatabaseSync, attemptId: number, explain: string): void {
  const prev = getTheoryLog(db, attemptId) ?? { own: '', approach: null, explain: '', at: '' }
  db.prepare('UPDATE attempts SET theory = ? WHERE id = ?').run(JSON.stringify({ ...prev, explain, at: new Date().toISOString() }), attemptId)
}
// '통과'는 사이트 통과(attempts.site_passed)
export function passedWithTag(db: DatabaseSync, tag: string, exceptProblemId: number): number {
  if (!tag) return 0
  const r = db.prepare(`SELECT COUNT(DISTINCT p.id) AS n FROM problems p JOIN attempts a ON a.problem_id = p.id
    WHERE a.site_passed = 1 AND p.id != ? AND EXISTS (SELECT 1 FROM json_each(json_extract(p.classification, '$.tags')) WHERE value = ?)`).get(exceptProblemId, tag) as { n: number }
  return r.n
}
