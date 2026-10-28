// 지식사전 초안 — 주소에서 글(또는 PDF)을 받아 오는 일. 못 받으면 던진다(붙여 넣은 글이 있는지는 부르는 쪽이 정한다)
import { lstatSync } from 'node:fs'
import { pageText } from './knowledgeAi.ts'
import { t } from '../shared/i18n.ts'

export const PDF_MAX = 50_000_000
const PAGE_MAX = 5_000_000 // 이보다 큰 페이지는 받지 않는다
const PAGE_READ = 2_000_000 // 받은 페이지에서 읽는 글자 수(바이트)

export type Get = (url: string, init: { signal: AbortSignal }) => Promise<Response>

// 파일이 진짜 PDF 후보인지(있고 · 파일이고 · .pdf · 50MB 이하) — 머리 글자 확인은 붙일 때 따로 한다
export function checkPdfFile(p: string): void {
  let st: ReturnType<typeof lstatSync> | null = null
  try { st = lstatSync(p) } catch { /* 없음 */ }
  if (!st || !st.isFile() || !/\.pdf$/i.test(p)) throw new Error(t('PDF 파일이 아닙니다'))
  if (st.size > PDF_MAX) throw new Error(t('PDF 가 너무 큽니다 (50MB까지)'))
}

export async function fetchSource(url: string, outer: AbortSignal, get: Get): Promise<{ pdf: Buffer } | { page: string }> {
  const fc = new AbortController()
  let tm = setTimeout(() => fc.abort(), 15_000)
  try {
    const res = await get(url, { signal: AbortSignal.any([fc.signal, outer]) })
    const ct = res.headers.get('content-type') ?? ''
    if (!res.ok) throw new Error('fetch')
    if (ct.includes('pdf') || /\.pdf$/i.test(new URL(url).pathname)) { // PDF 는 50MB 까지 받는다
      clearTimeout(tm); tm = setTimeout(() => fc.abort(), 90_000)
      if (Number(res.headers.get('content-length') ?? 0) > PDF_MAX) throw new Error('fetch')
      const chunks: Uint8Array[] = []
      let n = 0
      const rd = res.body?.getReader()
      while (rd) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > PDF_MAX) { await rd.cancel().catch(() => {}); throw new Error('fetch') } chunks.push(value) }
      return { pdf: Buffer.concat(chunks) }
    }
    if (Number(res.headers.get('content-length') ?? 0) > PAGE_MAX) throw new Error('fetch')
    const chunks: Uint8Array[] = []
    let n = 0
    const rd = res.body?.getReader()
    while (rd && n < PAGE_READ) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length }
    await rd?.cancel().catch(() => {})
    const buf = Buffer.concat(chunks).subarray(0, PAGE_READ)
    let dec: TextDecoder
    try { dec = new TextDecoder(/charset=["']?([\w-]+)/i.exec(ct)?.[1] ?? 'utf-8') } catch { dec = new TextDecoder() }
    return { page: pageText(dec.decode(buf)) }
  } finally { clearTimeout(tm) }
}
