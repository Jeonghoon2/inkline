// 확인 카드 값 검사 — renderer 에서 오는 값이라 꼴 · 범위를 본다
import { CERT_KINDS, type CertKind, type CertPatch } from '../../shared/cert.ts'
import { t } from '../../shared/i18n.ts'
const n = (v: unknown, lo: number, hi: number, what: string): number => { if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) throw new Error(t('잘못된 {what}', { what: t(what) })); return v as number }
export function validPatch(v: unknown): CertPatch {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (!name || name.length > 60) throw new Error(t('자격증 이름을 적어 주세요(60자 이하)'))
  if (!CERT_KINDS.includes(o.kind as CertKind)) throw new Error(t('잘못된 종류'))
  const subjects = [...new Set(Array.isArray(o.subjects) ? o.subjects.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean) : [])]
  if (!subjects.length || subjects.length > 12 || subjects.some(s => s.length > 40)) throw new Error(t('과목은 1~12개, 40자 이하'))
  const r = (o.rules && typeof o.rules === 'object' ? o.rules : {}) as Record<string, unknown>
  const rules = { perSubject: n(r.perSubject, 1, 200, '과목당 문항 수'), minSubject: n(r.minSubject, 0, 100, '과목 최저 점수'), minAvg: n(r.minAvg, 0, 100, '평균 점수'), minutes: n(r.minutes, 1, 600, '시험 시간') }
  if (o.examDate !== null && !(typeof o.examDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.examDate))) throw new Error(t('시험일은 YYYY-MM-DD'))
  return { name, kind: o.kind as CertKind, subjects, rules, examDate: (o.examDate as string | null) ?? null }
}
