import { ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { getSettings } from '../db.ts'
import { getProblem } from '../coding/problems.ts'
import { finishAttempt, giveUp, dueReviews, sessionReport } from '../practice/after.ts'
import { startAttempt, getAttempt, saveCode, saveStage, savePredicted, addRun, lastRun } from '../practice/attempts.ts'
import { runExamples } from '../practice/runner.ts'
import { drillRows, gradeDrill } from '../drill/store.ts'
import { GRADES, type Grade } from '../../shared/drill.ts'
import { listCases, addCase, removeCase, withCases } from '../practice/cases.ts'
import { supportReason } from '../practice/harness.ts'
import { MISTAKE_SCHEMA } from '../tutor/schemas.ts'
import { looksLikeCode } from '../tutor/filter.ts'
import { TUTOR_SYSTEM, mistakePrompt } from '../tutor/prompts.ts'
import { createTutor } from '../tutor/run.ts'
import { listHints, setStageAnswer, upsertMistake, hasMistake, listMistakes, mistakesByType } from '../tutor/store.ts'
import { LANGS, STAGES, type Stage, type MistakeType, type RunResult, type Reflection } from '../../shared/types.ts'
import type { Ctx } from './ctx.ts'
import { guards } from './guards.ts'
import { t } from '../../shared/i18n.ts'

export function registerPractice(ctx: Ctx): () => void {
  const { db, defaults, notify, aiAsk } = ctx
  const { id, lang, text, attempt, stageOf } = guards(db)
  ipcMain.handle('review:due', () => dueReviews(db))
  let running: AbortController | null = null
  ipcMain.handle('practice:start', (_e, pid: unknown, l: unknown, mode: unknown) => {
    if (mode !== 'learn' && mode !== 'review') throw new Error(t('모르는 모드'))
    if (!getProblem(db, id(pid))) throw new Error(t('문제를 찾지 못했습니다'))
    return startAttempt(db, id(pid), lang(l), mode)
  })
  ipcMain.handle('practice:finish', (_e, a: unknown, passed: unknown, refl: unknown) => {
    const n = attempt(a)
    if (typeof passed !== 'boolean') throw new Error(t('잘못된 값'))
    let reflection: Reflection | null = null
    if (refl !== null) {
      const r = refl as Partial<Record<keyof Reflection, unknown>> | undefined
      if (typeof refl !== 'object' || !r || typeof r.idea !== 'string' || typeof r.complexity !== 'string' || typeof r.mistake !== 'string') throw new Error(t('잘못된 회고'))
      reflection = { idea: r.idea.slice(0, 300), complexity: r.complexity.slice(0, 300), mistake: r.mistake.slice(0, 300) }
    }
    const att = getAttempt(db, n)!
    if (att.mode === 'learn' && !passed) throw new Error(t('아직이면 끝내지 않습니다'))
    const rep = finishAttempt(db, n, passed, reflection)
    notify('coding:changed')
    return rep
  })
  ipcMain.handle('practice:giveUp', (_e, a: unknown) => {
    const n = attempt(a)
    if (getAttempt(db, n)!.mode !== 'review') throw new Error(t('복습 시도만 포기할 수 있습니다'))
    giveUp(db, n)
    notify('coding:changed')
  })
  ipcMain.handle('practice:report', (_e, a: unknown) => sessionReport(db, id(a)))
  ipcMain.handle('practice:save', (_e, a: unknown, l: unknown, code: unknown) => saveCode(db, attempt(a), lang(l), text(code)))
  ipcMain.handle('practice:stage', (_e, a: unknown, st: unknown, add: unknown) => {
    if (!STAGES.includes(st as Stage)) throw new Error(t('모르는 단계'))
    const ms: Partial<Record<Stage, number>> = {}
    if (typeof add !== 'object' || add === null) throw new Error(t('잘못된 시간'))
    for (const [k, v] of Object.entries(add)) {
      if (!STAGES.includes(k as Stage) || !Number.isFinite(v) || (v as number) < 0 || (v as number) > 3_600_000) throw new Error(t('잘못된 시간'))
      ms[k as Stage] = v as number
    }
    saveStage(db, attempt(a), st as Stage, ms)
  })
  ipcMain.handle('practice:predict', (_e, a: unknown, t: unknown) => savePredicted(db, attempt(a), text(t)))
  const sha1 = (v: string): string => createHash('sha1').update(v).digest('hex')
  let mistakeAc: AbortController | null = null
  // 실패한 실행의 오답 유형을 뒤에서 태깅 — 기다리지 않고, 오류는 기록만 한다
  const tagMistake = async (attemptId: number, problemId: number, src: string, r: RunResult): Promise<void> => {
    if (getAttempt(db, attemptId)?.mode === 'review') return
    if (r.aborted || r.compileError || r.unsupported) return
    const bad = r.results.filter(x => x.status !== 'pass')
    if (!bad.length) return
    const codeHash = sha1(src)
    if (hasMistake(db, attemptId, codeHash)) return
    let m: { type: MistakeType; line: number | null; note: string }
    if (!bad.some(x => x.status === 'fail' || x.status === 'error')) m = { type: 'timeout', line: null, note: t('시간 초과') }
    else {
      const problem = getProblem(db, problemId)
      if (!problem) return
      mistakeAc?.abort()
      const ac = (mistakeAc = new AbortController())
      const a = await aiAsk<{ type: MistakeType; line: number; note: string }>({ task: 'mistake', system: TUTOR_SYSTEM, prompt: mistakePrompt({ problem, code: src, run: r }), schema: MISTAKE_SCHEMA, timeoutMs: 60_000, deadlineMs: 60_000, signal: ac.signal })
      if (mistakeAc === ac) mistakeAc = null
      if (!a.ok || ac.signal.aborted) { if (!a.ok && a.error.code !== 'aborted') console.error('오답 태깅 실패', a.error.code, a.error.message); return }
      m = { type: a.value.type, line: a.value.line || null, note: looksLikeCode(a.value.note) ? '' : a.value.note }
    }
    if (hasMistake(db, attemptId, codeHash)) return
    upsertMistake(db, { attemptId, problemId, ...m, codeHash })
    notify('tutor:mistakesChanged')
  }
  ipcMain.handle('practice:run', async (_e, a: unknown, l: unknown, code: unknown) => {
    const n = attempt(a), lg = lang(l), src = text(code)
    saveCode(db, n, lg, src)
    const problem = getProblem(db, getAttempt(db, n)!.problemId)
    if (!problem) throw new Error(t('문제를 찾지 못했습니다'))
    running?.abort() // 실행은 한 번에 하나
    const ac = (running = new AbortController())
    try {
      const { merged, mark } = withCases(problem, listCases(db, problem.id))
      const r = mark(await runExamples({ lang: lg, problem: merged, code: src, timeoutMs: getSettings(db, defaults)['run.timeoutMs'], signal: ac.signal }))
      if (!ac.signal.aborted) {
        addRun(db, n, r) // 멈춘 실행은 기록하지 않는다
        tagMistake(n, problem.id, src, r).catch(e => console.error('오답 태깅 실패', e))
      }
      return r
    } finally {
      if (running === ac) running = null
    }
  })
  ipcMain.handle('practice:support', (_e, pid: unknown, l: unknown) => {
    const p = getProblem(db, id(pid))
    return p ? supportReason(p, lang(l)) : t('문제를 찾지 못했습니다')
  })
  ipcMain.handle('drill:state', () => drillRows(db))
  ipcMain.handle('drill:grade', (_e, concept: unknown, q: unknown, grade: unknown) => {
    if (typeof concept !== 'string' || !concept || concept.length > 200) throw new Error(t('잘못된 개념 이름'))
    if (!Number.isInteger(q) || (q as number) < 0 || (q as number) > 50) throw new Error(t('잘못된 질문 번호'))
    if (!GRADES.includes(grade as Grade)) throw new Error(t('잘못된 채점'))
    return gradeDrill(db, concept, q as number, grade as Grade, new Date())
  })
  ipcMain.handle('practice:cases', (_e, pid: unknown) => listCases(db, id(pid)))
  ipcMain.handle('practice:addCase', (_e, pid: unknown, args: unknown, expected: unknown) => {
    const p = getProblem(db, id(pid))
    if (!p) throw new Error(t('문제를 찾지 못했습니다'))
    // 사이트 예제가 도는 언어에서 이 예제 때문에 실행을 못 하게 되면 받지 않는다 — 꼴(타입)이 틀린 내 예제 하나가 전체 실행을 막지 않게
    const withNew = { ...p, examples: [...p.examples, ...listCases(db, p.id).map(c => ({ args: c.args, expected: c.expected })), { args: args as unknown[], expected }] }
    if (Array.isArray(args) && LANGS.some(l => supportReason(p, l) === null && supportReason(withNew, l) !== null)) throw new Error(t('사이트 예제와 같은 꼴(숫자 · 문자열 · 배열 등 타입)이어야 합니다'))
    return addCase(db, p, args, expected, new Date().toISOString())
  })
  ipcMain.handle('practice:removeCase', (_e, cid: unknown) => removeCase(db, id(cid)))
  ipcMain.handle('practice:cancelRun', () => { running?.abort() })
  ipcMain.handle('practice:lastRun', (_e, a: unknown) => lastRun(db, id(a)))
  // 튜터 — 게이팅은 여기서 강제한다
  const tutor = createTutor(db, aiAsk, { nudgeEnabled: () => getSettings(db, defaults)['nudge.enabled'] })
  ipcMain.handle('tutor:nudge', (_e, a: unknown, code: unknown, st: unknown) => tutor.nudge(attempt(a), text(code), stageOf(st)))
  ipcMain.handle('tutor:hints', (_e, a: unknown) => listHints(db, id(a)))
  ipcMain.handle('tutor:nextHint', (_e, a: unknown, code: unknown, st: unknown, se: unknown) => {
    const n = attempt(a), src = text(code), stage = stageOf(st)
    if (se !== null && (typeof se !== 'string' || se.length > 2000)) throw new Error(t('잘못된 글'))
    return tutor.nextHint(n, src, stage, se)
  })
  ipcMain.handle('tutor:answerStage', (_e, hintId: unknown, st: unknown) => setStageAnswer(db, id(hintId), stageOf(st)))
  ipcMain.handle('tutor:mistakes', (_e, pid: unknown) => listMistakes(db, id(pid)))
  ipcMain.handle('tutor:mistakeBook', () => mistakesByType(db))
  return () => { running?.abort(); tutor.abortAll(); mistakeAc?.abort() }
}
