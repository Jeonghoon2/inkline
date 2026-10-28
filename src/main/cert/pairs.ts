// 헷갈리는 쌍 — 두 항목 본문만 근거로 차이(먼저) · 공통점 · 구별 문제 2개
// (지식사전: 학습 과학/learning-concepts-and-categories-is-spacing-the-enemy-of-ind — 차이가 드러날 때 구별을 배운다)
import type { AiError } from '../../shared/types.ts'
import type { CertItem, NewQuestion } from '../../shared/cert.ts'
import { arr, obj, str } from '../ai/schema.ts'
import type { Ask } from '../ai/run.ts'
import { data } from './ai.ts'
import { QUESTION, blinded, checked, cleanQuestion, questionIssues } from './material.ts'

export const PAIR_SCHEMA = obj({ diffs: arr(str(160), 3, 3), common: str(200), questions: arr(QUESTION, 2, 2) })
export function pairPrompt(a: CertItem, b: CertItem): string {
  return [
    `할 일: 학습자가 '${a.title}' 와 '${b.title}' 를 자주 헷갈린다. 두 항목 글에 있는 사실만으로 구별을 돕는다.`,
    '- diffs: 둘의 차이 3줄 — 한 줄에 한 기준(목적 · 방법 · 예 등), "A 는 ~, B 는 ~" 꼴',
    '- common: 공통점 한 줄',
    '- questions: 둘을 구별해야 풀 수 있는 4지선다 2문제. quote 는 정답 근거가 되는 두 항목 글 중 한 문장 그대로, choiceItems 는 보기가 두 항목 중 하나의 개념이면 그 제목(정답 보기는 빈 글)',
    "- '모두 맞다' · '정답 없음' 같은 보기는 쓰지 않는다",
    data('item', `[${a.subject}] ${a.title}\n${a.body}`),
    data('item', `[${b.subject}] ${b.title}\n${b.body}`)
  ].join('\n')
}
export async function runPair(ask: Ask, a: CertItem, b: CertItem): Promise<{ ok: true; diffs: string[]; common: string; questions: NewQuestion[] } | { ok: false; error: AiError }> {
  const r = await ask<{ diffs: string[]; common: string; questions: NewQuestion[] }>('cert-pair', pairPrompt(a, b), PAIR_SCHEMA)
  if (!r.ok) return r
  const body = `${a.body}\n${b.body}`
  const valid = r.value.questions.map(q => cleanQuestion(q, [a.title, b.title], '')).filter(q => !questionIssues(q, body).length)
  // 쌍 문제도 블라인드 풀이와 AI 점검을 거친다 — 정답 둘 이상 · 모호함은 두 비슷한 개념을 나란히 둘 때 더 잘 생긴다
  const both = { ...a, title: `${a.title} / ${b.title}`, body }
  const qs = await checked(ask, both, await blinded(ask, both, valid))
  return { ok: true, diffs: r.value.diffs.map(d => d.trim()), common: r.value.common.trim(), questions: qs }
}
