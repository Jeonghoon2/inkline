import { BrowserWindow, session, type DownloadItem } from 'electron'
import { open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { forceAttachment, isPdfResponse } from './paperHeaders.ts'
import { t } from '../shared/i18n.ts'

type Entry = { win: BrowserWindow; onPdf: (path: string, host: string) => Promise<void> }
const open_ = new Map<string, Entry>() // 항목 키 → 창
const PARTITION = 'persist:papers'
let ready = false

function setup(): void {
  if (ready) return
  ready = true
  const ses = session.fromPartition(PARTITION)
  ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (d, cb) => {
    const h = d.responseHeaders ?? {}
    cb({ responseHeaders: (d.resourceType === 'mainFrame' || d.resourceType === 'subFrame') && isPdfResponse(h) ? forceAttachment(h) : h })
  })
  ses.on('will-download', (_e, item: DownloadItem, wc) => {
    const entry = [...open_.values()].find(x => !x.win.isDestroyed() && x.win.webContents === wc)
    if (!entry) { item.cancel(); return }
    const { win, onPdf } = entry
    const tmp = join(tmpdir(), `inkline-knowledge-${randomBytes(8).toString('hex')}.pdf`)
    let host = ''
    try { host = new URL(item.getURL()).host } catch { /* 주소를 못 읽어도 그만 */ }
    item.setSavePath(tmp)
    item.once('done', (_ev, state) => {
      void (async () => {
        if (state !== 'completed') { await rm(tmp, { force: true }); return }
        const head = Buffer.alloc(5)
        try { const fh = await open(tmp, 'r'); try { await fh.read(head, 0, 5, 0) } finally { await fh.close() } } catch { /* 못 읽으면 PDF 아님 */ }
        if (head.toString() !== '%PDF-') {
          await rm(tmp, { force: true })
          if (!win.isDestroyed()) win.setTitle(t('받은 파일이 PDF 가 아닙니다 — 다른 링크를 눌러 보세요'))
          return
        }
        try { await onPdf(tmp, host) } catch (e) {
          if (!win.isDestroyed()) win.setTitle(t('붙이지 못했습니다 — {e}', { e: e instanceof Error ? e.message : String(e) }))
          return
        } finally { await rm(tmp, { force: true }) }
        if (!win.isDestroyed()) win.close()
      })()
    })
  })
}

export function openPaperWindow(key: string, title: string, url: string, onPdf: Entry['onPdf']): void {
  setup()
  const cur = open_.get(key)
  if (cur && !cur.win.isDestroyed()) { if (cur.win.isMinimized()) cur.win.restore(); cur.win.focus(); return }
  const win = new BrowserWindow({
    width: 1100, height: 800,
    title: t('원문 받기 — {title} · PDF 를 열거나 내려받으면 이 항목에 붙습니다', { title }),
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  open_.set(key, { win, onPdf })
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u)) void win.loadURL(u).catch(() => {})
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, u) => { if (!/^https?:/i.test(u)) e.preventDefault() })
  win.on('page-title-updated', e => e.preventDefault()) // 안내 제목을 유지한다
  win.on('closed', () => { if (open_.get(key)?.win === win) open_.delete(key) })
  void win.loadURL(url).catch(() => {}) // 내려받기로 바뀐 이동은 ERR_ABORTED 로 거절된다
}

export function closePaperWindows(): void {
  for (const { win } of [...open_.values()]) if (!win.isDestroyed()) win.close()
}
