import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { getSettings } from '../db.ts'
import { CERT_SYSTEM, certTimeout } from '../cert/ai.ts'
import { validPatch } from '../cert/patch.ts'
import * as CS from '../cert/store.ts'
import { answerQuestion, confirmBook, homeOf, importPdf, markSeen, nextCard, pageText as certPageText, pairCardOf, removeBook, segmentBook, startMock, submitMock, type CertDeps } from '../cert/service.ts'
import type { CertStage } from '../../shared/cert.ts'
import type { Ctx } from './ctx.ts'
import { t } from '../../shared/i18n.ts'

export function registerCert(ctx: Ctx): () => void {
  const { db, defaults, aiAsk } = ctx
  // 자격증 — 교재 글 · 만든 자료는 이 DB 와 userData/certs 에만. 오래 걸리는 일(가져오기 · 항목 나누기 · 모의 시험 준비)은 하나만, [취소]로 멈춘다
  let certAc: AbortController | null = null
  const pos = (v: unknown): number => { if (!Number.isInteger(v) || (v as number) < 1) throw new Error(t('잘못된 번호')); return v as number }
  const certDeps = (send?: (s: CertStage) => void, signal?: AbortSignal): CertDeps => {
    const s = getSettings(db, defaults)
    return {
      db, signal, cli: s['ai.cli'] || null, model: s['ai.model'],
      ask: (task, prompt, schema) => aiAsk({ task, system: CERT_SYSTEM, prompt, schema, ...certTimeout(task), signal }),
      stage: st => send?.(st)
    }
  }
  const sender = (e: IpcMainInvokeEvent) => (s: CertStage): void => { if (!e.sender.isDestroyed()) e.sender.send('cert:stage', s) }
  const long = async <T>(e: IpcMainInvokeEvent, f: (d: CertDeps) => Promise<T>, busy: T): Promise<T> => {
    if (certAc) return busy // 다른 일을 끊지 않는다 — 멈추는 건 cert:cancel 뿐
    const ac = new AbortController()
    certAc = ac
    try { return await f(certDeps(sender(e), ac.signal)) } finally { if (certAc === ac) certAc = null }
  }
  ipcMain.handle('cert:list', () => CS.listBooks(db))
  ipcMain.handle('cert:pickPdf', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('cert:import', (e, path: unknown) => {
    if (typeof path !== 'string' || !path || path.length > 4096 || !/\.pdf$/i.test(path)) throw new Error(t('PDF 파일만 넣을 수 있습니다'))
    return long(e, d => importPdf(d, app.getPath('userData'), path, new Date()), { ok: false, error: t('다른 작업이 끝난 뒤에 다시 해 주세요') })
  })
  ipcMain.handle('cert:confirm', (_e, bookId: unknown, patch: unknown) => confirmBook(certDeps(), pos(bookId), validPatch(patch)))
  ipcMain.handle('cert:segment', (e, bookId: unknown) => long(e, d => segmentBook(d, pos(bookId)), { ok: false, error: t('다른 작업이 끝난 뒤에 다시 해 주세요') }))
  ipcMain.handle('cert:cancel', () => { certAc?.abort() })
  ipcMain.handle('cert:home', (_e, bookId: unknown) => homeOf(certDeps(), pos(bookId), new Date()))
  ipcMain.handle('cert:next', (e, bookId: unknown, subject: unknown) => {
    if (subject !== null && (typeof subject !== 'string' || subject.length > 40)) throw new Error(t('잘못된 과목'))
    return nextCard(certDeps(sender(e)), pos(bookId), subject as string | null, new Date())
  })
  ipcMain.handle('cert:answer', (_e, qid: unknown, picked: unknown, sure: unknown, mode: unknown) => {
    if (!Number.isInteger(picked) || (picked as number) < 0 || (picked as number) > 3) throw new Error(t('잘못된 보기'))
    if (typeof sure !== 'boolean' || (mode !== 'learn' && mode !== 'review')) throw new Error(t('잘못된 값'))
    return answerQuestion(certDeps(), pos(qid), picked as number, sure, mode, new Date())
  })
  ipcMain.handle('cert:seen', (_e, itemId: unknown) => markSeen(certDeps(), pos(itemId), new Date()))
  ipcMain.handle('cert:page', (_e, bookId: unknown, page: unknown) => certPageText(certDeps(), pos(bookId), pos(page)))
  ipcMain.handle('cert:mockStart', (e, bookId: unknown) => long(e, d => startMock(d, pos(bookId), new Date()), { error: t('다른 작업이 끝난 뒤에 다시 해 주세요') }))
  ipcMain.handle('cert:mockSubmit', (_e, mockId: unknown, picks: unknown) => {
    if (!picks || typeof picks !== 'object') throw new Error(t('잘못된 답안'))
    const clean: Record<number, number | null> = {}
    for (const [k, v] of Object.entries(picks as Record<string, unknown>)) clean[pos(Number(k))] = Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3 ? (v as number) : null
    return submitMock(certDeps(), pos(mockId), clean, new Date())
  })
  ipcMain.handle('cert:wrongs', (_e, bookId: unknown) => CS.wrongNote(db, pos(bookId)))
  ipcMain.handle('cert:pairs', (_e, bookId: unknown) => CS.pairsOf(db, pos(bookId)))
  ipcMain.handle('cert:pairCard', (e, bookId: unknown, a: unknown, b: unknown) => long(e, d => pairCardOf(d, pos(bookId), pos(a), pos(b)), { error: t('다른 작업이 끝난 뒤에 다시 해 주세요') }))
  ipcMain.handle('cert:remove', (_e, bookId: unknown) => removeBook(certDeps(), pos(bookId)))
  return () => { certAc?.abort() }
}
