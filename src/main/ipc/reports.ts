import { ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { COMPANY_SCHEMA, REPORT_KEY, REPORT_SCHEMA, REPORT_SYSTEM, companyPrompt, formatCompany, formatReport, reportPrompt, type CompanyGroup, saveReport, validReportName, type Audience, type Project } from '../reports.ts'
import { rename as fsRename } from 'node:fs/promises'
import { loadKnowledge } from '../knowledge.ts'
import { weekOf } from '../../shared/week.ts'
import { getSettings } from '../db.ts'
import { loadHistory } from '../history.ts'
import type { Ctx } from './ctx.ts'
import { t } from '../../shared/i18n.ts'

export function registerReports(ctx: Ctx): () => void {
  const { db, defaults, aiAsk } = ctx
  // 주간 보고 — 고른 프로젝트의 그 주 기록을 AI 가 묶고, 앱이 스킬 형식으로 조립한다
  let reportAc: AbortController | null = null
  ipcMain.handle('reports:make', async (_e, key: unknown, cats: unknown, aud: unknown) => {
    if (typeof key !== 'string' || !/^\d{4}-W\d{2}$/.test(key)) throw new Error(t('잘못된 주'))
    if (aud !== 'dev' && aud !== 'nondev' && aud !== 'company') throw new Error(t('잘못된 대상'))
    const audience = aud as Audience
    if (!Array.isArray(cats) || cats.length > 200 || !cats.every(c => typeof c === 'string')) throw new Error(t('잘못된 프로젝트'))
    const entries = loadHistory(getSettings(db, defaults).historyRoot).entries.filter(e => weekOf(e.date).key === key && cats.includes(e.category))
    if (!entries.length) return { ok: false, error: { code: 'not-found', message: t('그 주에 고른 프로젝트의 기록이 없습니다') } }
    const refs = new Map(loadKnowledge(join(getSettings(db, defaults).historyRoot, 'knowledge')).items.map(i => [`${i.category}/${i.slug}`, `${i.title} — ${i.source}`] as const))
    reportAc?.abort()
    const ac = (reportAc = new AbortController())
    try {
      if (audience === 'company') {
        const r = await aiAsk<{ groups: CompanyGroup[] }>({ task: 'report-company', system: REPORT_SYSTEM, prompt: companyPrompt(entries), schema: COMPANY_SCHEMA, timeoutMs: 120_000, deadlineMs: 120_000, signal: ac.signal })
        if (!r.ok) return r
        const text = formatCompany(weekOf(entries[0]!.date), entries, r.value.groups, cats as string[])
        if (!text.includes('○ ')) return { ok: false, error: { code: 'bad-output', message: t('보고를 정리하지 못했습니다 — 다시 시도해 주세요') } }
        return { ok: true, text, count: entries.length }
      }
      const r = await aiAsk<{ projects: Project[] }>({ task: 'report', system: REPORT_SYSTEM, prompt: reportPrompt(entries, audience as Exclude<Audience, 'company'>, refs), schema: REPORT_SCHEMA, timeoutMs: 120_000, deadlineMs: 120_000, signal: ac.signal })
      if (!r.ok) return r
      const text = formatReport(weekOf(entries[0]!.date), entries, r.value.projects, cats as string[], audience)
      if (!text.includes('**○')) return { ok: false, error: { code: 'bad-output', message: t('보고를 정리하지 못했습니다 — 다시 시도해 주세요') } }
      return { ok: true, text, count: entries.length }
    } finally {
      if (reportAc === ac) reportAc = null
    }
  })
  ipcMain.handle('reports:cancel', () => { reportAc?.abort() })
  ipcMain.handle('reports:save', async (_e, key: unknown, text: unknown, overwrite: unknown) => {
    if (typeof key !== 'string' || typeof text !== 'string' || text.length > 50_000 || typeof overwrite !== 'boolean') throw new Error(t('잘못된 요청'))
    const root = getSettings(db, defaults).historyRoot
    // 덮어쓸 때 예전 판은 휴지통으로(지우지 않고 되살릴 수 있게) — 못 옮기면 덮어쓰지 않는다
    if (overwrite && REPORT_KEY.test(key)) { const old = join(root, 'reports', `${key}.md`); if (existsSync(old)) await shell.trashItem(old) }
    const r = await saveReport(root, key, text, overwrite)
    if (r.saved) rebuildPage(root)
    return r
  })
  // 타임라인 페이지(index.html)도 다시 만든다 — 실패해도 보고 파일은 바뀌었다
  const rebuildPage = (root: string): void => {
    const build = join(root, 'build.mjs')
    if (existsSync(build)) spawn(process.execPath, [build], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore', windowsHide: true }).on('error', e => console.error('build.mjs 실패', e))
  }
  const reportFile = (name: unknown): string => {
    if (!validReportName(name)) throw new Error(t('쓸 수 없는 이름입니다 — / \\ : 와 맨 앞 점은 안 됩니다'))
    return join(getSettings(db, defaults).historyRoot, 'reports', `${name}.md`)
  }
  ipcMain.handle('reports:rename', async (_e, from: unknown, to: unknown) => {
    const a = reportFile(from), b = reportFile(to)
    if (!existsSync(a)) throw new Error(t('보고를 찾지 못했습니다'))
    if (a === b) return
    if (existsSync(b)) throw new Error(t('같은 이름의 보고가 이미 있습니다'))
    await fsRename(a, b)
    rebuildPage(getSettings(db, defaults).historyRoot)
  })
  // 지우기는 휴지통으로 — 되살릴 수 있다
  ipcMain.handle('reports:remove', async (_e, name: unknown) => {
    const f = reportFile(name)
    if (!existsSync(f)) throw new Error(t('보고를 찾지 못했습니다'))
    await shell.trashItem(f)
    rebuildPage(getSettings(db, defaults).historyRoot)
  })
  return () => { reportAc?.abort() }
}
