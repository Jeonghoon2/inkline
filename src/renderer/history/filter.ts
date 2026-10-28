import type { Entry } from '../../shared/types.ts'
import { plain } from './render.ts'
import { t } from '../../shared/i18n.ts'

export interface Filter { cat: string | null; type: string | null; tag: string | null; day: string | null; q: string }

const hasTag = (e: Entry, tag: string): boolean => e.tags.some(t => t.major === tag || `${t.major} - ${t.minor}` === tag)

// 참고 구현 matches — keys 는 그 기록이 칠한 개념. skipType 이면 종류는 보지 않는다(종류 탭 건수용)
export function matches(e: Entry, f: Filter, keys: string[], skipType = false): boolean {
  const q = f.q.trim().toLowerCase()
  return (
    (!f.cat || e.category === f.cat) &&
    (skipType || !f.type || e.type === f.type) &&
    (!f.tag || hasTag(e, f.tag)) &&
    (!f.day || e.date === f.day) &&
    (!q || `${e.title} ${plain(e.body)} ${e.tags.map(t => `${t.major} ${t.minor}`).join(' ')} ${keys.join(' ')}`.toLowerCase().includes(q))
  )
}

// 주간 보고 만들기의 주 목록 설명 — 그 주 건수, 이미 보고가 있으면 '보고 있음'
export const weekHint = (n: number, has: boolean): string => (has ? t('{n}건 · 보고 있음', { n }) : t('{n}건', { n }))
