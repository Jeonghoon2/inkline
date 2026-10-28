import { dialog, ipcMain, net, shell, BrowserWindow } from 'electron'
import { lstatSync } from 'node:fs'
import { open, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { openPaperWindow } from '../paperWindow.ts'
import { loadKnowledge, saveItem, removeItem, itemPath } from '../knowledge.ts'
import { KNOWLEDGE_SCHEMA, KNOWLEDGE_SYSTEM, draftPrompt, draftToItem, type Draft } from '../knowledgeAi.ts'
import { KINDS, parseItem, validHttpUrl, validName, type KItem } from '../../shared/knowledge.ts'
import { localDay } from '../../shared/week.ts'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { pdfPages, pagedText } from '../pdf.ts'
import { checkPdfFile, fetchSource } from '../knowledgeFetch.ts'
import { getSettings } from '../db.ts'
import type { Ctx } from './ctx.ts'
import { t } from '../../shared/i18n.ts'

export function registerKnowledge(ctx: Ctx): () => void {
  const { db, defaults, aiAsk } = ctx
  // 지식사전 — <historyRoot>/knowledge. 바뀌면 기존 감시가 history:changed 를 보낸다
  const kdir = () => join(getSettings(db, defaults).historyRoot, 'knowledge')
  const kstr = (v: unknown, max: number, what: string, msg?: string) => { if (typeof v !== 'string' || v.length > max) throw new Error(msg ?? t('잘못된 {what}', { what: t(what) })); return v }
  const kname = (v: unknown) => { if (!validName(v)) throw new Error(t('잘못된 이름')); return v }
  const kurl = (v: unknown) => {
    const u = kstr(v, 2000, '주소')
    if (u && !validHttpUrl(u)) throw new Error(t('http(s) 웹 주소만 됩니다'))
    return u
  }
  const kfile = (v: unknown) => { if (!validName(v) || !/\.pdf$/i.test(v)) throw new Error(t('잘못된 파일 이름')); return v }
  const isTmpPdf = (v: unknown): v is string => typeof v === 'string' && resolve(v) === v && dirname(v) === resolve(tmpdir()) && basename(v).startsWith('inkline-knowledge-') && /\.pdf$/i.test(v)
  const kitem = (v: unknown): KItem => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const tags = Array.isArray(o.tags) && o.tags.length <= 8 ? o.tags.map(t => kstr(t, 30, '태그', t('태그는 8개 · 하나에 30자까지입니다'))) : (() => { throw new Error(t('태그는 8개 · 하나에 30자까지입니다')) })()
    if (o.kind !== '' && !(KINDS as readonly string[]).includes(o.kind as string)) throw new Error(t('잘못된 종류'))
    return {
      category: kname(o.category), slug: kname(o.slug),
      title: kstr(o.title, 200, '제목', t('제목은 200자까지입니다')), kind: o.kind as KItem['kind'], source: kstr(o.source, 300, '출처', t('출처는 300자까지입니다')), url: kurl(o.url), tags,
      ...(o.file ? { file: kfile(o.file) } : {}),
      summary: kstr(o.summary, 500, '요약', t('요약은 500자까지입니다')), added: kstr(o.added, 10, '날짜'), by: kstr(o.by, 40, '작성자'),
      points: kstr(o.points, 20_000, '핵심 내용'), uses: kstr(o.uses, 20_000, '쓴 곳'), memo: kstr(o.memo, 20_000, '메모'), error: null
    }
  }
  ipcMain.handle('knowledge:load', () => loadKnowledge(kdir()))
  ipcMain.handle('knowledge:save', (_e, item: unknown, prev: unknown, pdf?: unknown) => {
    if (pdf != null && !isTmpPdf(pdf)) throw new Error(t('잘못된 PDF 경로'))
    let p: { category: string; slug: string } | null = null
    if (prev !== null) { const o = (prev && typeof prev === 'object' ? prev : {}) as Record<string, unknown>; p = { category: kname(o.category), slug: kname(o.slug) } }
    return saveItem(kdir(), kitem(item), p, pdf ?? undefined)
  })
  ipcMain.handle('knowledge:remove', (_e, category: unknown, slug: unknown) => removeItem(kdir(), kname(category), kname(slug), f => shell.trashItem(f)))
  // 이미 있는 항목에 원문 PDF 붙이기(브라우저로 직접 받은 파일 등) — 진짜 PDF 인지 머리 글자로 확인
  const attachPdf = async (c: string, s: string, p: string, memoLine: (today: string) => string): Promise<KItem> => {
    checkPdfFile(p)
    const head = Buffer.alloc(5)
    const fh = await open(p, 'r')
    try { await fh.read(head, 0, 5, 0) } finally { await fh.close() }
    if (head.toString() !== '%PDF-') throw new Error(t('PDF 파일이 아닙니다'))
    const md = itemPath(kdir(), c, s)
    const item = parseItem(c, s, await readFile(md, 'utf8'))
    const today = localDay(new Date())
    // '원문 없음' 메모는 지우고 확보 메모를 남긴다
    item.memo = [item.memo.split('\n').filter(l => !/^- 원문 (PDF 없음|찾을 곳):/.test(l)).join('\n').trim(), memoLine(today)].filter(Boolean).join('\n')
    return saveItem(kdir(), item, { category: c, slug: s }, p)
  }
  ipcMain.handle('knowledge:attach', (_e, category: unknown, slug: unknown, path: unknown) =>
    attachPdf(kname(category), kname(slug), kstr(path, 4096, '파일'), today => `- 원문 확보: 직접 붙임 (${today})`))
  // 앱 안 창에서 원문을 열고, 받은 PDF 를 항목에 자동으로 붙인다
  ipcMain.handle('knowledge:browse', async (e, category: unknown, slug: unknown) => {
    const c = kname(category), s = kname(slug)
    const item = parseItem(c, s, await readFile(itemPath(kdir(), c, s), 'utf8'))
    if (!/^https?:\/\//i.test(item.url)) throw new Error('http(s) 주소가 있는 항목만 됩니다')
    const owner = BrowserWindow.fromWebContents(e.sender)
    openPaperWindow(`${c}/${s}`, item.title, item.url, async (path, host) => {
      await attachPdf(c, s, path, today => `- 원문 확보: 브라우저로 받음 · ${host} (${today})`)
      if (owner && !owner.isDestroyed()) { if (owner.isMinimized()) owner.restore(); owner.show(); owner.focus() }
    })
  })
  ipcMain.handle('knowledge:pickPdf', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('knowledge:openFile', async (_e, category: unknown, file: unknown) => {
    const p = join(dirname(itemPath(kdir(), kname(category), 'x')), kfile(file))
    const st = lstatSync(p)
    if (!st.isFile()) throw new Error(t('파일이 아닙니다'))
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
  })
  let draftAc: AbortController | null = null
  ipcMain.handle('knowledge:draft', async (_e, input: unknown) => {
    const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
    const url = kurl(o.url).trim(), pasted = kstr(o.text, 200_000, '글').trim()
    const pdfPath = o.pdfPath == null || o.pdfPath === '' ? '' : kstr(o.pdfPath, 4096, '파일')
    if (pdfPath) checkPdfFile(pdfPath)
    if (!url && !pasted && !pdfPath) throw new Error(t('주소나 글이 필요합니다'))
    draftAc?.abort()
    const ac = (draftAc = new AbortController())
    try {
      let page = ''
      let pdfBuf: Buffer | null = pdfPath ? await readFile(pdfPath) : null
      if (url && !pdfBuf) {
        try {
          const got = await fetchSource(url, ac.signal, net.fetch)
          if ('pdf' in got) pdfBuf = got.pdf; else page = got.page
        } catch {
          if (ac.signal.aborted) return { ok: false, error: { code: 'aborted', message: t('취소했습니다') } }
          // 붙여 넣은 글이 있으면 가져오기 실패는 오류가 아니다 — 그 글만으로 계속
          if (!pasted) return { ok: false, error: { code: 'cli-error', message: t('페이지를 가져오지 못했습니다 — 글을 붙여 넣어 주세요') } }
        }
      }
      let pdfTmp: string | undefined
      let pageCount = 0
      if (pdfBuf) {
        let pages: string[]
        try { pages = await pdfPages(new Uint8Array(pdfBuf)) } catch { return { ok: false, error: { code: 'cli-error', message: t('PDF 를 읽지 못했습니다 — 깨진 파일이 아닌지 확인해 주세요') } } }
        if (pages.join('').length < 200) return { ok: false, error: { code: 'cli-error', message: t('글자를 뽑을 수 없는 PDF 입니다(스캔본) — 초록을 붙여 넣어 주세요') } }
        if (ac.signal.aborted) return { ok: false, error: { code: 'aborted', message: t('취소했습니다') } }
        pdfTmp = join(tmpdir(), `inkline-knowledge-${randomBytes(8).toString('hex')}.pdf`)
        await writeFile(pdfTmp, pdfBuf)
        page = pagedText(pages)
        pageCount = pages.length
      }
      const cli = getSettings(db, defaults)['ai.cli']
      const by = cli ? { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' }[cli] : ''
      const r = await aiAsk<Draft>({ task: 'knowledge', system: KNOWLEDGE_SYSTEM, prompt: draftPrompt({ url, text: [pasted, page].filter(Boolean).join('\n\n'), pdf: !!pdfTmp, pageCount }, loadKnowledge(kdir()).categories), schema: KNOWLEDGE_SCHEMA, timeoutMs: 120_000, deadlineMs: 120_000, signal: ac.signal })
      if (!r.ok) { if (pdfTmp) void rm(pdfTmp, { force: true }); return r }
      const today = localDay(new Date())
      return { ok: true, item: draftToItem(r.value, url, today, by), ...(pdfTmp ? { pdf: pdfTmp } : {}) }
    } finally { if (draftAc === ac) draftAc = null }
  })
  ipcMain.handle('knowledge:cancelDraft', () => { draftAc?.abort() })
  return () => { draftAc?.abort() }
}
