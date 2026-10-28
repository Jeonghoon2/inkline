// 이력서 문자열 도우미 — 참고 구현(work-history site/src/scripts/resume.js)과 같은 규칙. DOM 을 쓰지 않는다
import type { Entry, Role } from '../../shared/types.ts'
import { esc } from './render.ts'
import { t } from '../../shared/i18n.ts'

const ICON: Record<string, string> = {
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'
}
const icon = (name: string): string => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`

const CV_SKILL = /기술|스킬/ // i18n-ok — 이력서 구역 이름 표지
// '2024.03 ~ 현재' → 달 수(시작·끝 달 포함). 못 읽으면 0
export function cvMonths(period: string, now: Date): number {
  const m = String(period).match(/(\d{4})\.(\d{1,2})\s*[~-]\s*(?:(\d{4})\.(\d{1,2})|현재)/) // i18n-ok
  if (!m) return 0
  const [y, mo] = m[3] ? [+m[3], +m[4]!] : [now.getFullYear(), now.getMonth() + 1]
  return Math.max(0, (y! - +m[1]!) * 12 + (mo! - +m[2]!) + 1)
}
// 기간은 화면 언어가 아니라 이력서 문서의 언어를 따른다(한국어 이력서에 영어 단위가 섞이면 PDF 가 깨진다)
export const cvSpan = (n: number, en = false): string =>
  (en ? [n >= 12 && `${Math.floor(n / 12)} yr`, n % 12 && `${n % 12} mo`] : [n >= 12 && `${Math.floor(n / 12)}년`, n % 12 && `${n % 12}개월`]).filter(Boolean).join(' ') // i18n-ok

interface Proj { title: string; sub: boolean; org: boolean; period: string; role: string; stack: string[]; html: string; at?: string[]; part?: string; skills?: string[] }
interface Sec { name: string; html: string; months?: number }

export function renderResume(text: string, now: Date, photo = ''): string {
  if (!text.trim()) return ''
  const en = !/[가-힣]/.test(text) // i18n-ok — 한글이 없으면 영어 이력서
  const span = (n: number): string => cvSpan(n, en)
  const inline = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]/g, '<span class="cv-blank">[$1]</span>')
  let name = '', intro = ''
  let sec: Sec | null = null, proj: Proj | null = null
  let list: string[] = []
  const contact: string[] = []
  const secs: Sec[] = []
  const out = (html: string): void => { if (proj) proj.html += html; else if (sec) sec.html += html }
  const chips = (xs: string[]): string => `<ul class="cv-chips">${xs.map((t, i) => `<li>${inline(t)}${i < xs.length - 1 ? '<span class="cv-sep">, </span>' : ''}</li>`).join('')}</ul>`
  const splitComma = (s: string): string[] => s.split(/,\s*(?![^()]*\))/).map(t => t.trim()).filter(Boolean)
  const flushList = (): void => {
    if (!list.length) return
    if (sec && CV_SKILL.test(sec.name) && !proj) {
      const kv = list.map(l => l.match(/^([^:]+):\s*(.+)/))
      const bare = list.filter((_, i) => !kv[i])
      out(kv.filter(m => m).map(m => `<div class="cv-skill"><span class="cv-skill-k">${inline(m![1]!)}<span class="cv-sep">: </span></span>${chips(splitComma(m![2]!))}</div>`).join('') +
        (bare.length ? `<div class="cv-skill"><span class="cv-skill-k"></span>${chips(bare)}</div>` : ''))
    } else out(`<ul>${list.map(l => `<li>${inline(l)}</li>`).join('')}</ul>`)
    list = []
  }
  const flushProj = (): void => {
    flushList()
    if (!sec) { proj = null; return }
    if (!proj) return
    const n = cvMonths(proj.period, now)
    const used = proj.stack.length ? `<ul class="cv-used"><li>${en ? 'Tech stack' : '사용 기술'}: ${proj.stack.map(inline).join(', ')}</li></ul>` : '' // i18n-ok — 이력서 문서의 언어를 따른다
    if (proj.org) {
      const meta = [proj.period && `${inline(proj.period)}${n ? ` (${span(n)})` : ''}`, proj.role && inline(proj.role)].filter(Boolean)
      sec.html += `<div class="cv-org"><span class="cv-tile">${icon('briefcase')}</span><div class="cv-org-body"><h3>${inline(proj.title)}</h3>` +
        `${meta.length ? `<p class="cv-meta num">${meta.map(m => `<span>${m}</span>`).join(' ')}</p>` : ''}${used}${proj.html}</div></div>`
      sec.months = (sec.months ?? 0) + n // ponytail: 겹친 재직 기간은 두 번 센다, 겹치면 달 집합으로 세기
    } else {
      const h = proj.sub ? 'h4' : 'h3'
      const date = proj.at ? `<p class="cv-pmeta num"><span>${inline(proj.at[0]!)} ${inline(proj.at[1]!)}</span> <span>${inline(proj.period)}${n ? ` (${span(n)})` : ''}</span></p>`
        : proj.period ? `<p class="cv-date num">${inline(proj.period)}</p>` : ''
      const skills = proj.skills ? `<div class="cv-pskills"><p class="cv-part">Skills</p>${chips(proj.skills)}</div>` : ''
      sec.html += `<div class="cv-proj${proj.sub ? ' is-sub' : ''}"><${h}>${inline(proj.title)}</${h}>` +
        `${date}${proj.role ? `<p class="cv-role">${inline(proj.role)}</p>` : ''}${proj.html}${used}${skills}</div>`
    }
    proj = null
  }
  for (const raw of text.split('\n')) {
    const l = raw.trimEnd()
    if (/^# /.test(l)) { name = `<h1 class="cv-name">${inline(l.slice(2))}</h1>`; continue }
    if (/^> /.test(l)) { intro += `<p class="cv-intro">${inline(l.slice(2))}</p>`; continue }
    if (/^## /.test(l)) { flushProj(); sec = { name: l.slice(3).trim(), html: '' }; secs.push(sec); continue }
    if (/^#{3,4} /.test(l)) {
      flushProj()
      const sub = l.startsWith('#### ')
      proj = { title: l.replace(/^#{3,4} /, ''), sub, org: !sub && /경력/.test(sec?.name ?? ''), period: '', role: '', stack: [], html: '' } // i18n-ok
      continue
    }
    const at = proj && l.match(/^(소속|고객사|회사):\s*(.+?)\s*\/\s*기간:\s*(.+)$/) // i18n-ok
    if (proj && at) { proj.at = [at[1]!, at[2]!]; proj.period = at[3]!; continue }
    const part = proj && l.match(/^\*\*(Description|What did I do)\*\*\s*$/)
    if (proj && part) { flushList(); proj.part = part[1]; out(`<p class="cv-part">${part[1]}</p>`); continue }
    const sk = proj && l.match(/^\*{2,3}Skills\*{2,3}:\s*(.*)/)
    if (proj && sk) { flushList(); proj.skills = splitComma(sk[1]!); continue }
    const kv = proj && l.match(/^(기간|역할|기술):\s*(.*)/) // i18n-ok
    if (proj && kv) { if (kv[1] === '기술') proj.stack = kv[2]!.split(',').map(s => s.trim()).filter(Boolean); else proj[kv[1] === '기간' ? 'period' : 'role'] = kv[2]!; continue } // i18n-ok
    if (/^- /.test(l)) {
      if (!sec) {
        const m = l.slice(2).match(/^([^:]+):\s*(.*)/)
        const k = m ? m[1]!.trim() : ''
        contact.push(`<li>${k ? `<span role="img" aria-label="${esc(k)}" title="${esc(k)}">${icon(/메일|mail/i.test(k) ? 'mail' : 'link')}</span><span class="cv-ck">${esc(k)}: </span>` : ''}${inline(m ? m[2]! : l.slice(2))}</li>`) // i18n-ok — 연락처 키는 문서 글
      } else list.push(l.slice(2))
      continue
    }
    if (l.trim()) { flushList(); out(`<p${(proj as Proj | null)?.part === 'Description' ? ' class="cv-desc"' : ''}>${inline(l)}</p>`) }
  }
  flushProj()
  const body = secs.map(s => `<section class="cv-sec"><h2>${inline(s.name)}${s.months ? ` <small class="num">${span(s.months)}</small>` : ''}</h2>${s.html}</section>`).join('')
  const id = `${name}${contact.length ? `<ul class="cv-contact">${contact.join('')}</ul>` : ''}`
  // 사진은 이름 · 연락처 왼쪽
  const head = photo ? `<div class="cv-id"><img class="cv-photo" src="${esc(photo)}" alt=""><div>${id}</div></div>` : id
  return `<article class="cv"><header class="cv-head">${head}${intro}</header>${body}</article>`
}

// 아직 안 채운 [칸] — renderResume 이 노랗게 칠하는 것과 같은 규칙, 같은 칸은 한 번만
export const cvBlanks = (doc: string): string[] => [...new Set([...doc.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]!))]

// '## 보완할 경험' 구역을 이력서에서 떼어 '### 무리' 아래 '- 항목' 으로
export function cvSplit(text: string): [string, { name: string; items: string[] }[]] {
  let gap = false
  const doc: string[] = [], groups: { name: string; items: string[] }[] = []
  for (const l of text.split('\n')) {
    if (/^## /.test(l)) gap = /^## 보완할 경험\s*$/.test(l) // i18n-ok
    if (!gap) { doc.push(l); continue }
    const h = l.match(/^### (.+)/)
    if (h) groups.push({ name: h[1]!.trim(), items: [] })
    else if (/^- /.test(l)) { if (!groups.length) groups.push({ name: '', items: [] }); groups.at(-1)!.items.push(l.slice(2)) }
  }
  return [doc.join('\n'), groups.filter(g => g.items.length)]
}

export const CV_ROLES: Record<string, string> = { backend: '백엔드', frontend: '프론트엔드', 'data-engineer': '데이터 엔지니어', 'ai-engineer': 'AI 엔지니어' } // i18n-ok — 쓰는 곳에서 t()
const ORDER = Object.keys(CV_ROLES)

// 직무별 이력서 — 이름 · 연락처가 없으면 resume.md 의 머리 줄을 앞에 붙인다
export function cvRoles(resume: string, roles: Role[]): { slug: string; label: string; file: string; text: string }[] {
  const head = resume.split(/^## /m)[0]!.split('\n').filter(l => /^(# |- )/.test(l)).join('\n')
  const rank = (s: string): number => ORDER.indexOf(s) + 1 || 99
  return [
    { slug: '', label: t('기본'), file: 'resume.md', text: resume },
    ...roles
      .map(r => ({ slug: r.slug, label: Object.hasOwn(CV_ROLES, r.slug) ? t(CV_ROLES[r.slug]!) : r.slug, file: `resume/${r.slug}.md`, text: /^# /m.test(r.text) ? r.text : `${head}\n${r.text}` }))
      .sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug))
  ]
}

export function gapLackCount(groups: { name: string; items: string[] }[]): number {
  return (groups.find(g => /부족/.test(g.name)) ?? groups[0])?.items.length ?? 0 // i18n-ok
}
export const gapItem = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

// 직무별 기록 근거 — 기록의 분류(대분류 - 소분류)와 본문 낱말로 센다. 고르는 건 사람이 한다(근거만 보여 준다).
// 데이터 엔지니어는 따로 분류가 없어 소분류 · 본문(S3 · Parquet · 배치 · ETL …)으로 찾는다
const ROLE_SIGNS: Record<string, { majors: string[]; minors: RegExp; text?: RegExp }> = {
  backend: { majors: ['백엔드'], minors: /^(FastAPI|Spring Boot|PostgreSQL|Docker|SQLite|API)$/i }, // i18n-ok
  frontend: { majors: ['프론트엔드'], minors: /^(React|CSS|JavaScript|TypeScript|Vite)$/i }, // i18n-ok
  'data-engineer': { majors: [], minors: /^(PostgreSQL|AWS S3|S3|Parquet|ETL|Airflow|Spark)$/i, text: /Parquet|ETL|파이프라인|적재|배치 작업|S3 보관|데이터 레이크/ }, // i18n-ok
  'ai-engineer': { majors: ['AI'], minors: /^(LLM|프롬프트|검증|Claude|Codex)$/i } // i18n-ok
}
export function roleEvidence(entries: Entry[], personal: string[] = []): { slug: string; label: string; count: number; mine: number; top: string[] }[] {
  return Object.entries(ROLE_SIGNS).map(([slug, r]) => {
    const tech = new Map<string, number>()
    let count = 0, mine = 0 // mine: 그중 개인 작업
    for (const e of entries) {
      const hit = e.tags.filter(t => r.majors.includes(t.major) || r.minors.test(t.minor))
      if (!hit.length && !(r.text && r.text.test(`${e.title} ${e.body}`))) continue
      count++
      if (personal.includes(e.category)) mine++
      for (const t of hit) tech.set(t.minor, (tech.get(t.minor) ?? 0) + 1)
    }
    return { slug, label: t(CV_ROLES[slug]!), count, mine, top: [...tech].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k) }
  })
}

// 내용 없는 이력서(구역 제목뿐) — 직무 이력서를 처음 만들면 이 꼴이고, [이 직무 초안 만들기] 를 보인다
export const cvIsBlank = (text: string): boolean => { const at = text.search(/^## /m), body = at < 0 ? '' : text.slice(at); return body.split('\n').every(l => !l.trim() || /^#{2,3} /.test(l.trim())) } // 머리 줄(이름 · 연락처 · 소개)은 첫 구역 앞에서만
