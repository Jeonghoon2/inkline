import type { Example, Lang, ProblemDraft, Signature } from '../../shared/types.ts'
import { decodeEntities, parseLiteral } from './literal.ts'
import { javaType } from './types.ts'

// 같은 깊이의 </div> 를 찾아 그 앞까지를 돌려준다 (여는 · 닫는 div 수를 센다)
function innerOfDiv(html: string, openEnd: number): string | null {
  const re = /<div\b|<\/div>/g
  re.lastIndex = openEnd
  let depth = 1
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return html.slice(openEnd, m.index)
  }
  return null
}

function extractBody(page: string): string | null {
  const sec = page.search(/<div class="guide-section-description"/)
  if (sec < 0) return null
  const open = /<div class="markdown[^"]*"[^>]*>/.exec(page.slice(sec))
  if (!open) return null
  return innerOfDiv(page, sec + open.index + open[0].length)
}

function extractStarter(page: string): string | undefined {
  const m = /<textarea[^>]*id="code"[^>]*>([\s\S]*?)<\/textarea>/.exec(page)
  return m ? decodeEntities(m[1]) : undefined
}

function parseSignature(java: string | undefined): Signature | null {
  const m = java && /public\s+([\w[\]]+)\s+(solution)\s*\(([^)]*)\)/.exec(java)
  if (!m) return null
  const params = m[3].split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const i = p.lastIndexOf(' ')
    return { name: p.slice(i + 1), type: javaType(p.slice(0, i)) }
  })
  return { name: m[2], params, returns: javaType(m[1]) }
}

const cells = (row: string, tag: 'td' | 'th'): string[] =>
  [...row.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(c => c[1].replace(/<[^>]+>/g, ''))

// '입출력 예' 제목 중 바로 뒤에 표가 오는 첫 번째 (뒤의 '입출력 예 설명' 은 건너뛴다)
function parseExamples(body: string, paramCount: number | null): Example[] {
  if (paramCount === null) return []
  const table = /<h5[^>]*>\s*입출력 예\s*<\/h5>\s*<table[\s\S]*?<\/table>/.exec(body)
  if (!table) return []
  const rows = [...table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r => cells(r[1], 'td')).filter(r => r.length)
  if (rows.some(r => r.length !== paramCount + 1)) return []
  return rows.map(r => {
    const v = r.map(c => parseLiteral(decodeEntities(c)))
    return { args: v.slice(0, -1), expected: v[v.length - 1] }
  })
}

export function parseProgrammers(id: string, pages: Partial<Record<Lang, string>>): ProblemDraft | null {
  const first = Object.values(pages).find(Boolean)
  const html = first ? extractBody(first) : null
  if (!first || html === null) return null
  const title = /data-lesson-title="([^"]*)"/.exec(first)?.[1] ?? /class="challenge-title"[^>]*>([^<]*)</.exec(first)?.[1] ?? ''
  if (!title.trim()) return null
  const level = /data-challenge-level="(\d+)"/.exec(first)?.[1]
  const starter: Partial<Record<Lang, string>> = {}
  for (const [lang, page] of Object.entries(pages) as [Lang, string][]) {
    const code = extractStarter(page)
    if (code !== undefined) starter[lang] = code
  }
  const signature = parseSignature(starter.java)
  return {
    site: 'programmers',
    siteId: id,
    url: `https://school.programmers.co.kr/learn/courses/30/lessons/${id}`,
    title: decodeEntities(title.trim()),
    html,
    examples: parseExamples(html, signature && signature.params.length),
    starter,
    signature,
    siteLevel: level ? `Lv. ${level}` : '',
    siteTags: []
  }
}
