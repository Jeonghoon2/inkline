import type { DatabaseSync } from 'node:sqlite'
import type { Classification, Problem, ProblemDraft, ProblemSummary } from '../../shared/types.ts'

// 같은 url 이 있으면 UNIQUE 제약으로 throw 한다. 부르는 쪽이 getProblemByUrl 로 먼저 확인한다
export function insertProblem(db: DatabaseSync, d: ProblemDraft): Problem {
  const info = db
    .prepare(
      `INSERT INTO problems (site, site_id, url, title, html, examples, starter, signature, site_level, site_tags, classification, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(
      d.site,
      d.siteId,
      d.url,
      d.title,
      d.html,
      JSON.stringify(d.examples),
      JSON.stringify(d.starter),
      d.signature === null ? null : JSON.stringify(d.signature),
      d.siteLevel,
      JSON.stringify(d.siteTags),
      new Date().toISOString()
    )
  return getProblem(db, Number(info.lastInsertRowid))!
}

export function getProblem(db: DatabaseSync, id: number): Problem | null {
  const row = db.prepare('SELECT * FROM problems WHERE id = ?').get(id) as Row | undefined
  return row ? rowToProblem(row) : null
}

export function getProblemByUrl(db: DatabaseSync, url: string): Problem | null {
  const row = db.prepare('SELECT * FROM problems WHERE url = ?').get(url) as Row | undefined
  return row ? rowToProblem(row) : null
}

export function listProblems(db: DatabaseSync): ProblemSummary[] {
  const rows = db
    .prepare('SELECT id, site, title, url, site_level, classification, created_at FROM problems ORDER BY id DESC')
    .all() as Row[]
  return rows.map(r => ({
    id: r.id,
    site: r.site as ProblemSummary['site'],
    title: r.title,
    url: r.url,
    siteLevel: r.site_level,
    classification: parseJson<Classification>(r.classification),
    createdAt: r.created_at
  }))
}

export function setClassification(db: DatabaseSync, id: number, c: Classification): void {
  db.prepare('UPDATE problems SET classification = ? WHERE id = ?').run(JSON.stringify(c), id)
}

type Row = {
  id: number
  site: string
  site_id: string
  url: string
  title: string
  html: string
  examples: string
  starter: string
  signature: string | null
  site_level: string
  site_tags: string
  classification: string | null
  created_at: string
}

function parseJson<T>(s: string | null): T | null {
  return s === null ? null : (JSON.parse(s) as T)
}

function rowToProblem(r: Row): Problem {
  return {
    id: r.id,
    site: r.site as Problem['site'],
    siteId: r.site_id,
    url: r.url,
    title: r.title,
    html: r.html,
    examples: JSON.parse(r.examples),
    starter: JSON.parse(r.starter),
    signature: parseJson(r.signature),
    siteLevel: r.site_level,
    siteTags: JSON.parse(r.site_tags),
    classification: parseJson(r.classification),
    createdAt: r.created_at
  }
}
