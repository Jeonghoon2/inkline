import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { getAttempt, lastRun } from '../practice/attempts.ts'
import { getProblem } from '../coding/problems.ts'
import type { AskReq, AskResult } from '../ai/run.ts'
import { NUDGE_SCHEMA, HINT_SCHEMAS } from './schemas.ts'
import { cleanNudge, cleanHint } from './filter.ts'
import { FALLBACK_NUDGE, FALLBACK_HINT } from './fallback.ts'
import { problemSummary } from './context.ts'
import { getTheoryLog } from '../theory/store.ts'
import { TUTOR_SYSTEM, nudgePrompt, hintPrompt } from './prompts.ts'
import { checkSelfExplain } from './gate.ts'
import { nextLevel } from '../../shared/hintLevel.ts'
import { addHint, listHints } from './store.ts'
import type { Stage, AiError, HintLevel, HintBody, Hint } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

export type Ask = <T>(o: Omit<AskReq, 'cli' | 'cliPath' | 'model' | 'effort'>) => Promise<AskResult<T>>
export const REVIEW_GATE = '복습 모드에서는 힌트가 꺼져 있습니다'

const sha1 = (v: string): string => createHash('sha1').update(v).digest('hex')
const BAD_RULE = '\n\n직전 답이 규칙(코드 · 알고리즘 이름 금지, 길이 제한)에 어긋났다. 규칙을 지켜 다시 답한다.'

export function createTutor(db: DatabaseSync, ask: Ask, opts: { nudgeEnabled: () => boolean }) {
  const lastNudge = new Map<number, string>()
  const setNudge = (n: number, h: string): void => {
    lastNudge.delete(n); lastNudge.set(n, h)
    if (lastNudge.size > 200) lastNudge.delete(lastNudge.keys().next().value!)
  }
  const nudgeAc = new Map<number, AbortController>() // 시도마다 하나 — 새 요청이 같은 시도의 이전 것을 취소
  const nudge = async (n: number, src: string, stage: Stage): Promise<string | null> => {
    if (!opts.nudgeEnabled()) return null
    if (getAttempt(db, n)?.mode === 'review') return null
    const h = sha1(src)
    if (lastNudge.get(n) === h) return null
    const problem = getProblem(db, getAttempt(db, n)!.problemId)
    if (!problem) return null
    nudgeAc.get(n)?.abort()
    const ac = new AbortController()
    nudgeAc.set(n, ac)
    const prompt = nudgePrompt({ problem, code: src, stage, run: lastRun(db, n) })
    const end = Date.now() + 20_000
    const done = (t: string): string | null => { if (ac.signal.aborted) return null; setNudge(n, h); return t }
    try {
      for (let i = 0; i < 2; i++) {
        const left = end - Date.now()
        if (i > 0 && left < 1000) break
        const r = await ask<{ text: string }>({ task: 'nudge', system: TUTOR_SYSTEM, prompt: i ? prompt + BAD_RULE : prompt, schema: NUDGE_SCHEMA, timeoutMs: left, deadlineMs: left, signal: ac.signal })
        if (ac.signal.aborted || (!r.ok && r.error.code === 'aborted')) return null
        if (!r.ok) return done(t(FALLBACK_NUDGE[stage]))
        const nudge = cleanNudge(r.value, problemSummary(problem))
        if (nudge) return done(nudge)
      }
      return done(t(FALLBACK_NUDGE[stage]))
    } finally {
      if (nudgeAc.get(n) === ac) nudgeAc.delete(n)
    }
  }
  // 같은 시도의 힌트는 한 번에 하나만 만든다 — 같은 단계 중복 · 자기설명 게이트 우회를 막는다
  const hinting = new Set<number>()
  const hintAc = new Map<number, AbortController>()
  const makeHint = async (n: number, src: string, stage: Stage, selfExplain: string | null): Promise<Hint | AiError | { gate: string }> => {
    if (getAttempt(db, n)?.mode === 'review') return { gate: t(REVIEW_GATE) }
    const hints = listHints(db, n)
    const level = nextLevel(hints)
    if (level === null) return { gate: t('힌트를 모두 받았습니다') }
    const gate = checkSelfExplain(level, selfExplain)
    if (gate) return { gate }
    if (level === 0) return addHint(db, n, 0, { kind: 'stage', question: t('지금 이해 · 계획 · 구현 · 디버깅 중 어디쯤인가요?'), answer: null }, null)
    let hintStage = stage
    if (level === 1) {
      const b = hints.find(h => h.level === 0)?.body
      if (b?.kind !== 'stage' || !b.answer) return { gate: t('먼저 위 질문에 답해 주세요') }
      hintStage = b.answer
    }
    const at = getAttempt(db, n)!
    const problem = getProblem(db, at.problemId)
    if (!problem) return { code: 'not-found', message: t('문제를 찾지 못했습니다') }
    const prompt = hintPrompt(level, { problem, code: src, stage: hintStage, run: lastRun(db, n), prior: hints, selfExplain, lang: at.lang, approach: getTheoryLog(db, n)?.approach ?? null })
    const ac = new AbortController()
    hintAc.set(n, ac)
    const end = Date.now() + 90_000
    try {
      let body: HintBody | null = null
      for (let i = 0; i < 2 && !body; i++) {
        const left = end - Date.now()
        if (i > 0 && left < 1000) break
        const r = await ask<Record<string, unknown>>({ task: 'hint', system: TUTOR_SYSTEM, prompt: i ? prompt + (level === 6 ? '\n\n직전 답이 전체 정답 함수였다. 함수 선언과 return 을 빼고 막힌 부분 10~20줄만 답한다.' : BAD_RULE) : prompt, schema: HINT_SCHEMAS[level], timeoutMs: Math.min(60_000, left), deadlineMs: left, signal: ac.signal })
        if (!r.ok) return r.error // 단계는 오르지 않는다
        body = cleanHint(level, r.value, { sig: problem.signature, lang: at.lang })
      }
      if (ac.signal.aborted) return { code: 'aborted', message: t('취소했습니다') }
      if (!body) {
        if (level === 6) return { code: 'bad-output', message: t('핵심 부분만 보여 주는 힌트를 만들지 못했습니다 — 다시 눌러 주세요') }
        if (level > 3) return { code: 'bad-output', message: t('힌트를 만들지 못했습니다 — 다시 눌러 주세요') }
        body = { kind: 'text', text: t(FALLBACK_HINT[level as 1 | 2 | 3]) }
      }
      return addHint(db, n, level as HintLevel, body, selfExplain)
    } finally {
      if (hintAc.get(n) === ac) hintAc.delete(n)
    }
  }
  const nextHint = async (n: number, src: string, stage: Stage, se: string | null): Promise<Hint | AiError | { gate: string }> => {
    if (hinting.has(n)) return { gate: t('힌트를 만드는 중입니다') }
    hinting.add(n)
    try { return await makeHint(n, src, stage, se) } finally { hinting.delete(n) }
  }
  const abortAll = (): void => { nudgeAc.forEach(c => c.abort()); hintAc.forEach(c => c.abort()) }
  return { nudge, nextHint, abortAll }
}
