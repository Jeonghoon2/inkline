// 항목 나누기(방식 B) — AI 는 쪽 묶음마다 항목의 위치(과목 · 제목 · 출제 표시 · 시작 쪽 · 시작 문장)만 주고,
// 앱이 시작 문장을 원문에서 찾아 본문을 잘라 낸다. 그래서 본문은 언제나 교재 글 그대로다. 교재 꼴(번호 · 표시)에 기대는 규칙은 쓰지 않는다
import type { AiError } from '../../shared/types.ts'
import { arr, int, obj, str } from '../ai/schema.ts'
import type { Ask } from '../ai/run.ts'
import { data, squash } from './ai.ts'

export interface Chunk { chunk: number; from: number; to: number }
export function chunkPlan(pages: number, size = 6): Chunk[] {
  const out: Chunk[] = []
  for (let from = 1, c = 0; from <= pages; c++) {
    const to = Math.min(pages, from + size - 1)
    out.push({ chunk: c, from, to })
    if (to === pages) break
    from = to // 앞 묶음의 마지막 쪽을 겹쳐 본다 — 쪽 경계에 걸친 항목
  }
  return out
}

export const SEGMENT_SCHEMA = obj({ items: arr(obj({ subject: str(40), title: str(80), freq: int(0, 99), freqNote: str(120), page: int(1, 5000), anchor: str(80) }), 0, 60) })
export function segmentPrompt(subjects: string[], pages: { page: number; text: string }[], hint: number[] = []): string {
  return [
    '할 일: 아래 쪽들에서 공부할 항목의 시작 위치를 모두 찾는다. 항목은 제목이 붙은 개념 · 주제 하나다(교재가 번호 · 제목으로 나눈 단위가 있으면 그 단위).',
    `- subject: 이 항목의 과목 — 다음 중 하나 그대로: ${subjects.join(' · ')}. 쪽 위쪽의 과목 표시를 따른다`,
    '- title: 항목 제목(교재 글 그대로, 앞 번호는 빼고)',
    '- freq · freqNote: 교재가 항목에 출제 횟수 · 회차 같은 표시를 붙였으면 그 표시를 freqNote 에 그대로, 그 개수를 freq 에. 없으면 0 과 빈 글',
    '- page: 항목이 시작하는 쪽([p.N] 의 N)',
    '- anchor: 제목 다음 본문 첫 문장의 앞 20~40자를 교재 글 그대로(띄어쓰기 · 줄바꿈은 달라도 된다). 본문 없이 제목만 있으면 제목',
    '- 머리말 · 쪽 번호 · 목차 · 저작권 안내는 항목이 아니다. 쪽 첫머리가 앞 쪽에서 이어지는 문장이면 그 부분은 항목으로 내지 않는다',
    hint.length > 0 && `- 앞서 이 묶음에서 놓친 항목이 있을 수 있다: ${hint.map(p => `p.${p}`).join(', ')} — 그 쪽들을 특히 꼼꼼히 본다`,
    data('book', pages.map(p => `[p.${p.page}]\n${p.text}`).join('\n\n'))
  ].filter(Boolean).join('\n')
}

// 교재 전체 글 — full(쪽마다 줄바꿈으로 이음) · starts(쪽 시작 위치) · ns(공백 뺀 글) · idx(ns 의 i 번째 글자가 full 의 어디인지)
export interface BookText { full: string; starts: number[]; ns: string; idx: number[] }
export function bookText(pages: string[]): BookText {
  let full = ''
  const starts: number[] = []
  for (const p of pages) { starts.push(full.length); full += p + '\n' }
  const chars: string[] = [], idx: number[] = []
  for (let i = 0; i < full.length; i++) if (!/\s/.test(full[i]!)) { chars.push(full[i]!); idx.push(i) }
  return { full, starts, ns: chars.join(''), idx }
}
export function pageAt(t: BookText, pos: number): number {
  let lo = 0, hi = t.starts.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (t.starts[mid]! <= pos) lo = mid; else hi = mid - 1 }
  return lo + 1
}
const lowerBound = (a: number[], v: number): number => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < v) lo = m + 1; else hi = m } return lo }
// 시작 문장 찾기 — 공백을 빼고 fromPage ~ toPage 안에서. 전체로 안 되면 앞 12자로(AI 가 문장 끝을 조금 바꾸는 일)
export function locate(t: BookText, anchor: string, fromPage: number, toPage: number): number | null {
  const from = t.starts[fromPage - 1]
  if (from === undefined) return null
  const to = t.starts[toPage] ?? t.full.length
  const lo = lowerBound(t.idx, from), hi = lowerBound(t.idx, to), hay = t.ns.slice(lo, hi)
  const a = squash(anchor)
  for (const needle of [a, a.length > 12 ? a.slice(0, 12) : '']) {
    if (needle.length < 4) continue
    const k = hay.indexOf(needle)
    if (k >= 0) return t.idx[lo + k]!
  }
  return null
}

export interface Located { subject: string; title: string; freq: number; freqNote: string; anchor: string; pos: number }
type RawSeg = { subject: string; title: string; freq: number; freqNote: string; page: number; anchor: string }
export async function segmentChunk(ask: Ask, subjects: string[], t: BookText, pages: string[], c: Chunk, hint: number[] = []): Promise<{ ok: true; found: Located[]; dropped: number } | { ok: false; error: AiError }> {
  const list = Array.from({ length: c.to - c.from + 1 }, (_, i) => ({ page: c.from + i, text: pages[c.from + i - 1] ?? '' }))
  const r = await ask<{ items: RawSeg[] }>('cert-segment', segmentPrompt(subjects, list, hint), SEGMENT_SCHEMA)
  if (!r.ok) return r
  const found: Located[] = []
  let dropped = 0
  for (const it of r.value.items) {
    const page = Math.min(Math.max(it.page, c.from), c.to)
    const pos = locate(t, it.anchor, page, Math.min(page + 1, c.to)) ?? locate(t, it.anchor, c.from, c.to) // AI 가 쪽 번호를 틀리는 일
    if (pos === null || !it.title.trim()) { dropped++; continue }
    const subject = subjects.includes(it.subject) ? it.subject : found.at(-1)?.subject ?? subjects[0]!
    found.push({ subject, title: it.title.trim(), freq: it.freq, freqNote: it.freqNote.trim(), anchor: it.anchor, pos })
  }
  return { ok: true, found, dropped }
}

export const MAX_BODY = 6000, LONG_BODY = 3000
export interface Cut { id: number; pos: number; body: string; pageFrom: number; pageTo: number; ord: number; long: boolean }
// 본문 — 시작 문장부터 다음 항목 시작 앞까지. 마지막 항목은 end(항목 나누기를 마친 마지막 쪽 끝)까지
// 다음 항목의 제목 줄은 그 시작 문장 바로 앞에 있다 — 앞 항목 본문에 붙지 않게 제목 앞에서 멈춘다.
// 현재 항목 시작 이후, 줄 머리에서 시작하는 제목만 센다(본문 속 언급 · 머리글 반복은 자르지 않는다)
function stopBefore(t: BookText, cur: { pos: number }, next: { pos: number; title?: string }): number {
  const title = squash(next.title ?? '')
  if (title.length < 2) return next.pos
  const hi = lowerBound(t.idx, next.pos), lo = Math.max(lowerBound(t.idx, cur.pos), hi - 200, 0), hay = t.ns.slice(lo, hi)
  for (let k = hay.lastIndexOf(title); k >= 0; k = k ? hay.lastIndexOf(title, k - 1) : -1) {
    const at = t.idx[lo + k]!
    let j = at - 1
    while (j >= 0 && (t.full[j] === ' ' || t.full[j] === '\t')) j--
    if (j < 0 || t.full[j] === '\n') return at
  }
  return next.pos
}
export function cutBodies(t: BookText, anchors: { id: number; pos: number; title?: string }[], end: number): Cut[] {
  const s = [...anchors].sort((a, b) => a.pos - b.pos)
  return s.map((a, i) => {
    const stop = Math.max(a.pos, i + 1 < s.length ? stopBefore(t, a, s[i + 1]!) : end)
    const raw = t.full.slice(a.pos, stop).trim()
    return { id: a.id, pos: a.pos, body: raw.slice(0, MAX_BODY), pageFrom: pageAt(t, a.pos), pageTo: pageAt(t, Math.max(a.pos, stop - 1)), ord: i, long: raw.length > LONG_BODY }
  })
}
// 빠뜨림 의심 쪽 — 시작 문장이 하나도 없는데 3000자 넘는 본문이 덮는 쪽(항목을 놓치면 앞 항목 본문이 길어진다)
export function suspiciousPages(cuts: Cut[], donePages: Set<number>): number[] {
  const starts = new Set(cuts.map(c => c.pageFrom)), out = new Set<number>()
  for (const c of cuts) if (c.long) for (let p = c.pageFrom + 1; p <= c.pageTo; p++) if (!starts.has(p) && donePages.has(p)) out.add(p)
  return [...out].sort((a, b) => a - b)
}
