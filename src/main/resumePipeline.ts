// 이력서 최신화 · 점검을 모듈로 — 한 모듈은 한 가지 일만 하고, 판정은 빠짐없이 매기게 하며, AI 가 아니어도 되는 단계는 규칙으로.
// 최신화: 기록 판정(AI) → 문장 쓰기(AI) → 윤문(AI, 켰을 때) → 사실 검증(규칙) → 점검(AI)
// 점검:   불리 찾기(AI) ‖ 불필요 찾기(AI) → 고쳐 쓰기(AI, 걸린 줄만) → 윤문(AI, 켰을 때) → 검사(규칙)
// ask 는 밖에서 넣는다(시험은 가짜 응답) — 단계는 stage 로 알린다
import { arr, obj, str, type JsonSchema } from './ai/schema.ts'
import type { Ask, AskResult } from './ai/run.ts'
import type { AiError, CheckedChange, Entry, ResumeChange, ResumeSkip, ResumeStage } from '../shared/types.ts'
import { plain } from '../shared/highlight.ts'
import { polish, polishNote } from './resumePolish.ts'
import { CAUTION, CHANGE_RULES, EXTRA, RESUME_SCHEMA, RISK, VALUE_FIRST, checkChanges, cvBody, droppedNumbers, fence, inGap, recBrief, recFull, recRef, riskyLines } from './resumeUpdate.ts'
import { t } from '../shared/i18n.ts'

export interface Ctx { resume: string; guide: string; role: string; roleDocs: string; entries: Entry[]; since: string; personal?: string[]; career?: string; polish?: boolean } // personal: 개인 작업 카테고리, career: 직무 이력서일 때 기본 이력서의 경력 구역(소속 · 기간을 알게), polish: 제안한 새 글의 AI 말투를 한 번 다듬는다(앱은 켜고 시험은 끈다)
export type PipeResult = { ok: true; changes: CheckedChange[]; skipped: ResumeSkip[]; risky: { line: string; words: string[] }[] } | { ok: false; error: AiError }


const target = (c: Ctx): string => `대상: ${c.role ? `직무 이력서 '${c.role}'` : '기본 이력서'}`
const guideBlock = (c: Ctx): string => [c.guide ? fence('guide', [c.guide, c.roleDocs].filter(Boolean).join('\n\n')) : '', c.career ? fence('career', `기본 이력서의 경력 — 새 프로젝트 소속 · 기간은 여기 회사로\n${c.career}`) : ''].filter(Boolean).join('\n\n')
// 기록에 r1, r2 … 이름을 붙인다(날짜 내림차순 그대로) — 모듈 사이에서 기록을 가리킨다
export const recIds = (entries: Entry[]): Map<string, Entry> => new Map(entries.map((e, i) => [`r${i + 1}`, e] as const))
const mine = (c: Ctx, e: Entry): boolean => (c.personal ?? []).includes(e.category)
const label = (e: Entry): string => `[${e.category}] ${e.date} ${e.type || '기록'} — ${e.title}`

// ── 최신화 ①: 기록 판정 — 새 기록마다 빠짐없이 판정하고, 이력서에 넣을 일을 후보로 묶는다
export const VERDICTS = { use: '넣을 만함', small: '작은 수정', unshipped: '운영 배포 전', unrelated: '무관', covered: '이미 반영' } as const
type Verdict = keyof typeof VERDICTS
export const JUDGE_SCHEMA = obj({
  verdicts: arr(obj({ id: str(10), verdict: { type: 'string', enum: Object.keys(VERDICTS) }, why: str(160) }), 150),
  candidates: arr(obj({ title: str(80), ids: arr(str(10), 15), why: str(200) }), 8)
})
export function judgePrompt(c: Ctx, ids: Map<string, Entry>): string {
  const fresh = [...ids].filter(([, e]) => e.date >= c.since), old = [...ids].filter(([, e]) => e.date < c.since)
  return [
    target(c), fence('resume', c.resume), guideBlock(c),
    fence('records', fresh.length ? fresh.map(([id, e]) => recFull(e, id, mine(c, e))).join('\n') : '(새 기록 없음)'),
    old.length > 0 && fence('history', old.map(([id, e]) => recBrief(e, id, mine(c, e))).join('\n')),
    '할 일: 이력서에 넣을 일을 고른다. 문장은 쓰지 않는다.',
    `- verdicts: <records> 의 기록 하나하나에 빠짐없이(${fresh.length}개) id(기록 줄 맨 앞 대괄호 글자, 예: r3)와 verdict — use(이력서에 넣을 만한 일) · small(작은 수정 · 문서 정리) · unshipped(운영 배포 전의 작은 일) · unrelated(이 이력서와 무관) · covered(이미 이력서에 있음). why 는 한 문장`,
    '- candidates: 이력서에 넣거나 고칠 일 묶음(최대 8). 한 묶음 = 이력서 한 곳의 변경. ids 는 근거 기록 id — <records> 와 <history> 모두 쓸 수 있다(여러 기록에 걸친 큰 일이 이력서에 빠져 있으면 <history> 기록도 묶는다). 운영 배포 전 일은 여러 기록에 걸친 큰 기능 · 프로젝트일 때만. 결과 수치(사용자 · 성능 · 품질 · 비용 · 규모)가 기록에 있는 일을 먼저',
    '- <resume> 의 구역(## 자기소개 · ## 기술 등)이 비어 있으면(첫 초안) 그 구역도 후보로 낸다 — title 은 구역 이름, ids 는 그 내용의 근거가 될 기록들(대표 성과 · 많이 쓴 기술이 드러나는 기록)',
    '- 카테고리에 \'· 개인\' 이 붙은 기록은 개인 작업 — 개인 프로젝트 후보로만 묶고 회사 일 후보와 섞지 않는다',
    c.role ? '- 직무 이력서의 \'## 보완할 경험\' 이 비어 있으면 후보 하나로 낸다 — title \'보완할 경험\', ids 는 비워도 된다(<guide> 의 점검표 항목 중 기록에 근거가 없는 것을 쓰는 곳)' : '',
    `- 아래에 걸리는 일은 후보로 고르지 않는다:\n${CAUTION}`
  ].filter(Boolean).join('\n\n')
}

// ── 최신화 ②: 문장 쓰기 — 후보와 그 근거 기록(자세히)만 받아 변경을 쓴다. 근거는 글귀를 옮겨 쓰지 않고 앱이 뽑은 문장의 번호로 고른다
// (글귀를 옮겨 쓰게 하면 '쿠폰 30장' 을 '3장' 으로, 날짜 · 프로젝트를 틀리게 옮기는 일이 잦았다)
export interface Quote { id: string; ref: string; text: string }
const MAX_QUOTES = 30
// 기록에서 근거로 고를 문장 — 줄 · 문장 단위, 숫자가 든 문장을 앞에. 글은 검사기가 대조하는 plain 글의 일부 그대로
export function quoteTable(recs: [string, Entry][]): Quote[] {
  return recs.flatMap(([rid, e]) => {
    const parts = [e.title, e.body, ...Object.values(e.sections)].join('\n').split('\n').map(l => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))
    const sents = [...new Set(parts.flatMap(l => l.split(/(?<=다\.|\.\))\s+/)).map(plain).filter(t => t.length >= 8 && t.length <= 240))]
    return [...sents.filter(t => /\d/.test(t)), ...sents.filter(t => !/\d/.test(t))].slice(0, MAX_QUOTES).map((text, i) => ({ id: `${rid}.q${i + 1}`, ref: recRef(e), text }))
  })
}
// 쓰기 모듈의 형식 — 저장 형식(RESUME_SCHEMA)과 같고 evidence 만 문장 번호 목록
const changeItem = (RESUME_SCHEMA as unknown as { properties: { changes: { items: { properties: Record<string, JsonSchema> } } } }).properties.changes.items.properties
export const WRITE_SCHEMA = obj({ changes: arr(obj({ ...changeItem, evidence: arr(str(20), 6) }), 20) })
export function writePrompt(c: Ctx, cands: { title: string; why: string; recs: [string, Entry][] }[], quotes: Quote[]): string {
  return [
    target(c), fence('resume', c.resume), guideBlock(c),
    fence('candidates', cands.map((k, i) => `## 후보 ${i + 1}: ${k.title}\n왜: ${k.why}\n${k.recs.map(([id, e]) => recFull(e, id, mine(c, e))).join('\n')}`).join('\n\n')),
    fence('quotes', quotes.map(q => `${q.id}: ${q.text}`).join('\n')),
    '- 근거: evidence 에는 <quotes> 의 번호(예: r3.q2)만 적는다 — 글귀를 옮겨 쓰지 않는다. 새 글의 사실마다 그것을 말하는 문장 번호를 고르고, after 에 쓴 숫자는 모두 고른 문장이나 원래 줄(before)에 있어야 한다',
    '할 일: <candidates> 의 후보마다 <resume> 에서 고칠 곳을 changes 로 낸다(후보 하나에 change 하나, 이력서에 맞지 않으면 내지 않는다). 성과 줄(- **…**)은 기록에 있는 결과 수치를 꼭 넣는다 — 결과 수치가 기록에 없는 일은 성과 줄로 쓰지 않는다(새 프로젝트의 Description 에 한 문장으로 넣거나 내지 않는다). 문서 전체를 다시 쓰지 않는다. 이미 다듬은 줄은 건드리지 않는다. skipped 는 빈 배열',
    CHANGE_RULES,
    `- ${c.guide ? '<guide> 의 꼴을 따른다(프로젝트 꼴 · 인사 담당자가 읽는 글 · 하지 않는 것)' : '이력서에 이미 쓰인 꼴을 따른다'}`,
    '- 보완할 경험 후보는 \'### 부족한 경험\' · \'### 해보면 좋은 것\' 줄을 각각 anchor 로 add 한다(새 ### 제목을 만들지 않는다). 줄 꼴은 \'- **제목** — 설명\'(부족한 경험은 <guide> 점검표 항목 중 기록에 근거가 없는 것 2~5개, 해보면 좋은 것은 지금 프로젝트로 해 볼 만한 다음 걸음 2~3개). evidence 는 빈 배열',
    '- 구역 후보(자기소개 · 기술)는 그 구역 제목 줄(## …)을 anchor 로 add 한다. 자기소개는 \'- \' 줄 2~3개(합니다체, 대표 결과 수치 하나 이상), 기술은 \'- 분류: a, b\' 줄들',
    `- 아래에 걸리게 쓰지 않는다:\n${CAUTION}`
  ].filter(Boolean).join('\n\n')
}

// ── 최신화 ④ · 점검 공통: 제안된 줄을 인사 담당자 눈으로 — 불리하면 고쳐 쓴 글, 불필요하면 표시
export const SCREEN_SCHEMA = obj({ items: arr(obj({ id: { type: 'integer' }, verdict: { type: 'string', enum: ['ok', 'risky', 'extra'] }, why: str(160), fix: str(2000) }), 20) })
export function screenPrompt(c: Ctx, cs: ResumeChange[]): string {
  return [
    target(c),
    fence('proposals', cs.map((x, i) => `## ${i}\n위치: ${x.where}\n${x.before ? `원래 줄:\n${x.before}\n` : ''}새 글:\n${x.after}`).join('\n\n')),
    `할 일: <proposals> 의 새 글을 인사 담당자 · 면접관 눈으로 하나하나 빠짐없이 본다. items 에 id(## 뒤 숫자)마다 verdict — ok · risky(불리) · extra(불필요). why 는 한 문장(ok 면 빈 글). risky 면 fix 에 같은 사실로 불리하지 않게 고쳐 쓴 새 글 전체(숫자 · 사실을 새로 만들지 않고, 있던 숫자는 지우지 않는다, 줄 꼴은 그대로), 아니면 빈 글. 정확도 · 일치율(30/30) · 오류 수 · 시간 · 비용 · 규모 같은 결과 수치는 작업량이 아니다 — 그것만으로 걸지 않는다. '(운영 배포 전)' 표시는 사실을 밝히는 규칙이라 불리하지 않다 — 지우지 않는다. [회사] · [YYYY.MM] 같은 대괄호 빈칸과 '소속: … / 기간: …' 줄은 사용자가 채울 자리라 불리하지 않다 — 지우지 않는다.\n- ${RISK}\n- ${EXTRA}\n- ${VALUE_FIRST}`
  ].join('\n\n')
}

// ── 점검 ①: 불리 찾기 ‖ 불필요 찾기 — 이력서의 줄마다 빠짐없이 판정한다
export const FIND_SCHEMA = obj({ lines: arr(obj({ id: str(10), bad: { type: 'boolean' }, why: str(160) }), 400) })
// 판정할 줄 — 빈 줄 · 꼴만 있는 줄(**Description** 등) · 보완할 경험(본인용 메모)은 뺀다. id 는 L + 줄 번호
export function cvLines(resume: string): { id: string; text: string }[] {
  return cvBody(resume).flatMap((t, i) => (t.trim() && !/^\*{2,3}[A-Za-z ]+\*{2,3}:?\s*$/.test(t.trim()) ? [{ id: `L${i + 1}`, text: t }] : []))
}
export function findPrompt(c: Ctx, kind: 'risk' | 'extra', lines: { id: string; text: string }[]): string {
  return [
    target(c),
    kind === 'extra' ? guideBlock(c) : '',
    fence('lines', lines.map(l => `${l.id}: ${l.text}`).join('\n')),
    `할 일: <lines> 의 줄 하나하나에 빠짐없이(${lines.length}개) id 와 bad(아래에 걸리면 true)를 매긴다. why 는 걸린 이유 한 문장(안 걸리면 빈 글). 고쳐 쓰지 않는다.\n- ${kind === 'risk' ? RISK : EXTRA}`
  ].filter(Boolean).join('\n\n')
}

// ── 점검 ②: 고쳐 쓰기 — 걸린 줄만 받아 고쳐 쓰기 · 빼기
export function rewritePrompt(c: Ctx, flagged: { id: string; text: string; why: string[] }[], ids: Map<string, Entry>): string {
  return [
    target(c), fence('resume', c.resume),
    fence('flagged', flagged.map(f => `${f.id}: ${f.text}\n  걸린 이유: ${f.why.join(' / ')}`).join('\n')),
    ids.size > 0 && fence('history', [...ids].map(([id, e]) => recBrief(e, id, mine(c, e))).join('\n')),
    `할 일: <flagged> 의 줄만 고친다 — 다른 줄은 건드리지 않는다. 줄마다 replace(같은 일을 불리하지 않게 · 필요한 것만 남게 다시 쓴 줄) 또는 remove(빼는 편이 나은 줄) 하나. before 는 그 줄 글자 그대로(L 번호 빼고). 새 성과를 더하지 않는다. 같은 줄의 다른 성과 · 수치는 지우지 않는다. why 는 '[불리] …' 또는 '[불필요] …' 로 시작하는 한 문장. skipped 는 빈 배열\n- ${VALUE_FIRST}`,
    CHANGE_RULES,
    '- 새 사실 · 숫자를 만들지 않는다 — 원래 줄이나 <history> 에 있는 것만. <history> 에서 가져온 사실은 evidence 에 ref(기록 줄의 둥근 괄호 안 글자 그대로, 예: AppDesk/2026-10.md#2026-10-18)와 quote(그 기록에 글자 그대로 있는 글귀 20~80자)'
  ].filter(Boolean).join('\n\n')
}

type Done = (id: ResumeStage['stage'], note: string) => void
const flow = (stage: (s: ResumeStage) => void): { on: (id: ResumeStage['stage']) => void; done: Done } => ({ on: id => stage({ stage: id, state: 'on' }), done: (id, note) => stage({ stage: id, state: 'done', note }) })

// 제안을 점검 모듈에 한 번 더 — risky 는 고쳐 쓴 글로 바꾸고 다시 검사, extra 는 경고
async function screen(c: Ctx, cs: CheckedChange[], ask: Ask): Promise<{ ok: true; changes: CheckedChange[]; risky: number; extra: number } | { ok: false; error: AiError }> {
  const live = cs.filter(x => x.kind !== 'remove' && !inGap(c.resume, x)) // 보완할 경험은 본인용 메모 — 인사 담당자 눈으로 보지 않는다
  if (!live.length) return { ok: true, changes: cs, risky: 0, extra: 0 }
  const r = await ask<{ items: { id: number; verdict: 'ok' | 'risky' | 'extra'; why: string; fix: string }[] }>('resume-screen', screenPrompt(c, live), SCREEN_SCHEMA)
  if (!r.ok) return r
  let risky = 0, extra = 0
  const out = cs.map(x => {
    const it = r.value.items.find(i => live[i.id] === x)
    if (!it || it.verdict === 'ok') return x
    if (it.verdict === 'extra') { extra++; return { ...x, warnings: [...x.warnings, `[점검] 불필요 — ${it.why}`] } }
    risky++
    // 고쳐 쓴 글이 숫자를 지우면 받지 않는다 — 결과 수치는 이력서의 핵심
    // '(운영 배포 전)' 표시를 지워도 받지 않는다 — 사실을 밝히는 규칙
    const blanks = (t: string): number => (t.match(/\[[^\]]+\]/g) ?? []).length + (t.match(/^소속:/gm) ?? []).length
    const lost = it.fix.trim() ? [...droppedNumbers(x.after, it.fix), ...(x.after.includes('배포 전') && !it.fix.includes('배포 전') ? ['(운영 배포 전) 표시'] : []), ...(blanks(it.fix) < blanks(x.after) ? ['소속 · 기간 빈칸'] : [])] : []
    if (!it.fix.trim() || lost.length) return { ...x, warnings: [...x.warnings, `[점검] 불리 — ${it.why}${lost.length ? ` (고쳐 쓴 글이 ${lost.join(' · ')} 을 지워 쓰지 않았습니다)` : ''}`] }
    const [again] = checkChanges(c.resume, [{ ...x, after: it.fix }], c.entries, { personal: c.personal })
    return { ...again!, id: x.id, warnings: [`[점검] 불리해서 고쳐 썼습니다 — ${it.why}`, ...again!.warnings] }
  })
  return { ok: true, changes: out, risky, extra }
}

export async function runUpdate(c: Ctx, ask: Ask, stage: (s: ResumeStage) => void): Promise<PipeResult> {
  const f = flow(stage), ids = recIds(c.entries)
  const fresh = [...ids].filter(([, e]) => e.date >= c.since)
  f.on('judge')
  const j = await ask<{ verdicts: { id: string; verdict: Verdict; why: string }[]; candidates: { title: string; ids: string[]; why: string }[] }>('resume-judge', judgePrompt(c, ids), JUDGE_SCHEMA)
  if (!j.ok) return j
  const verdict = new Map(j.value.verdicts.map(v => [v.id, v] as const))
  const missing = fresh.filter(([id]) => !verdict.has(id)).length
  const skipped: ResumeSkip[] = fresh.flatMap(([id, e]) => { const v = verdict.get(id); return v?.verdict === 'use' ? [] : [{ title: label(e), why: v ? `${t(VERDICTS[v.verdict])} — ${v.why}` : '판정 없음 — AI 가 이 기록을 판정하지 않았습니다' }] })
  const cands = j.value.candidates.map(k => ({ title: k.title, why: k.why, recs: k.ids.flatMap(id => (ids.has(id) ? [[id, ids.get(id)!] as [string, Entry]] : [])) })).filter(k => k.recs.length || /보완할 경험/.test(k.title)) // 보완할 경험은 근거 기록이 없을 수 있다
  f.done('judge', `${t('새 기록 {n}건 판정 · 후보 {m}개', { n: fresh.length, m: cands.length })}${missing ? ` · ${t('판정 빠짐 {n}', { n: missing })}` : ''}`)
  if (!cands.length) { for (const id of (c.polish ? ['write', 'polish', 'verify', 'screen'] : ['write', 'verify', 'screen']) as ResumeStage['stage'][]) f.done(id, t('후보 없음')); return { ok: true, changes: [], skipped, risky: [] } }
  f.on('write')
  const quotes = quoteTable([...new Map(cands.flatMap(k => k.recs)).entries()])
  const byId = new Map(quotes.map(q => [q.id, q] as const))
  const w = await ask<{ changes: (Omit<ResumeChange, 'evidence'> & { evidence: string[] })[] }>('resume-write', writePrompt(c, cands, quotes), WRITE_SCHEMA)
  if (!w.ok) return w
  // 문장 번호 → 기록 원문 그대로의 글귀 · 출처. 모르는 번호는 버린다
  const written: ResumeChange[] = w.value.changes.map(x => ({ ...x, evidence: [...new Set(x.evidence)].flatMap(id => { const q = byId.get(id.trim()); return q ? [{ ref: q.ref, quote: q.text }] : [] }) }))
  const lost = w.value.changes.reduce((n, x) => n + x.evidence.filter(id => !byId.has(id.trim())).length, 0)
  f.done('write', `${t('제안 {n}개', { n: written.length })}${lost ? ` · ${t('모르는 근거 번호 {n}개 버림', { n: lost })}` : ''}`)
  let texts = written
  if (c.polish) {
    f.on('polish')
    const p = await polish(written, ask, target(c), x => inGap(c.resume, x)) // 보완할 경험은 본인용 메모라 다듬지 않는다
    if (!p.ok) return p
    texts = p.changes
    f.done('polish', polishNote(p))
  }
  f.on('verify')
  const checked = checkChanges(c.resume, texts, c.entries, { personal: c.personal })
  f.done('verify', t('경고 {n}개 · 막힘 {m}개', { n: checked.reduce((n, x) => n + x.warnings.length, 0), m: checked.filter(x => x.blocked).length }))
  f.on('screen')
  const s = await screen(c, checked, ask)
  if (!s.ok) return s
  f.done('screen', t('불리 {a} · 불필요 {b}', { a: s.risky, b: s.extra }))
  return { ok: true, changes: s.changes, skipped, risky: [] }
}

export async function runReview(c: Ctx, ask: Ask, stage: (s: ResumeStage) => void): Promise<PipeResult> {
  const f = flow(stage), lines = cvLines(c.resume)
  type Find = { lines: { id: string; bad: boolean; why: string }[] }
  const find = async (kind: 'risk' | 'extra'): Promise<AskResult<Find>> => {
    f.on(kind)
    const r = await ask<Find>(`resume-find-${kind}`, findPrompt(c, kind, lines), FIND_SCHEMA)
    if (r.ok) { const seen = new Set(r.value.lines.map(l => l.id)); f.done(kind, `${t('{n}줄 중 {m}줄', { n: lines.length, m: r.value.lines.filter(l => l.bad).length })}${lines.some(l => !seen.has(l.id)) ? ` · ${t('판정 빠짐 {n}', { n: lines.filter(l => !seen.has(l.id)).length })}` : ''}`) }
    return r
  }
  const [risk, extra] = await Promise.all([find('risk'), find('extra')])
  if (!risk.ok) return risk
  if (!extra.ok) return extra
  const why = new Map<string, string[]>()
  for (const [tag, r] of [['불리', risk], ['불필요', extra]] as const) for (const l of r.value.lines) if (l.bad) why.set(l.id, [...(why.get(l.id) ?? []), `[${tag}] ${l.why}`])
  const flagged = lines.filter(l => why.has(l.id)).map(l => ({ ...l, why: why.get(l.id)! }))
  f.on('rewrite')
  let proposed: ResumeChange[] = []
  if (flagged.length) {
    const r = await ask<{ changes: ResumeChange[]; skipped: ResumeSkip[] }>('resume-rewrite', rewritePrompt(c, flagged, recIds(c.entries)), RESUME_SCHEMA)
    if (!r.ok) return r
    // 걸린 줄만 — 범위 밖 줄을 건드린 제안 · 더하기는 버린다
    const allowed = new Set(flagged.map(l => l.text.trim()))
    proposed = r.value.changes.filter(x => x.kind !== 'add' && x.before.split('\n').every(b => !b.trim() || allowed.has(b.trim())))
    f.done('rewrite', `${t('고칠 줄 {n}개 · 제안 {m}개', { n: flagged.length, m: proposed.length })}${r.value.changes.length > proposed.length ? ` · ${t('범위 밖 {n}개 버림', { n: r.value.changes.length - proposed.length })}` : ''}`)
  } else f.done('rewrite', t('고칠 줄 없음'))
  if (c.polish) {
    f.on('polish')
    const p = await polish(proposed, ask, target(c))
    if (!p.ok) return p
    proposed = p.changes
    f.done('polish', proposed.length ? polishNote(p) : t('다듬을 글 없음'))
  }
  f.on('rules')
  const changes = checkChanges(c.resume, proposed, c.entries, { review: true, personal: c.personal })
  const risky = riskyLines(c.resume, proposed)
  f.done('rules', t('경고 {n}개 · 남은 불리한 말 {m}줄', { n: changes.reduce((n, x) => n + x.warnings.length, 0), m: risky.length }))
  return { ok: true, changes, skipped: [], risky }
}
