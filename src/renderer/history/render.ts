import { KREF, refKeys } from '../../shared/knowledge.ts'
import { localDay } from '../../shared/week.ts'
import { locale } from '../../shared/i18n.ts'
// 기록 화면의 HTML 문자열 도우미 — 참고 구현(work-history site/src/scripts/common.js · timeline.js)과 같은 규칙. DOM 을 쓰지 않는다
import type { Concept, Entry } from '../../shared/types.ts'

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// 형광펜 — 기록의 '==보이는 글자|개념 이름==' (이름을 빼면 글자가 곧 이름)
export const CONCEPT = /==([^=|]+?)(?:\|([^=]+?))?==/g
export const plain = (s: string): string => String(s ?? '').replace(CONCEPT, '$1')
export const conceptKeys = (s: string, concepts: Record<string, Concept>): string[] =>
  [...new Set([...String(s ?? '').matchAll(CONCEPT)].map(m => (m[2] ?? m[1]!).trim()))].filter(k => Object.hasOwn(concepts, k))
// esc 뒤에 부른다
export const hl = (html: string): string =>
  html.replace(CONCEPT, (_, text: string, key: string = text) => `<mark class="cc" tabindex="0" data-c="${key.trim()}">${text}</mark>`)

// 주간 보고 — 굵게(**), 목록(-), 번호 목록(1.), 제목(#), 나머지는 문단
export function md(text: string): string {
  const lines = text.split('\n')
  let out = '', inList = ''
  // <https://…> 는 누르면 기본 브라우저로 여는 링크(창 열기는 main 이 바깥 브라우저로 돌린다)
  const inline = (s: string) => hl(esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/&lt;(https?:\/\/[^\s"]+?)&gt;/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>'))
  const open = (tag: 'ul' | 'ol') => {
    if (inList !== tag) { if (inList) out += `</${inList}>`; out += tag === 'ol' ? '<ol class="steps">' : '<ul>'; inList = tag }
  }
  for (const raw of lines) {
    const l = raw.trimEnd()
    if (/^\s*- /.test(l)) { open('ul'); out += `<li${/^\s{2,}- /.test(l) ? ' class="sub"' : ''}>${inline(l.replace(/^\s*- /, ''))}</li>`; continue } // 들여쓴 줄은 하위 줄
    if (/^\s*\d+\. /.test(l)) { open('ol'); out += `<li>${inline(l.replace(/^\s*\d+\. /, ''))}</li>`; continue }
    if (inList) { out += `</${inList}>`; inList = '' }
    if (/^# /.test(l)) out += `<h2>${inline(l.slice(2))}</h2>`
    else if (l.trim()) out += `<p>${inline(l)}</p>`
  }
  return out + (inList ? `</${inList}>` : '')
}

// 종류 · 색
export const TYPE_ORDER = ['기능', '배포', '수정', '문서', '성능', '트러블슈팅'] // i18n-ok — 기록의 '종류:' 값. 화면에는 Badge 가 t() 로 바꿔 보인다
export const TYPE_COLOR: Record<string, string> = {
  기능: 'var(--t-feat)', 수정: 'var(--t-fix)', 성능: 'var(--t-perf)', 배포: 'var(--t-ship)', 문서: 'var(--t-doc)', 트러블슈팅: 'var(--t-trouble)' // i18n-ok
}
export const badge = (type: string): string =>
  type ? `<span class="b" style="--t:${Object.hasOwn(TYPE_COLOR, type) ? TYPE_COLOR[type] : 'var(--t-etc)'}">${esc(type)}</span>` : ''

// 날짜 · 집계
export const weekday = (d: Date, style: 'short' | 'long'): string => d.toLocaleDateString(locale(), { weekday: style }) // ko: 월 · 월요일, en: Mon · Monday
export const toDay = (s: string): Date => new Date(s + 'T00:00:00')
export const dkey = localDay
export const md2 = (d: Date): string => `${d.getMonth() + 1}.${d.getDate()}`
export const tally = <T>(xs: T[], f: (x: T) => string): Record<string, number> =>
  xs.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), Object.create(null))

// 기록 하나가 칠한 개념 — 내용 + 모든 섹션
export const entryKeys = (e: Entry, concepts: Record<string, Concept>): string[] =>
  conceptKeys([e.body, ...Object.values(e.sections)].join('\n'), concepts)

// 쇼츠 영상 주소 — main/history.ts 의 slug 와 같은 규칙
export const shortUrl = (name: string): string => `inkline-media://shorts/${encodeURIComponent(name.replace(/[/\\:*?"<>|\s]+/g, '_'))}.mp4`

// 기록 글 속 (지식사전: 분류/슬러그, …) 를 항목마다 누르는 링크로 — 이미 이스케이프한 HTML 에 쓴다.
// 글 속에 이어 흐르게 a 로 그린다(button 은 줄을 넘기면 가운데 맞춘 덩어리가 된다)
export const krefs = (html: string): string =>
  html.replace(KREF, (all, inner: string) => {
    const ks = refKeys(inner)
    return ks.length ? `(지식사전: ${ks.map(k => `<a href="#" class="kref" data-k="${k}">${k}</a>`).join(', ')})` : all // i18n-ok — 기록 글 속 표지를 그대로 되살린다
  })
