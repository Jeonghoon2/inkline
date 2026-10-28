// 지식사전 항목(~/My-History/knowledge/<분류>/<slug>.md) 읽기 · 쓰기 · 목차. 순수 함수만.
export const KINDS = ['논문', '메타분석', '지침', '사례', '책', '문서', '기사'] as const
export type Kind = (typeof KINDS)[number]
export interface KItem {
  category: string; slug: string
  title: string; kind: Kind | ''; source: string; url: string; tags: string[]; summary: string
  file?: string // 같은 폴더에 보관한 원문 파일 이름(예: pretesting-effect.pdf). ''·없음 = 없음
  added: string; by: string
  points: string; uses: string; memo: string
  error: string | null
}

export interface KnowledgeData { root: string; exists: boolean; items: KItem[]; categories: string[] }

const KEYS = ['종류', '출처', '주소', '원문', '태그', '요약', '추가']
const H_POINTS = '핵심 내용'
const H_USES = '우리 작업에 쓴 곳'
const H_MEMO = '메모'

export function parseItem(category: string, slug: string, text: string): KItem {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  let title = ''
  const kv: Record<string, string> = {}
  const secs: [string, string[]][] = []
  const hx: string[] = [] // 머리말의 모르는 줄 — 잃지 않게 memo 로
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('## ')) { secs.push([line.slice(3).trim(), []]); continue }
    if (secs.length) { secs[secs.length - 1][1].push(line); continue }
    if (!title && line.startsWith('# ')) { title = line.slice(2).trim(); continue }
    const m = /^-\s*([^:：]+?)\s*[:：]\s*(.*)$/.exec(line)
    if (m && KEYS.includes(m[1]) && !(m[1] in kv)) {
      kv[m[1]] = m[2].trim()
      if (m[1] === '종류' && kv[m[1]] && !(KINDS as readonly string[]).includes(kv[m[1]])) hx.push(line) // 모르는 종류는 memo 에 보이게
    }
    else if (line.trim()) hx.push(line)
  }
  const body = (ls: string[]) => ls.join('\n').trim()
  let points = '', uses = '', memo = ''
  const extra: string[] = []
  for (const [name, ls] of secs) {
    const j = (a: string) => [a, body(ls)].filter(Boolean).join('\n\n')
    if (name === H_POINTS) points = j(points)
    else if (name === H_USES) uses = j(uses)
    else if (name === H_MEMO) memo = j(memo)
    else extra.push(`## ${name}\n${body(ls)}`.trim())
  }
  if (hx.length || extra.length) memo = [memo, hx.join('\n'), ...extra].filter(Boolean).join('\n\n')

  const kind = (KINDS as readonly string[]).includes(kv['종류']) ? (kv['종류'] as Kind) : ''
  const ad = kv['추가'] ?? ''
  let added = '', by = ''
  if (ad.includes('·')) [added, by] = ad.split(/\s*·\s*(.*)/s).map((s) => s.trim())
  else if (/^\d{4}-\d{2}-\d{2}$/.test(ad)) added = ad
  else by = ad
  const source = kv['출처'] ?? ''
  const summary = kv['요약'] ?? ''
  const error = !title ? '제목 없음' : !kind ? '종류 없음' : !source ? '출처 없음' : !summary ? '요약 없음' : null
  return {
    category, slug, title, kind, source, url: kv['주소'] ?? '',
    tags: (kv['태그'] ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    ...(kv['원문'] ? { file: kv['원문'] } : {}),
    summary, added, by, points, uses, memo, error,
  }
}

export function serializeItem(i: KItem): string {
  const one = (v: string) => v.replace(/\s*[\r\n\u2028\u2029\u0085]+\s*/g, ' ').trim()
  const head = [`# ${one(i.title)}`]
  const add = (k: string, v: string) => { if (v = one(v)) head.push(`- ${k}: ${v}`) }
  add('종류', i.kind); add('출처', i.source); add('주소', i.url); add('원문', i.file ?? '')
  add('태그', i.tags.join(', ')); add('요약', i.summary)
  add('추가', i.by ? `${i.added} · ${i.by}`.trim() : i.added)
  const out = [head.join('\n')]
  if (i.points) out.push(`## ${H_POINTS}\n${i.points}`)
  if (i.uses) out.push(`## ${H_USES}\n${i.uses}`)
  if (i.memo) out.push(i.memo.startsWith('## ') ? i.memo : `## ${H_MEMO}\n${i.memo}`) // 모르는 섹션만 있는 memo 는 제목을 또 달지 않는다
  return out.join('\n\n') + '\n'
}

export function slugify(title: string): string {
  const s = title.normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣\s]/g, '').trim().replace(/\s+/g, '-').slice(0, 60).replace(/-+$/, '')
  return s || 'item'
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

export function validName(n: unknown): n is string {
  // eslint-disable-next-line no-control-regex
  return typeof n === 'string' && n.length >= 1 && n.length <= 80 && n === n.trim() && !n.startsWith('.') && !/[/\\:\u0000-\u001f\u007f]/.test(n)
}

const normUrl = (u: string) => {
  const [base, query = ''] = u.trim().split('#')[0].split('?')
  const q = query.split('&').filter((p) => p && !p.toLowerCase().startsWith('utm_')).join('&')
  const b = base.replace(/\/+$/, '').replace(/^([a-z][a-z0-9+.-]*:\/\/[^/]*)/i, (h) => h.toLowerCase())
  return b + (q ? `?${q}` : '')
}
const normTitle = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()

// 주소 칸 — http(s) 이고 호스트가 있어야 한다('http://' 만 적은 것은 안 된다)
export function validHttpUrl(u: string): boolean {
  try { const x = new URL(u); return (x.protocol === 'http:' || x.protocol === 'https:') && !!x.hostname } catch { return false }
}

export function findDuplicate(items: KItem[], q: { url?: string; title?: string }, except?: string): KItem | null {
  const u = q.url ? normUrl(q.url) : ''
  const t = q.title ? normTitle(q.title) : ''
  return items.find((i) =>
    `${i.category}/${i.slug}` !== except &&
    ((u && i.url && normUrl(i.url) === u) || (t && normTitle(i.title) === t))) ?? null
}

const cell = (s: string) =>
  s.replace(/[\r\n\u2028\u2029]+/g, ' ').trim().replace(/(\\*)\|/g, (_, b) => b + b + '\\|').replace(/\\$/, '\\\\')

export function buildIndex(items: KItem[]): string {
  const cats = new Map<string, KItem[]>()
  for (const i of items) cats.set(i.category, [...(cats.get(i.category) ?? []), i])
  const names = [...cats.keys()].sort((a, b) => a.localeCompare(b, 'ko'))
  const out = [
    '# 지식사전 목차',
    '',
    '이 파일은 자동으로 만든다 — 항목 파일을 고치고 `node ~/.claude/skills/knowledge/index.mjs` 를 돌린다 (앱은 저장할 때 다시 만든다).',
    '',
    `전체 ${items.length}개${names.map((c) => ` · ${c} ${cats.get(c)!.length}`).join('')}`,
  ]
  for (const c of names) {
    out.push('', `## ${c}`, '| 제목 | 종류 | 태그 | 요약 | 파일 |', '| --- | --- | --- | --- | --- |')
    for (const i of [...cats.get(c)!].sort((a, b) => a.title.localeCompare(b.title, 'ko')))
      out.push(`| ${cell(i.title)} | ${i.error ? '형식 오류' : cell(i.kind)} | ${cell(i.tags.join(', '))} | ${cell(i.summary)} | ${cell(`${i.category}/${i.slug}.md`)} |`)
  }
  return out.join('\n') + '\n'
}

// 기록 글 속 `(지식사전: <분류>/<슬러그>)` — 분류에 공백 · '·' 가 있을 수 있어 ')' 까지 읽고 마지막 '/' 에서 나눈다
export const KREF = /\(지식사전: ([^)\n<]+)\)/g
// 한 괄호 안의 '분류/슬러그' 여럿(쉼표로 나눔). 슬러그엔 쉼표가 없으니 '/' 없는 조각은 다음 조각의 분류 이름에 붙인다
export function refKeys(inner: string): string[] {
  const out: string[] = []
  let buf = ''
  for (const piece of inner.split(',')) {
    buf = buf ? `${buf},${piece}` : piece
    const at = buf.lastIndexOf('/')
    if (at > 0 && buf.slice(at + 1).trim()) { out.push(buf.trim()); buf = '' }
  }
  return out
}
export function knowledgeRefs(text: string): { category: string; slug: string }[] {
  return [...text.matchAll(KREF)].flatMap(m => refKeys(m[1]!)).map(k => {
    const at = k.lastIndexOf('/')
    return { category: k.slice(0, at).trim(), slug: k.slice(at + 1).trim() }
  })
}
