// 자격증 공부 — main · renderer 가 같이 쓰는 타입과 순수 함수(간격 · 숙달도 · 공부 순서 · 모의 시험)
import { INTERVALS, nextState, type Grade } from './drill.ts'
import { midnight } from './review.ts'

export const CERT_KINDS = ['필기', '실기', '기타'] as const
export type CertKind = (typeof CERT_KINDS)[number]
export interface CertRules { perSubject: number; minSubject: number; minAvg: number; minutes: number }
export const DEFAULT_RULES: CertRules = { perSubject: 20, minSubject: 40, minAvg: 60, minutes: 150 }
export type BookStatus = 'importing' | 'ready' | 'partial'
export interface CertBook { id: number; name: string; kind: CertKind; subjects: string[]; rules: CertRules; examDate: string | null; pages: number; status: BookStatus; confirmed: boolean; checkNote: string; createdAt: string } // checkNote: 판별 근거 · 원문에서 못 찾은 과목(확인 카드에 보인다)
export interface CertItem { id: number; bookId: number; subject: string; title: string; freq: number; freqNote: string; pageFrom: number; pageTo: number; body: string; ord: number }
export interface CertQuestion { id: number; itemId: number; stem: string; choices: string[]; answer: number; why: string; notes: string[]; quote: string; choiceItems: string[]; refute: string; origin: 'item' | 'variant' | 'pair' }
export type NewQuestion = Omit<CertQuestion, 'id' | 'itemId' | 'origin'>
export interface CertMaterial { explain: string; mnemonic: string; confusions: { title: string; diff: string }[] }
export interface CertReview { itemId: number; step: number; dueAt: string; last: Grade; right: number; wrong: number }
export type Mastery = 'unseen' | 'learning' | 'mastered'

// 답과 자신감으로 채점 — 자신감은 답을 보기 전에 묻는다(지식사전: 학습 과학/errors-committed-with-high-confidence-are-hypercorrected)
export const gradeOf = (correct: boolean, sure: boolean): Grade => (!correct ? '몰랐음' : sure ? '알았음' : '헷갈림')

const DAY = 86_400_000
export function daysLeft(now: Date, examDate: string | null): number | null {
  const m = examDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return Math.round((new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime() - midnight(now).getTime()) / DAY)
}
// 시험일이 있으면 간격을 남은 날의 20%(최소 1일)로 자르고 시험 전날을 넘기지 않는다(지식사전: 학습 과학/spacing-effects-in-learning-a-temporal-ridgeline-of-optimal)
// 시험이 오늘 · 내일(0 ≤ 남은 날 < 2)이면 복습을 내일로 붙인다. 지난 시험 · 시험일 없음은 자르지 않는다
export function nextReview(prev: { step: number } | null, grade: Grade, now: Date, examDate: string | null): { step: number; dueAt: string } {
  const s = nextState(prev, grade, now)
  const left = daysLeft(now, examDate)
  if (left === null || left < 0) return s
  if (left < 2) return { step: s.step, dueAt: midnight(now, 1).toISOString() }
  const cap = Math.max(1, Math.min(Math.floor(left * 0.2), left - 1))
  return { step: s.step, dueAt: midnight(now, Math.min(INTERVALS[s.step]!, cap)).toISOString() }
}

export const masteryOf = (r: CertReview | undefined): Mastery => (!r ? 'unseen' : r.step >= 3 && r.last !== '몰랐음' ? 'mastered' : 'learning')
export interface SubjectStat { subject: string; total: number; mastered: number; learning: number; unseen: number }
export function subjectMastery(subjects: string[], items: CertItem[], reviews: CertReview[]): SubjectStat[] {
  const by = new Map(reviews.map(r => [r.itemId, r]))
  return subjects.map(subject => {
    const m = items.filter(i => i.subject === subject).map(i => masteryOf(by.get(i.id)))
    return { subject, total: m.length, mastered: m.filter(x => x === 'mastered').length, learning: m.filter(x => x === 'learning').length, unseen: m.filter(x => x === 'unseen').length }
  })
}

// 오늘 공부할 차례 — 기한이 지난 복습(밀린 순) → 새 항목(출제 많은 순, 같으면 교재 순). 헷갈리는 쌍은 바로 이어서(지식사전: 학습 과학/learning-concepts-and-categories-is-spacing-the-enemy-of-ind)
export interface QueueEntry { itemId: number; kind: 'review' | 'new' }
export function studyQueue(items: CertItem[], reviews: CertReview[], now: Date, o: { subject?: string | null; pairs?: [number, number][] } = {}): QueueEntry[] {
  const by = new Map(reviews.map(r => [r.itemId, r]))
  const pool = items.filter(i => !o.subject || i.subject === o.subject)
  const due = pool.filter(i => { const r = by.get(i.id); return !!r && Date.parse(r.dueAt) <= now.getTime() })
    .sort((a, b) => by.get(a.id)!.dueAt.localeCompare(by.get(b.id)!.dueAt) || a.ord - b.ord)
  const fresh = pool.filter(i => !by.has(i.id)).sort((a, b) => b.freq - a.freq || a.ord - b.ord)
  const base: QueueEntry[] = [...due.map(i => ({ itemId: i.id, kind: 'review' as const })), ...fresh.map(i => ({ itemId: i.id, kind: 'new' as const }))]
  if (!o.pairs?.length) return base
  const partner = new Map<number, number[]>()
  for (const [a, b] of o.pairs) { partner.set(a, [...(partner.get(a) ?? []), b]); partner.set(b, [...(partner.get(b) ?? []), a]) }
  const at = new Map(base.map(e => [e.itemId, e])), used = new Set<number>(), out: QueueEntry[] = []
  for (const e of base) {
    if (used.has(e.itemId)) continue
    out.push(e); used.add(e.itemId)
    for (const p of partner.get(e.itemId) ?? []) { const pe = at.get(p); if (pe && !used.has(p)) { out.push(pe); used.add(p) } }
  }
  return out
}

// 모의 시험 문제 고르기 — 과목마다 perSubject 개. 안 푼 문제 먼저, 출제 많은 항목 먼저(rand 로 같은 값 섞기), 한 항목에서 2문제까지
export interface MockPick { questionIds: number[]; short: { subject: string; missing: number }[] }
export function pickMock(o: { subjects: string[]; rules: CertRules; items: CertItem[]; questions: CertQuestion[]; seen: Set<number>; rand?: () => number }): MockPick {
  const rand = o.rand ?? Math.random
  const itemOf = new Map(o.items.map(i => [i.id, i]))
  const ids: number[] = [], short: MockPick['short'] = []
  for (const subject of o.subjects) {
    const cand = o.questions.filter(q => itemOf.get(q.itemId)?.subject === subject)
      .map(q => ({ q, k: (o.seen.has(q.id) ? 1000 : 0) - itemOf.get(q.itemId)!.freq - rand() }))
      .sort((a, b) => a.k - b.k || a.q.id - b.q.id)
    const per = new Map<number, number>()
    let n = 0
    for (const { q } of cand) {
      if (n >= o.rules.perSubject) break
      if ((per.get(q.itemId) ?? 0) >= 2) continue
      per.set(q.itemId, (per.get(q.itemId) ?? 0) + 1); ids.push(q.id); n++
    }
    if (n < o.rules.perSubject) short.push({ subject, missing: o.rules.perSubject - n })
  }
  return { questionIds: ids, short }
}

export interface MockScore { subjects: { subject: string; right: number; total: number; score: number; failed: boolean }[]; avg: number; passed: boolean }
export function scoreMock(o: { subjects: string[]; rules: CertRules; asked: { questionId: number; subject: string; answer: number }[]; picks: Record<number, number | null> }): MockScore {
  const subjects = o.subjects.map(subject => {
    const a = o.asked.filter(x => x.subject === subject)
    const right = a.filter(x => o.picks[x.questionId] === x.answer).length
    const score = a.length ? Math.round((right / a.length) * 100) : 0
    return { subject, right, total: a.length, score, failed: score < o.rules.minSubject }
  })
  const avg = subjects.length ? Math.round((subjects.reduce((s, x) => s + x.score, 0) / subjects.length) * 10) / 10 : 0
  return { subjects, avg, passed: subjects.every(s => s.total > 0 && !s.failed) && avg >= o.rules.minAvg }
}

// ── 화면 · IPC 타입
// m-*: 학습 자료 모듈(설명 → 오답 후보 → 문제 쓰기 → 규칙 → 블라인드 풀이 → 점검) — 공부 화면이 보인다
export type CertStageId = 'import' | 'classify' | 'segment' | 'material' | 'm-explain' | 'm-lure' | 'm-write' | 'm-rules' | 'm-blind' | 'm-check'
export interface CertStage { stage: CertStageId; state: 'on' | 'done'; note?: string; progress?: [number, number] } // progress: [끝난 쪽, 전체 쪽]
export interface CertHome {
  book: CertBook; daysLeft: number | null; due: number; fresh: number
  subjects: (SubjectStat & { recent: number | null })[]
  map: { id: number; title: string; subject: string; mastery: Mastery }[]
  wrongs: number; pairs: number; unsplit: number[]
}
export interface CertCardQ { questionId: number; stem: string; choices: string[]; item: { id: number; subject: string; freq: number; freqNote: string }; kind: 'review' | 'new'; left: { due: number; fresh: number } }
export type CertNext =
  | { card: CertCardQ }
  | { explainOnly: { itemId: number; title: string; subject: string; material: CertMaterial | null; body: string; pageFrom: number } }
  | { done: true; nextDue: string | null }
  | { error: string }
export interface CertFeedback {
  correct: boolean; sure: boolean; answer: number; why: string; notes: string[]; refute: string; quote: string
  item: { id: number; title: string; subject: string; pageFrom: number; body: string }
  material: CertMaterial | null; dueAt: string; pair: { title: string; count: number } | null
}
export interface CertPaper { mockId: number; minutes: number; short: { subject: string; missing: number }[]; questions: { id: number; subject: string; stem: string; choices: string[] }[] }
export interface CertMockResult { score: MockScore; review: { questionId: number; subject: string; stem: string; choices: string[]; answer: number; picked: number | null; why: string; notes: string[] }[] }
export interface CertWrong { questionId: number; subject: string; itemTitle: string; stem: string; choices: string[]; answer: number; picked: number | null; sure: boolean; why: string; notes: string[]; at: string; fixed: boolean }
export interface CertPairRow { a: number; b: number; aTitle: string; bTitle: string; count: number; hasCard: boolean }
export interface CertPairCard { aTitle: string; bTitle: string; aBody: string; bBody: string; diffs: string[]; common: string; questions: { id: number; stem: string; choices: string[] }[] }
export interface CertPatch { name: string; kind: CertKind; subjects: string[]; rules: CertRules; examDate: string | null }
export interface CertApi {
  list(): Promise<CertBook[]>
  pickPdf(): Promise<string | null>
  pathForFile(f: File): string
  import(path: string): Promise<{ ok: true; bookId: number; existing: boolean } | { ok: false; error: string }>
  confirm(bookId: number, patch: CertPatch): Promise<CertBook>
  segment(bookId: number): Promise<{ ok: true; items: number; unsplit: number[] } | { ok: false; error: string }>
  onStage(cb: (s: CertStage) => void): () => void
  cancel(): Promise<void>
  home(bookId: number): Promise<CertHome>
  next(bookId: number, subject: string | null): Promise<CertNext>
  answer(questionId: number, picked: number, sure: boolean, mode: 'learn' | 'review'): Promise<CertFeedback>
  seen(itemId: number): Promise<void>
  page(bookId: number, page: number): Promise<string>
  mockStart(bookId: number): Promise<CertPaper | { error: string }>
  mockSubmit(mockId: number, picks: Record<number, number | null>): Promise<CertMockResult>
  wrongs(bookId: number): Promise<CertWrong[]>
  pairs(bookId: number): Promise<CertPairRow[]>
  pairCard(bookId: number, a: number, b: number): Promise<CertPairCard | { error: string }>
  remove(bookId: number): Promise<void>
}
