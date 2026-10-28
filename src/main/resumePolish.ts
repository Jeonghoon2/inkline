// 이력서 윤문 — 제안한 새 글(after)에서 AI 가 쓴 듯한 말투(번역투 · 빈 꾸밈말 · 되풀이)만 고쳐 쓴다.
// 사실을 다루는 단계가 아니라서 고친 글이 숫자 · 기술 이름 · 줄 꼴을 하나라도 바꾸면 규칙(polishRejects)이 받지 않고 원래 글을 쓴다.
import { arr, obj, str } from './ai/schema.ts'
import type { Ask } from './ai/run.ts'
import type { AiError, ResumeChange } from '../shared/types.ts'
import { fence } from './resumeUpdate.ts'
import { t } from '../shared/i18n.ts'

export const POLISH_SCHEMA = obj({ items: arr(obj({ id: { type: 'integer' }, after: str(2000) }), 20) })

export function polishPrompt(target: string, cs: { where: string; after: string }[]): string {
  return [
    target,
    fence('proposals', cs.map((x, i) => `## ${i}\n위치: ${x.where}\n새 글:\n${x.after}`).join('\n\n')),
    '할 일: <proposals> 의 새 글에서 AI 가 쓴 듯한 말투만 고쳐 다시 쓴다. items 에 id(## 뒤 숫자)마다 after(다듬은 새 글 전체). 고칠 곳이 없으면 글을 그대로 돌려준다 — 억지로 바꾸지 않는다.',
    "- 고칠 것: 번역투('~을 통해', '~에 의해', '~에 대한', '~로 인해'), 피동 남발('~되어짐'), 같은 어미 · 같은 구조의 되풀이, 내용 없는 꾸밈말('다양한', '효율적으로', '체계적', '혁신적', '뛰어난'), 모호한 동사('~를 진행', '~를 수행')는 한 일 그대로의 동사로, 관용구('~에 기여', '~를 도모')",
    "- 그대로 둘 것(하나라도 바뀌면 앱이 원래 글을 씁니다): 숫자 · 단위 · 날짜 · 영문 기술 이름 · 고유명사 · '(운영 배포 전)' · [대괄호 빈칸] · '- ' · '### ' · '**굵은 글**' 표시 · 줄 수와 순서 · 소속 / 기간 / Skills 줄. 새 사실 · 새 숫자 · 새 기술 이름을 더하지 않는다. 글 길이는 ±30% 안에서",
    "- 성과 줄(- **…**)은 명사형으로 끝나게(…단축, …제거, …설계), Description 은 '~했습니다/합니다'로 맞춘다. 한 문장에 같은 낱말을 두 번 쓰지 않는다. 줄표(—)는 쓰지 않는다. 굵은 결과 뒤는 콜론(:)으로 잇는다"
  ].join('\n\n')
}

const NUM = /\d[\d,]*(?:\.\d+)?/g
const ASCII = /[A-Za-z][A-Za-z0-9.+#/_-]*/g
const nums = (t: string): string => (t.match(NUM) ?? []).map(n => n.replace(/,/g, '')).sort().join('|')
const words = (t: string): string => [...new Set(t.match(ASCII) ?? [])].sort().join('|')
// 꼴 줄 — 제목 · 소속 · 기간 · 설명 · Skills 표시는 글이 아니라 이력서의 뼈대라 한 글자도 바꾸지 않는다
const FIXED = /^(\s*#{1,6} |\s*(?:소속|기간|고객사|역할|회사):|\s*\*{2,3}[A-Za-z ]+\*{2,3}:?)/
const lead = (l: string): string => /^\s*(?:[-*] |\d+\. )?/.exec(l)![0]
const stars = (l: string): number => (l.match(/\*\*/g) ?? []).length

// 고친 글을 받지 않을 이유 — 받아도 되면 null
export function polishRejects(orig: string, next: string): string | null {
  if (!next.trim()) return '빈 글'
  if (nums(orig) !== nums(next)) return '숫자가 달라짐'
  if (words(orig) !== words(next)) return '기술 이름이 달라짐'
  const o = orig.split('\n').filter(l => l.trim()), n = next.split('\n').filter(l => l.trim())
  if (o.length !== n.length) return '줄 수가 달라짐'
  for (let i = 0; i < o.length; i++) {
    if (FIXED.test(o[i]!)) { if (o[i]!.trim() !== n[i]!.trim()) return '꼴 줄(제목 · 소속 · 기간)을 고침'; continue }
    if (lead(o[i]!) !== lead(n[i]!) || stars(o[i]!) !== stars(n[i]!)) return '줄 꼴(목록 · 굵은 글)이 달라짐'
  }
  if (orig.includes('배포 전') && !next.includes('배포 전')) return "'(운영 배포 전)' 표시가 사라짐"
  if ((orig.match(/\[[^\]]+\]/g) ?? []).length > (next.match(/\[[^\]]+\]/g) ?? []).length) return '[대괄호] 빈칸이 사라짐'
  if ((next.match(/—/g) ?? []).length > (orig.match(/—/g) ?? []).length) return '줄표(—)가 늘어남'
  const ratio = next.length / orig.length
  if (Math.abs(next.length - orig.length) > 12 && (ratio < 0.7 || ratio > 1.3)) return '글 길이가 너무 달라짐'
  return null
}

// 새 글이 있는 제안(더하기 · 바꾸기, skip 이 아닌 것)만 AI 에 보낸다. 실패하면 원래 글로 계속한다 — 윤문은 없어도 되는 단계(취소만 그대로 알린다)
export async function polish<T extends ResumeChange>(cs: T[], ask: Ask, target: string, skip: (c: T) => boolean = () => false): Promise<{ ok: true; changes: T[]; polished: number; kept: number; why: string[]; failed?: string } | { ok: false; error: AiError }> {
  const live = cs.filter(x => x.kind !== 'remove' && x.after.trim() && !skip(x))
  if (!live.length) return { ok: true, changes: cs, polished: 0, kept: 0, why: [] }
  const r = await ask<{ items: { id: number; after: string }[] }>('resume-polish', polishPrompt(target, live), POLISH_SCHEMA)
  if (!r.ok) return r.error.code === 'aborted' ? r : { ok: true, changes: cs, polished: 0, kept: live.length, why: [], failed: r.error.message }
  let polished = 0, kept = 0
  const why: string[] = [], next = new Map<T, T>()
  live.forEach((x, i) => {
    const it = r.value.items.find(y => y.id === i)
    if (!it) { kept++; why.push('답이 없음'); return }
    if (it.after === x.after) return // 고칠 곳이 없다고 본 글
    const bad = polishRejects(x.after, it.after)
    if (bad) { kept++; why.push(bad); return }
    next.set(x, { ...x, after: it.after }); polished++
  })
  return { ok: true, changes: cs.map(x => next.get(x) ?? x), polished, kept, why }
}

export const polishNote = (p: { polished: number; kept: number; why: string[]; failed?: string }): string =>
  p.failed ? t('건너뜀 — {e}', { e: p.failed }) : `${t('다듬음 {n}개', { n: p.polished })}${p.kept ? ` · ${t('원문 유지 {n}개({why})', { n: p.kept, why: [...new Set(p.why)].map(w => t(w)).join(' · ') })}` : ''}` // 사유 원문은 시험 · 평가가 비교하니 보여 줄 때만 옮긴다
