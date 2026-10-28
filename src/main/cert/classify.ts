// 판별 — 앞쪽 글로 자격증 이름 · 종류 · 과목 · 합격 기준을 제안한다(사용자가 확인 카드에서 고친다)
import { CERT_KINDS, type CertKind, type CertRules } from '../../shared/cert.ts'
import { arr, int, obj, str } from '../ai/schema.ts'
import { data } from './ai.ts'

export const CLASSIFY_SCHEMA = obj({
  name: str(60), kind: { type: 'string', enum: [...CERT_KINDS] }, subjects: arr(str(40), 1, 12),
  rules: obj({ perSubject: int(1, 200), minSubject: int(0, 100), minAvg: int(0, 100), minutes: int(1, 600) }), evidence: str(300)
})
export interface Classified { name: string; kind: CertKind; subjects: string[]; rules: CertRules; evidence: string }

export function classifyPages(pages: string[]): number[] {
  const first = pages.slice(0, 6).map((_, i) => i + 1)
  const toc = pages.slice(6, 20).map((t, i) => ({ t, p: i + 7 })).filter(x => /목\s*차|차\s*례|contents|과목/i.test(x.t)).slice(0, 2).map(x => x.p)
  return [...first, ...toc]
}
export function classifyPrompt(pages: string[]): string {
  return [
    '할 일: 이 교재가 어떤 자격증의 어떤 시험(필기 · 실기 · 기타)을 위한 것인지 판별한다.',
    '- name: 자격증 이름(예: 정보처리기사). 표지 · 제목에 쓰인 이름 그대로, 시험 종류 낱말(필기 · 실기)은 빼고',
    '- kind: 필기 · 실기 · 기타 중 하나. 교재에 쓰인 대로, 없으면 내용으로(객관식 요약 · 기출이면 필기, 코드 · 서술 · 작업 실습이면 실기)',
    '- subjects: 시험 과목(없으면 교재의 큰 단원)을 교재 순서대로. 교재에 쓰인 이름 그대로, 앞의 "1과목" 같은 번호는 뗀다',
    '- rules: 이 시험의 합격 기준 — perSubject 과목당 문항 수, minSubject 과목 최저 점수(100점 환산), minAvg 평균 점수, minutes 시험 시간(분). 교재에 없으면 알려진 공식 기준, 모르면 20 · 40 · 60 · 150',
    '- evidence: 어느 쪽의 무슨 글에서 판단했는지 한두 문장',
    data('book', classifyPages(pages).map(p => `[p.${p}]\n${(pages[p - 1] ?? '').slice(0, 2500)}`).join('\n\n'))
  ].join('\n')
}
// 원문 대조(앱) — AI 가 낸 과목 이름이 교재 글에 실제로 나오는지(띄어쓰기 무시). 없으면 확인 카드에서 알린다
export function unverifiedSubjects(subjects: string[], pages: string[]): string[] {
  const all = pages.join('').replace(/\s+/g, '')
  return subjects.filter(s => s !== '전체' && !all.includes(s.replace(/\s+/g, '')))
}
export function cleanClassify(v: Classified): Classified {
  const subjects = [...new Set(v.subjects.map(s => s.trim()).filter(Boolean))]
  return { ...v, name: v.name.trim(), subjects: subjects.length ? subjects : ['전체'], evidence: v.evidence.trim() }
}
