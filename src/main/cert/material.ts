// 학습 자료 — 모듈로 나눈다(이론 장면과 같은 방식):
//   ① 설명(AI) 쉬운 설명 · 외우기 · 헷갈리는 항목 → ② 오답 후보(앱) 같은 과목에서 헷갈리기 쉬운 항목 고르기
//   → ③ 문제 쓰기(AI) 원문 근거 + ② 후보로 4지선다 → ④ 규칙(앱) 근거 문장 · 보기 · 모두/없음 · 정답만 긴 보기
//   → ⑤ 블라인드 풀이(AI) 정답을 가리고 풀어 정답과 대조 → ⑥ 점검(AI) 모호함 · 오개념을 고치고, 고친 것은 ④ 를 다시
// (지식사전: 평가 · 문항/a-review-of-multiplechoice-itemwriting-guidelines-for-classr, 평가 · 문항/a-comparative-study-of-aigenerated-gpt4-and-humancrafted-mcq)
import type { AiError } from '../../shared/types.ts'
import type { CertItem, CertKind, CertMaterial, CertStageId, NewQuestion } from '../../shared/cert.ts'
import { arr, int, obj, str } from '../ai/schema.ts'
import type { Ask } from '../ai/run.ts'
import { data, squash } from './ai.ts'
import { t } from '../../shared/i18n.ts'

export const QUESTION = obj({ stem: str(200), choices: arr(str(120), 4, 4), answer: int(0, 3), why: str(300), notes: arr(str(160), 4, 4), quote: str(300), choiceItems: arr(str(80), 4, 4), refute: str(200) })
export const EXPLAIN_SCHEMA = obj({ explain: str(300), mnemonic: str(200), confusions: arr(obj({ title: str(80), diff: str(160) }), 0, 3) })
export const WRITE_SCHEMA = obj({ questions: arr(QUESTION, 1, 4) })
export const VARIANT_SCHEMA = obj({ questions: arr(QUESTION, 1, 3) })
export const BLIND_SCHEMA = obj({ answers: arr(obj({ index: int(0, 9), pick: int(-1, 3), why: str(200) }), 0, 10) })
export const QCHECK_SCHEMA = obj({ verdicts: arr(obj({ index: int(0, 9), ok: { type: 'boolean' }, problem: str(160), stem: str(200), choices: arr(str(120), 0, 4), answer: int(0, 3), why: str(300), notes: arr(str(160), 0, 4) }), 0, 10) })

// 공부 화면이 보여 줄 작은 단계 — 미리 만들기(다음 항목)는 알리지 않는다
export type MStage = (id: Extract<CertStageId, `m-${string}`>, state: 'on' | 'done', note?: string) => void
const silent: MStage = () => {}
const item$ = (it: CertItem): string => data('item', `[${it.subject}] ${it.title}\n${it.body}`)

// ── ① 설명
export function explainPrompt(item: CertItem, titles: string[], kind: CertKind): string {
  return [
    `할 일: 아래 항목을 처음 배우는 사람이 ${kind} 시험을 위해 빨리 익히도록 설명한다. 쓰는 사실은 항목 글에 있는 것만.`,
    '- explain: 쉬운 설명 2~3문장. 핵심 한 가지를 먼저, 필요하면 일상 비유 하나',
    '- mnemonic: 순서 · 목록을 외워야 하는 항목이면 외우는 요령(앞 글자 따기 등) 한 줄, 아니면 빈 글',
    '- confusions: 이 항목과 헷갈리기 쉬운 같은 과목 항목(아래 목록의 제목 그대로) 0~3개와 차이 한 줄씩',
    `같은 과목 항목 목록: ${titles.slice(0, 80).join(' · ') || '(없음)'}`,
    item$(item)
  ].join('\n')
}

// ── ② 오답 후보(앱) — ① 의 헷갈리는 항목 → 이 항목 글에 이름이 나오는 항목 → 교재에서 가까운 항목 순, 8개까지
export function lureCandidates(item: CertItem, same: CertItem[], confusions: string[], max = 8): string[] {
  const others = same.filter(i => i.id !== item.id && i.subject === item.subject)
  const titles = new Set(others.map(i => i.title))
  const body = squash(item.body)
  const out: string[] = []
  const add = (t: string): void => { if (titles.has(t) && !out.includes(t) && out.length < max) out.push(t) }
  confusions.forEach(add)
  others.filter(i => squash(i.title).length >= 2 && body.includes(squash(i.title))).forEach(i => add(i.title))
  ;[...others].sort((a, b) => Math.abs(a.ord - item.ord) - Math.abs(b.ord - item.ord)).forEach(i => add(i.title))
  return out
}

// ── ③ 문제 쓰기
const RULES = [
  '- 실제 시험 꼴: 짧은 물음 + 길이가 비슷한 보기 4개, 정답은 하나',
  '- answer: 정답 보기 번호(0부터), why: 정답인 이유, notes: 보기마다 맞거나 틀린 이유 한 줄씩 4개',
  '- quote: 정답의 근거가 되는 항목 글의 한 문장을 그대로(띄어쓰기는 달라도 된다)',
  '- choiceItems: 보기마다 그 보기가 아래 오답 후보 항목의 개념이면 그 제목 그대로, 아니면 빈 글. 정답 보기는 빈 글',
  "- refute: '흔히 ~로 착각하지만 실제는 ~' 꼴 한 줄 — 가장 그럴듯한 오답 기준",
  "- 오답 보기는 아래 오답 후보 항목의 개념에서 먼저 고른다. '모두 맞다' · '모두 틀리다' · '정답 없음' 같은 보기는 쓰지 않는다. 항목 글에 없는 사실로 정답을 만들지 않는다"
]
export function writePrompt(item: CertItem, lures: string[], stems: string[] = []): string {
  return [
    stems.length
      ? `할 일: 아래 항목으로 4지선다 2문제를 더 만든다. 이미 낸 물음과 다른 점을 묻는다. 이미 낸 물음: ${stems.map(s => `「${s}」`).join(' ')}`
      : '할 일: 아래 항목으로 실제 시험 꼴 4지선다 4문제를 만든다. 문제마다 묻는 점을 다르게(정의 · 특징 · 예 · 구별).',
    ...RULES,
    `오답 후보 항목(같은 과목, 헷갈리기 쉬운 순): ${lures.join(' · ') || '(없음 — 항목 글 안의 비슷한 개념으로)'}`,
    item$(item)
  ].join('\n')
}

// ── ④ 규칙(앱)
const BANNED = /모두\s*(맞|옳|틀|아니|해당)|정답\s*(이\s*)?없|해당\s*(사항\s*)?없|위의?\s*모든/
export function questionIssues(q: NewQuestion, body: string): string[] {
  const out: string[] = []
  const quote = squash(q.quote)
  if (quote.length < 6 || !squash(body).includes(quote)) out.push('근거 문장이 항목 글에 없다')
  if (q.choices.length !== 4 || new Set(q.choices.map(squash)).size !== 4 || q.choices.some(c => !c.trim())) out.push('보기가 겹친다')
  if (q.choices.some(c => BANNED.test(c))) out.push("'모두 · 없음' 보기")
  const lens = q.choices.map(c => c.length), mine = lens[q.answer] ?? 0
  const others = lens.filter((_, i) => i !== q.answer), avg = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length)
  if (mine > 15 && mine > 2 * avg) out.push('정답 보기만 유난히 길다')
  if (!q.stem.trim()) out.push('빈 물음')
  return out
}
export function cleanQuestion(q: NewQuestion, titles: string[], selfTitle: string): NewQuestion {
  return { ...q, stem: q.stem.trim(), choices: q.choices.map(c => c.trim()), choiceItems: q.choiceItems.map((t, i) => (i !== q.answer && t !== selfTitle && titles.includes(t) ? t : '')) }
}

// ── ⑤ 블라인드 풀이 — 정답 · 해설을 빼고 항목 글만으로 풀게 해 정답과 대조한다. 다르게 고르거나 고를 수 없다(-1)면 그 문제는 뺀다
export function blindPrompt(item: CertItem, qs: NewQuestion[]): string {
  return [
    '할 일: 아래 항목 글만 근거로 각 문제의 정답을 고른다. 문제마다 answer 하나(index 는 문제 번호 0부터, pick 은 고른 보기 번호 0~3).',
    '- 항목 글로 정답을 하나로 정할 수 없거나 정답이 둘 이상이면 pick 을 -1 로 하고 why 에 까닭을 쓴다',
    '- 짐작하지 않는다. 항목 글에 없는 지식으로 고르지 않는다',
    qs.map((q, i) => `${i}. ${q.stem}\n${q.choices.map((c, k) => `   ${k}) ${c}`).join('\n')}`).join('\n'),
    item$(item)
  ].join('\n')
}
export function applyBlind(qs: NewQuestion[], answers: { index: number; pick: number }[]): NewQuestion[] {
  const first = new Map<number, number>()
  for (const a of answers) if (!first.has(a.index)) first.set(a.index, a.pick)
  return qs.filter((q, i) => first.get(i) === q.answer)
}
export async function blinded(ask: Ask, item: CertItem, qs: NewQuestion[]): Promise<NewQuestion[]> {
  if (!qs.length) return qs
  const r = await ask<{ answers: { index: number; pick: number; why: string }[] }>('cert-blind', blindPrompt(item, qs), BLIND_SCHEMA)
  return r.ok ? applyBlind(qs, r.value.answers) : qs // 풀이가 실패하면 규칙을 통과한 문제를 넘긴다(점검이 한 번 더 본다)
}

// ── ⑥ 점검
export function checkPrompt(item: CertItem, qs: NewQuestion[]): string {
  return [
    '할 일: 아래 문제들을 처음 배우는 사람 눈으로 하나씩 본다. 문제마다 verdict 하나(index 는 문제 번호 0부터).',
    '- ok=false 인 경우: 정답이 둘 이상이다, 물음이 모호하다, 정답이 근거 문장 · 항목 글과 맞지 않는다, 오개념을 부르는 설명이다',
    '- ok=false 이고 고칠 수 있으면 stem · choices(4개) · answer · why · notes(보기마다 맞거나 틀린 이유 한 줄씩 4개) 에 고친 문제를, 고칠 수 없으면 choices 와 notes 를 빈 배열로',
    '- ok=true 면 stem · why 는 빈 글, choices · notes 는 빈 배열, answer 는 0',
    qs.map((q, i) => `${i}. ${q.stem}\n${q.choices.map((c, k) => `   ${'①②③④'[k]} ${c}`).join('\n')}\n   정답 ${'①②③④'[q.answer]} · 근거: ${q.quote}`).join('\n'),
    item$(item)
  ].join('\n')
}
type Verdict = { index: number; ok: boolean; problem: string; stem: string; choices: string[]; answer: number; why: string; notes: string[] }
export function applyQCheck(qs: NewQuestion[], verdicts: Verdict[], body: string): NewQuestion[] {
  // 같은 번호가 여럿이면 ok:false 가 이긴다(첫 번째 ok:false) — ok:true 가 고칠 · 뺄 판정을 덮지 못하게
  const by = new Map<number, Verdict>()
  for (const v of verdicts) {
    const prev = by.get(v.index)
    if (!prev || (prev.ok && !v.ok)) by.set(v.index, v)
  }
  return qs.flatMap((q, i) => {
    const v = by.get(i)
    if (!v || v.ok) return [q]
    if (v.choices.length !== 4 || !v.stem.trim() || v.notes.length !== 4) return []
    const choices = v.choices.map(c => c.trim())
    // 고친 보기는 원래 보기의 개념 항목 · 설명 · 반박을 따라가야 맞는다 — 보기 글이 바뀌면 그 보기의 태그를 잃는다
    const tagOf = new Map(q.choices.map((c, k) => [c.trim(), q.choiceItems[k] ?? '']))
    const choiceItems = choices.map((c, k) => (k === v.answer ? '' : tagOf.get(c) ?? ''))
    const refute = choices[v.answer] === q.choices[q.answer]?.trim() ? q.refute : ''
    const fixed: NewQuestion = { ...q, stem: v.stem.trim(), choices, answer: v.answer, why: v.why || q.why, notes: v.notes.map(n => n.trim()), choiceItems, refute }
    return questionIssues(fixed, body).length ? [] : [fixed]
  })
}
export async function checked(ask: Ask, item: CertItem, qs: NewQuestion[]): Promise<NewQuestion[]> {
  if (!qs.length) return qs
  const k = await ask<{ verdicts: Verdict[] }>('cert-check', checkPrompt(item, qs), QCHECK_SCHEMA)
  return k.ok ? applyQCheck(qs, k.value.verdicts, item.body) : qs // 점검이 실패하면 앞 단계를 통과한 문제를 쓴다
}

// ③~⑥ — 쓰고, 규칙, 블라인드 풀이, 점검. ④⑤ 를 지나 하나도 안 남으면 한 번 더 쓴다
async function questionsFor(ask: Ask, item: CertItem, task: 'cert-write' | 'cert-variant', prompt: string, titles: string[], stems: string[], stage: MStage): Promise<{ ok: true; questions: NewQuestion[]; dropped: number } | { ok: false; error: AiError }> {
  let dropped = 0
  for (let round = 1; round <= 2; round++) {
    stage('m-write', 'on')
    const r = await ask<{ questions: NewQuestion[] }>(task, prompt, task === 'cert-variant' ? VARIANT_SCHEMA : WRITE_SCHEMA)
    if (!r.ok) return r
    const all = r.value.questions.map(q => cleanQuestion(q, titles, item.title)).filter(q => !stems.includes(q.stem))
    stage('m-write', 'done', `${t('문제 {n}개', { n: all.length })}${round > 1 ? ` · ${t('다시 씀')}` : ''}`)
    stage('m-rules', 'on')
    const ruled = all.filter(q => !questionIssues(q, item.body).length)
    stage('m-rules', 'done', t('통과 {a} / {b}', { a: ruled.length, b: all.length }))
    stage('m-blind', 'on')
    const solved = await blinded(ask, item, ruled)
    stage('m-blind', 'done', ruled.length ? t('정답 일치 {a} / {b}', { a: solved.length, b: ruled.length }) : t('풀 문제 없음'))
    dropped += r.value.questions.length - solved.length
    if (!solved.length && round === 1) continue
    stage('m-check', 'on')
    const qs = await checked(ask, item, solved)
    stage('m-check', 'done', solved.length ? t('남은 문제 {n}개', { n: qs.length }) : t('점검할 문제 없음'))
    return { ok: true, questions: qs, dropped: dropped + solved.length - qs.length }
  }
  return { ok: true, questions: [], dropped }
}

export async function runMaterial(ask: Ask, item: CertItem, same: CertItem[], kind: CertKind, stage: MStage = silent): Promise<{ ok: true; material: CertMaterial; questions: NewQuestion[]; dropped: number } | { ok: false; error: AiError }> {
  const titles = same.filter(i => i.subject === item.subject && i.id !== item.id).map(i => i.title)
  stage('m-explain', 'on')
  const e = await ask<CertMaterial>('cert-explain', explainPrompt(item, titles, kind), EXPLAIN_SCHEMA)
  if (!e.ok) return e
  const material: CertMaterial = { explain: e.value.explain.trim(), mnemonic: e.value.mnemonic.trim(), confusions: e.value.confusions.filter(c => titles.includes(c.title) && c.title !== item.title) }
  stage('m-explain', 'done', [t('설명'), material.mnemonic ? t('외우기') : '', t('헷갈리는 항목 {n}개', { n: material.confusions.length })].filter(Boolean).join(' · '))
  stage('m-lure', 'on')
  const lures = lureCandidates(item, same, material.confusions.map(c => c.title))
  stage('m-lure', 'done', t('오답 후보 {n}개', { n: lures.length }))
  const q = await questionsFor(ask, item, 'cert-write', writePrompt(item, lures), titles, [], stage)
  if (!q.ok) return q
  return { ok: true, material, questions: q.questions, dropped: q.dropped }
}
export async function runVariant(ask: Ask, item: CertItem, same: CertItem[], stems: string[], confusions: string[] = [], stage: MStage = silent): Promise<{ ok: true; questions: NewQuestion[]; dropped: number } | { ok: false; error: AiError }> {
  const titles = same.filter(i => i.subject === item.subject && i.id !== item.id).map(i => i.title)
  stage('m-lure', 'on')
  const lures = lureCandidates(item, same, confusions)
  stage('m-lure', 'done', t('오답 후보 {n}개', { n: lures.length }))
  return questionsFor(ask, item, 'cert-variant', writePrompt(item, lures, stems), titles, stems, stage)
}
