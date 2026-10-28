import { ipcMain } from 'electron'
import { getSettings } from '../db.ts'
import { getProblem } from '../coding/problems.ts'
import { getAttempt } from '../practice/attempts.ts'
import type { AskReq } from '../ai/run.ts'
import { getApproaches, setApproaches, getScenes, putScenes, conceptKeys, getTheoryLog, chooseApproach, addExplain, passedWithTag, setApproachCheck, clearMapScenes, similarSolved } from '../theory/store.ts'
import { THEORY_SYSTEM, SCENES_SCHEMA, mappingPrompt, cleanScenes, codeLike } from '../theory/prompts.ts'
import { runApproaches, problemText } from '../theory/approach.ts'
import { limitsOf } from '../theory/limits.ts'
import { runMapping, runTheory } from '../theory/pipeline.ts'
import type { Ask as TheoryAsk } from '../ai/run.ts'
import { runPy } from '../theory/sandbox.ts'
import { sceneKey, CONCEPT_KEY_RE } from '../../shared/scene.ts'
import { approachKey, normalizeKey, STANDARD_KEYS } from '../../shared/approach.ts'
import { type AiError, type Approach, type ConceptRef, type TheoryPart, type TheoryResult, type SceneSet, type TheoryStage } from '../../shared/types.ts'
import type { Ctx } from './ctx.ts'
import { guards } from './guards.ts'
import { t } from '../../shared/i18n.ts'

export function registerTheory(ctx: Ctx): () => void {
  const { db, defaults, aiAsk } = ctx
  const { id, attempt } = guards(db)
  // 이론 학습 — 접근 · 장면 캐시. 입력은 여기서 검사한다
  const txt = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
  const bad = (): never => { throw new Error(t('잘못된 요청')) }
  const tagOf = (v: unknown): string => (typeof v === 'string' && v.length <= 20 ? v : bad())
  const conceptOf = (v: unknown): ConceptRef => {
    const c = v as Partial<ConceptRef> | null
    const key = c && typeof c === 'object' && typeof c.key === 'string' ? normalizeKey(c.key) : ''
    if (!c || typeof c !== 'object' || !CONCEPT_KEY_RE.test(key) || typeof c.name !== 'string' || c.name.length > 40 || (c.nature !== 'algorithm' && c.nature !== 'datastructure')) return bad()
    return { key, name: c.name, nature: c.nature, tag: tagOf(c.tag) }
  }
  const theoryAc = new Set<AbortController>()
  const inflight = new Map<string, Promise<TheoryResult>>()
  const theoryAsk = async <T>(o: Omit<AskReq, 'cli' | 'cliPath' | 'model' | 'effort' | 'signal'>) => {
    const ac = new AbortController()
    theoryAc.add(ac)
    try { return await aiAsk<T>({ ...o, signal: ac.signal }) } finally { theoryAc.delete(ac) }
  }
  const noReview = (): { ok: false; error: AiError } => ({ ok: false, error: { code: 'not-found', message: t('복습 모드에서는 이론 학습이 꺼져 있습니다') } })
  const apGen = new Map<number, number>() // 문제마다 마지막 분석 요청 번호
  const apInflight = new Map<number, Promise<{ ok: true; list: Approach[] } | { ok: false; error: AiError }>>()
  ipcMain.handle('theory:approaches', (e, aid: unknown, refresh: unknown) => {
    const att = getAttempt(db, attempt(aid))!
    if (att.mode === 'review') return noReview()
    const n = att.problemId
    const saved = refresh === true ? null : getApproaches(db, n)
    if (saved) return { ok: true, list: saved }
    const run = apInflight.get(n)
    if (run && refresh !== true) return run
    const gen = (apGen.get(n) ?? 0) + 1
    apGen.set(n, gen)
    const job = (async () => {
      const p = getProblem(db, n)
      if (!p) return { ok: false as const, error: { code: 'not-found' as const, message: t('문제를 찾지 못했습니다') } }
      const ac = new AbortController()
      theoryAc.add(ac)
      try {
        const r = await runApproaches({
          problem: p,
          ask: (task, prompt, schema) => theoryAsk({ task, system: THEORY_SYSTEM, prompt, schema, timeoutMs: task === 'approach-check' ? 180_000 : 120_000, deadlineMs: task === 'approach-check' ? 180_000 : 120_000 }),
          runPy: (code, o) => runPy(code, { ...o, signal: ac.signal }),
          stage: s => { if (!e.sender.isDestroyed()) e.sender.send('theory:stage', s) },
          keys: [...new Set([...conceptKeys(db), ...STANDARD_KEYS])], similar: similarSolved(db, n)
        })
        if (!r.ok) return r
        if (apGen.get(n) === gen) { // 그사이 새 분석을 시작했으면 옛 결과는 저장하지 않는다
          setApproaches(db, n, r.list)
          setApproachCheck(db, n, r.check)
          clearMapScenes(db, n) // 바뀐 접근 목록과 안 맞는 연결 장면을 쓰지 않게
        }
        return { ok: true as const, list: r.list }
      } finally { theoryAc.delete(ac) }
    })().finally(() => { if (apInflight.get(n) === job) apInflight.delete(n) })
    apInflight.set(n, job)
    return job
  })
  ipcMain.handle('theory:limits', (_e, aid: unknown) => {
    const p = getProblem(db, getAttempt(db, attempt(aid))!.problemId)
    return p ? limitsOf(p.html, p.classification?.complexityNote ?? '') : { lines: [], n: null, allowed: null, source: 'none', note: '' }
  })
  ipcMain.handle('theory:scenes', (e, aid: unknown, concept: unknown, part: unknown, firstTry: unknown, refresh: unknown): Promise<TheoryResult> => {
    const att = getAttempt(db, attempt(aid))!
    if (att.mode === 'review') return Promise.resolve(noReview())
    const n = att.problemId
    const c = conceptOf(concept)
    if (part !== 'theory' && part !== 'map') bad()
    const pt = part as TheoryPart
    const first = txt(firstTry, 500)
    const chosen = pt === 'map' ? getTheoryLog(db, attempt(aid))?.approach ?? null : null
    const key = pt === 'theory' ? sceneKey.concept(c.key) : sceneKey.map(n, chosen?.concepts.length ? approachKey(chosen.concepts.map(x => x.key)) : c.key)
    const run = inflight.get(key)
    if (run) return run
    const job = (async (): Promise<TheoryResult> => {
      const saved = refresh === true ? null : getScenes(db, key)
      if (saved) return { ok: true, set: saved, cached: true }
      const p = getProblem(db, n)
      if (pt === 'map' && !p) return { ok: false, error: { code: 'not-found', message: t('문제를 찾지 못했습니다') } }
      // 모듈 흐름(theory/pipeline) — 단계마다 화면에 알린다. 실행 검산도 [취소] 에 걸린다
      const stage = (s: TheoryStage): void => { if (!e.sender.isDestroyed()) e.sender.send('theory:stage', s) }
      const ask: TheoryAsk = (task, prompt, schema) => theoryAsk({ task, system: THEORY_SYSTEM, prompt, schema, timeoutMs: 180_000, deadlineMs: 180_000 })
      const ac = new AbortController()
      theoryAc.add(ac)
      let out: Awaited<ReturnType<typeof runTheory>>
      try {
        out = pt === 'theory'
          ? await runTheory(c, ask, (code, prelude) => runPy(code, { signal: ac.signal, prelude }), stage)
          : await runMapping(chosen ? { ...c, name: chosen.name } : c, async () => { const r = await theoryAsk<Parameters<typeof cleanScenes>[0]>({ task: 'mapping', system: THEORY_SYSTEM, prompt: mappingPrompt(p!, chosen ? { name: chosen.name, clue: chosen.clue, complexity: chosen.complexity, concepts: chosen.concepts.map(x => x.name) } : { name: c.name, clue: '', complexity: '', concepts: [c.name] }, first), schema: SCENES_SCHEMA, timeoutMs: 180_000, deadlineMs: 180_000 }); return r.ok ? { ok: true, value: cleanScenes(r.value, 'map') } : r }, ask, stage, codeLike, problemText(p!))
      } finally { theoryAc.delete(ac) }
      if (!out.ok) return out
      const set: SceneSet = out.set
      const s = getSettings(db, defaults)
      putScenes(db, key, set, s['ai.cli'], s['ai.model'])
      return { ok: true, set, cached: false }
    })().finally(() => inflight.delete(key))
    inflight.set(key, job)
    return job
  })
  ipcMain.handle('theory:cancel', () => { theoryAc.forEach(c => c.abort()) })
  ipcMain.handle('theory:familiar', (_e, aid: unknown, tag: unknown) => {
    const att = getAttempt(db, attempt(aid))!
    return att.mode === 'review' ? 0 : passedWithTag(db, typeof tag === 'string' && tag.length <= 20 ? tag : '', att.problemId)
  })
  ipcMain.handle('theory:choose', (_e, aid: unknown, pick: unknown) => {
    const n = attempt(aid), att = getAttempt(db, n)!
    if (att.mode === 'review') bad()
    const q = (pick && typeof pick === 'object' ? pick : {}) as Record<string, unknown>
    const list = getApproaches(db, att.problemId) ?? []
    const i = Number.isInteger(q.index) ? (q.index as number) : -1
    const a = list[i] ?? bad()
    if (a.name !== q.name) bad()
    return chooseApproach(db, n, { name: a.name, complexity: a.complexity ?? '', concepts: a.concepts.map(c => ({ key: c.key, name: c.name })), clue: a.clue ?? '' }, txt(q.own, 500))
  })
  ipcMain.handle('theory:chosen', (_e, aid: unknown) => getTheoryLog(db, id(aid)))
  ipcMain.handle('theory:log', (_e, aid: unknown, explain: unknown) => { addExplain(db, id(aid), txt(explain, 500)) })
  return () => { theoryAc.forEach(c => c.abort()) }
}
