// ~/My-History 읽기 — work-history 스킬 site/build.mjs · concepts.mjs 의 규칙을 그대로 옮겼다. 이 폴더에는 쓰지 않는다
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Concept, Entry, HistoryData, Role, Report } from '../shared/types.ts'

const NOT_CATEGORY = new Set(['reports', 'resume', 'src', 'shorts', 'knowledge'])
const read = (p: string): string => readFileSync(p, 'utf8')
const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function parseEntries(root: string): Entry[] {
  const entries: Entry[] = []
  for (const cat of readdirSync(root)) {
    const dir = join(root, cat)
    if (cat.startsWith('.') || NOT_CATEGORY.has(cat) || !isDir(dir)) continue
    for (const f of readdirSync(dir).filter(n => /^\d{4}-\d{2}\.md$/.test(n))) {
      let date: string | null = null
      let cur: Entry | null = null
      let sec = ''
      for (const line of read(join(dir, f)).split('\n')) {
        const d = line.match(/^## (\d{4}-\d{2}-\d{2})/)
        if (d) {
          date = d[1]
          continue
        }
        const h = line.match(/^### (.+)/)
        if (h && date) {
          cur = { category: cat, date, title: h[1].replace(/^[^—]+—\s*/, ''), type: '', tags: [], body: '', sections: {} }
          sec = '수행 일지'
          entries.push(cur)
          continue
        }
        if (!cur) continue
        const s = line.match(/^#### (.+)/)
        if (s) {
          sec = s[1].trim()
          continue
        }
        if (/^#/.test(line)) {
          cur = null
          continue
        }
        const b = line.match(/^- (종류|분류|내용):\s*(.*)/)
        if (b?.[1] === '종류') cur.type = b[2].trim()
        else if (b?.[1] === '내용') cur.body = b[2].trim()
        else if (b)
          cur.tags = b[2]
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
            .map(t => {
              const [major, ...rest] = t.split(' - ')
              return { major: major.trim(), minor: rest.join(' - ').trim() }
            })
        else cur.sections[sec] = (cur.sections[sec] ?? '') + line + '\n'
      }
    }
  }
  for (const e of entries)
    for (const k of Object.keys(e.sections)) {
      e.sections[k] = e.sections[k].trim()
      if (!e.sections[k]) delete e.sections[k]
    }
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

export function parseConcepts(root: string): Record<string, Concept> {
  const concepts: Record<string, Concept> = {}
  const path = join(root, 'concepts.md')
  if (!existsSync(path)) return concepts
  let c: Concept | null = null
  for (const line of read(path).split('\n')) {
    const h = line.match(/^## (.+)/)
    if (h) {
      c = concepts[h[1].trim()] = { why: '', qs: [] }
      continue
    }
    if (!c || !line.trim() || line.startsWith('<!--')) continue
    const q = line.match(/^- Q:\s*(.+)/)
    const a = line.match(/^\s+A:\s*(.+)/)
    if (q) c.qs.push({ q: q[1].trim(), a: '' })
    else if (a && c.qs.length) c.qs[c.qs.length - 1].a = a[1].trim()
    else c.why += (c.why ? '\n' : '') + line.trim()
  }
  return concepts
}

// 쇼츠 파일 이름 — concept-shorts 와 같은 규칙이어야 같은 파일을 찾는다
export const slug = (name: string): string => name.replace(/[/\\:*?"<>|\s]+/g, '_')

const mdFiles = (dir: string, re: RegExp): string[] => (isDir(dir) ? readdirSync(dir).filter(n => re.test(n)) : [])

export function loadHistory(root: string): HistoryData {
  const loadedAt = new Date().toISOString()
  if (!isDir(root)) return { root, exists: false, entries: [], reports: [], resume: '', roles: [], concepts: {}, shorts: [], loadedAt }
  const reports: Report[] = mdFiles(join(root, 'reports'), /\.md$/)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map(n => ({ name: n.replace(/\.md$/, ''), text: read(join(root, 'reports', n)) }))
  const roles: Role[] = mdFiles(join(root, 'resume'), /^[a-z0-9-]+\.md$/)
    .sort()
    .map(n => ({ slug: n.replace(/\.md$/, ''), text: read(join(root, 'resume', n)) }))
  const resumePath = join(root, 'resume.md')
  const concepts = parseConcepts(root)
  const shorts = Object.keys(concepts).filter(k => existsSync(join(root, 'shorts', `${slug(k)}.mp4`)))
  return {
    root,
    exists: true,
    entries: parseEntries(root),
    reports,
    resume: existsSync(resumePath) ? read(resumePath) : '',
    roles,
    concepts,
    shorts,
    loadedAt
  }
}
