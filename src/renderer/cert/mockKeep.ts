// 모의 시험 진행 상태 — 탭을 옮겨 Mock 이 사라져도 앱이 켜져 있는 동안 남긴다(CertTab 의 kept 와 같은 방식)
import type { CertPaper } from '../../shared/cert.ts'
import { t } from '../../shared/i18n.ts'

export type MockKept = { bookId: number; paper: CertPaper; picks: Record<number, number | null>; flags: number[]; at: number; deadline: number }

let kept: MockKept | null = null
export const keepMock = (k: MockKept | null): void => { kept = k }
/** 교재를 지우면 그 교재의 진행 중 시험도 버린다 — 교재 id 가 다시 쓰일 수 있다 */
export const dropMock = (bookId: number): void => { if (kept?.bookId === bookId) kept = null }
/** 이 교재의 시험이 진행 중이면 그 상태와 마감까지 남은 초 */
export const resumeMock = (bookId: number, now: number): (MockKept & { left: number }) | null =>
  kept && kept.bookId === bookId ? { ...kept, left: leftSecs(kept.deadline, now) } : null
export const leftSecs = (deadline: number, now: number): number => Math.max(0, Math.ceil((deadline - now) / 1000))

/** 제출 확인 문구 — '안 푼 문제 2개(3 · 4번)', 번호는 5개까지 */
export function unansweredNote(paper: CertPaper, picks: Record<number, number | null>): string {
  const n = paper.questions.flatMap((q, i) => (picks[q.id] ?? null) === null ? [i + 1] : [])
  if (!n.length) return ''
  return t('안 푼 문제 {n}개({nums}번{more})', { n: n.length, nums: n.slice(0, 5).join(' · '), more: n.length > 5 ? ' …' : '' })
}
