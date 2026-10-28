import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readRules, writeRules } from '../recordRules.ts'
import { getSettings, setSetting, isValidSetting } from '../db.ts'
import { listModels } from '../models.ts'
import { loadHistory } from '../history.ts'
import { watchDir } from '../watch.ts'
import { createShorts } from '../shorts.ts'
import { AI_CLIS, type AiCli, type Settings } from '../../shared/types.ts'
import type { Ctx } from './ctx.ts'
import { resolveLang, setLang, t, type UiLangPref } from '../../shared/i18n.ts'

export function registerApp(ctx: Ctx): () => void {
  const { db, defaults, notify, skillDir, detect, tools } = ctx
  ipcMain.handle('settings:all', () => getSettings(db, defaults))
  // 기록 폴더 — 읽기는 매번 새로, 감시는 설정의 historyRoot 하나만
  let stopWatch = (): void => {}
  const rewatch = (): void => {
    stopWatch()
    stopWatch = watchDir(getSettings(db, defaults).historyRoot, () => notify('history:changed'))
  }
  rewatch()
  ipcMain.handle('history:load', () => loadHistory(getSettings(db, defaults).historyRoot))
  // 쇼츠 엔진은 work-history 옆의 concept-shorts — 시험용 앱은 INKLINE_SHORTS_ENGINE 으로 가짜 엔진을 쓴다
  const shorts = createShorts(process.env.INKLINE_SHORTS_ENGINE || join(dirname(skillDir), 'concept-shorts', 'engine', 'shorts.mjs'),
    () => getSettings(db, defaults).historyRoot, () => notify('shorts:changed'))
  ipcMain.handle('shorts:make', (_e, name: unknown) => shorts.make(name))
  ipcMain.handle('shorts:jobs', () => shorts.jobs())
  ipcMain.handle('history:rules', () => readRules(skillDir))
  ipcMain.handle('history:setRules', (_e, r: unknown) => writeRules(skillDir, r))
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    if (!isValidSetting(key, value, defaults)) throw new Error(t('잘못된 설정 값: {key}', { key })) // renderer 입력은 믿지 않는다
    setSetting(db, key as keyof Settings, value as never)
    if (key === 'ui.lang') setLang(resolveLang(value as UiLangPref, app.getLocale()))
    if (key === 'historyRoot') {
      rewatch()
      notify('history:changed')
    }
  })
  ipcMain.handle('tools:detect', detect)
  ipcMain.handle('tools:models', async (_e, cli: string) => {
    if (!AI_CLIS.includes(cli as AiCli)) throw new Error(t('모르는 CLI: {cli}', { cli: String(cli) }))
    return listModels(cli as AiCli, tools() ?? (await detect()))
  })
  ipcMain.handle('dialog:pickFolder', async (e, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { properties: ['openDirectory' as const], defaultPath }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('app:dataDir', () => app.getPath('userData'))
  // Windows 의 창 단추(최소화 · 최대화 · 닫기) 띠를 테마 색에 맞춘다 — 맥은 신호등 단추라 칠할 것이 없다
  ipcMain.handle('app:titleBar', (e, color: unknown, symbol: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const hex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
    if (process.platform === 'win32' && win && hex(color) && hex(symbol)) win.setTitleBarOverlay({ color, symbolColor: symbol, height: 36 })
  })
  ipcMain.handle('shell:openPath', async (_e, path: string) => {
    if (typeof path !== 'string' || !path) throw new Error(t('경로가 없습니다'))
    if (!statSync(path).isDirectory()) throw new Error(t('폴더가 아닙니다'))
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })
  return () => { stopWatch() }
}
