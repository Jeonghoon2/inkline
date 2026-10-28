import { ipcMain } from 'electron'
import { parseProblemUrl } from '../coding/url.ts'
import { fetchDraft, inlineImages, openLogin } from '../coding/fetch.ts'
import { getProblem, getProblemByUrl, insertProblem, listProblems, setClassification } from '../coding/problems.ts'
import { problemStatuses } from '../practice/after.ts'
import { CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, classifyPrompt, siteHints, mergeClassification } from '../ai/classify.ts'
import { type ImportResult, type Site, type Classification, type AiError } from '../../shared/types.ts'
import type { Ctx } from './ctx.ts'
import { t } from '../../shared/i18n.ts'

export function registerCoding(ctx: Ctx): () => void {
  const { db, notify, aiAsk } = ctx
  const classify = async (id: number): Promise<Classification | AiError> => {
    const p = getProblem(db, id)
    if (!p) return { code: 'not-found', message: t('문제를 찾지 못했습니다') }
    const r = await aiAsk<Classification>({ task: 'classify', system: CLASSIFY_SYSTEM, prompt: classifyPrompt(p), schema: CLASSIFY_SCHEMA, timeoutMs: 60_000 })
    if (!r.ok) return r.error
    const c = mergeClassification(r.value, siteHints(p.site, p.siteLevel, p.siteTags))
    setClassification(db, id, c)
    return c
  }
  ipcMain.handle('coding:classify', (_e, id: unknown) => {
    if (!Number.isInteger(id)) throw new Error(t('잘못된 문제 번호'))
    return classify(id as number).finally(() => notify('coding:changed'))
  })
  ipcMain.handle('coding:import', async (_e, input: unknown): Promise<ImportResult> => {
    const p = typeof input === 'string' ? parseProblemUrl(input) : null
    if (!p) return { ok: false, reason: 'bad-url', message: t('Programmers · LeetCode 문제 주소만 됩니다') }
    const existing = getProblemByUrl(db, p.url)
    if (existing) return { ok: true, problem: existing, existed: true }
    try {
      const d = await fetchDraft(p.site, p.siteId)
      if (d === 'need-login') return { ok: false, reason: 'need-login', site: p.site, message: p.site === 'leetcode' ? t('로그인이 필요하거나 유료 문제입니다') : t('로그인이 필요한 문제입니다') }
      if (d === 'parse-failed') return { ok: false, reason: 'parse-failed', site: p.site, url: p.url, message: t('문제 본문을 찾지 못했습니다 (사이트 구조가 바뀌었을 수 있습니다)') }
      if (d === 'not-found') return { ok: false, reason: 'not-found', site: p.site, message: t('문제를 찾지 못했습니다') }
      d.html = await inlineImages(d.html)
      const problem = insertProblem(db, d)
      // 기다리지 않고 뒤에서 분류 — 끝나면(성공이든 실패든) 목록을 새로 읽게 알린다
      classify(problem.id)
        .then(r => { if ('code' in r) console.error('자동 분류 실패', r.code, r.message) })
        .catch(e => console.error('자동 분류 실패', e))
        .finally(() => notify('coding:changed'))
        .catch(() => {})
      return { ok: true, problem, existed: false }
    } catch (e) {
      return { ok: false, reason: 'fetch-failed', site: p.site, message: t('문제를 가져오지 못했습니다: {e}', { e: e instanceof Error ? e.message : String(e) }) }
    }
  })
  ipcMain.handle('coding:login', async (_e, site: unknown) => {
    if (site !== 'programmers' && site !== 'leetcode') throw new Error(t('모르는 사이트: {site}', { site: String(site) }))
    await openLogin(site as Site)
  })
  ipcMain.handle('coding:list', () => listProblems(db))
  ipcMain.handle('coding:passedIds', () => (db.prepare('SELECT DISTINCT problem_id FROM attempts WHERE site_passed = 1').all() as { problem_id: number }[]).map(r => r.problem_id))
  ipcMain.handle('coding:statuses', () => problemStatuses(db))
  ipcMain.handle('coding:get', (_e, id: unknown) => (Number.isInteger(id) ? getProblem(db, id as number) : null))
  return () => {}
}
