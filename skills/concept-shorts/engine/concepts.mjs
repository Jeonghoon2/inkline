// 개념 사전(concepts.md)·기록 읽기 — 원본. 쇼츠 엔진이 쓰고, work-history 스킬의 site/concepts.mjs 는 이 파일의 복사본이다(스킬 하나만 받아도 돌게 두 벌). 고치면 그쪽에도 복사 — site/verify.mjs 가 두 파일이 같은지 본다
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const CONCEPT = /==([^=|]+?)(?:\|([^=]+?))?==/g

// '## 개념 이름', 원리 문단, '- Q: 질문' + '  A: 답'. raw 는 그 개념 블록 원문(쇼츠 대본에 넘긴다)
// 쇼츠 후속으로 생긴 항목은 이름 아래 '<!-- 후속: 선행 · <원래 개념> 쇼츠에서 — <이유> -->' 한 줄이 있다 → from
export function parseConcepts(root) {
  const concepts = {}
  const path = join(root, 'concepts.md')
  if (!existsSync(path)) return concepts
  let c = null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const h = line.match(/^## (.+)/)
    if (h) { c = concepts[h[1].trim()] = { why: '', qs: [], raw: '' }; continue }
    if (!c || !line.trim()) continue
    const note = line.match(/^<!--\s*후속:\s*(선행|심화)\s*·\s*(.+?) 쇼츠에서 — (.*?)\s*-->$/)
    if (note) { c.from = { kind: note[1], name: note[2], why: note[3] }; continue }
    if (line.startsWith('<!--')) continue
    c.raw += line + '\n'
    const q = line.match(/^- Q:\s*(.+)/)
    const a = line.match(/^\s+A:\s*(.+)/)
    if (q) c.qs.push({ q: q[1].trim(), a: '' })
    else if (a && c.qs.length) c.qs.at(-1).a = a[1].trim()
    else c.why += (c.why ? '\n' : '') + line.trim()
  }
  return concepts
}

// 파일 이름 — 개념 이름에서 경로에 못 쓰는 글자만 바꾼다(이름은 사전에 있는 것만 받는다)
export const slug = name => name.replace(/[\/\\:*?"<>|\s]+/g, '_')

// 사전 한 항목 — 후속으로 새로 쓴 개념을 concepts.md 끝에 붙일 때. parseConcepts 가 그대로 다시 읽는다
export const conceptBlock = (name, { why, qs }, from) =>
  `## ${name}\n${from ? `<!-- 후속: ${from.kind} · ${from.name} 쇼츠에서 — ${from.why} -->\n` : ''}${why.trim()}\n${qs.map(q => `- Q: ${q.q.trim()}\n  A: ${q.a.trim()}\n`).join('')}`

// 그 개념을 칠한 기록 전체 — 쇼츠 대본에 사건의 상황·문제·해결 과정을 넘긴다. 형광펜 기호는 빼고, 합쳐 limit 자까지
export function conceptEntries(root, name, limit = 2500) {
  const blocks = []
  for (const cat of readdirSync(root)) {
    const dir = join(root, cat)
    if (cat.startsWith('.') || !statSync(dir).isDirectory()) continue
    for (const f of readdirSync(dir).filter(n => /^\d{4}-\d{2}\.md$/.test(n))) {
      let date = ''
      for (const part of readFileSync(join(dir, f), 'utf8').split(/^(?=## \d{4}-\d{2}-\d{2}|### )/m)) {
        const d = part.match(/^## (\d{4}-\d{2}-\d{2})/)
        if (d) { date = d[1]; continue }
        if (!part.startsWith('### ') || ![...part.matchAll(CONCEPT)].some(m => (m[2] ?? m[1]).trim() === name)) continue
        blocks.push(`[${cat} ${date}] ${part.replace(CONCEPT, '$1').replace(/^- (종류|분류):.*\n/gm, '').trim()}`)
      }
    }
  }
  // 트러블슈팅(사건이 가장 자세한 기록)을 앞에
  blocks.sort((a, b) => /트러블슈팅/.test(b.split('\n')[0]) - /트러블슈팅/.test(a.split('\n')[0]))
  let out = ''
  for (const b of blocks) { if (out.length + b.length > limit) { if (!out) out = b.slice(0, limit); break } out += (out ? '\n\n' : '') + b }
  return out
}

// 그 개념을 칠한 기록 줄 — '[카테고리 날짜 · 제목] 줄' (형광펜 기호는 뺀다)
export function conceptLines(root, name, limit = 12) {
  const out = []
  for (const cat of readdirSync(root)) {
    const dir = join(root, cat)
    if (cat.startsWith('.') || !statSync(dir).isDirectory()) continue
    for (const f of readdirSync(dir).filter(n => /^\d{4}-\d{2}\.md$/.test(n))) {
      let date = '', title = ''
      for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
        const d = line.match(/^## (\d{4}-\d{2}-\d{2})/)
        if (d) date = d[1]
        const h = line.match(/^### (.+)/)
        if (h) title = h[1]
        if ([...line.matchAll(CONCEPT)].some(m => (m[2] ?? m[1]).trim() === name))
          out.push(`[${cat} ${date} · ${title}] ${line.replace(CONCEPT, '$1').replace(/^[-\d.\s]+/, '')}`)
      }
    }
  }
  return out.slice(0, limit)
}
