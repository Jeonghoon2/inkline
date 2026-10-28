import type { DatabaseSync } from 'node:sqlite'
import { getAttempt } from '../practice/attempts.ts'
import { LANGS, STAGES, type Lang, type Stage } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

// renderer 입력은 믿지 않는다 — 풀이 · 튜터 · 이론 학습이 같은 검사를 쓴다
export function guards(db: DatabaseSync) {
  const MAX = 200_000
  const id = (v: unknown): number => { if (!Number.isInteger(v)) throw new Error(t('잘못된 번호')); return v as number }
  const lang = (v: unknown): Lang => { if (!LANGS.includes(v as Lang)) throw new Error(t('모르는 언어')); return v as Lang }
  const text = (v: unknown): string => { if (typeof v !== 'string' || v.length > MAX) throw new Error(t('잘못된 글')); return v }
  const attempt = (v: unknown): number => { const n = id(v); if (!getAttempt(db, n)) throw new Error(t('시도를 찾지 못했습니다')); return n }
  const stageOf = (v: unknown): Stage => { if (!STAGES.includes(v as Stage)) throw new Error(t('모르는 단계')); return v as Stage }
  return { id, lang, text, attempt, stageOf }
}
