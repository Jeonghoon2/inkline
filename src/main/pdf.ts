import { orderPage, type Piece } from './cert/layout.ts'
// PDF 에서 쪽별 글 뽑기. electron 을 모른다. pdfjs 는 ESM 이라 동적 import 로 런타임에 읽는다.
export async function pdfPages(data: Uint8Array, maxPages = 80): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 } as Parameters<typeof pdfjs.getDocument>[0])
  try {
    const doc = await task.promise
    const out: string[] = []
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      out.push(tc.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join(' ').replace(/\s+/g, ' ').trim())
      page.cleanup()
    }
    return out
  } finally { await task.destroy() }
}

// 자격증 교재용 — 쪽마다 단을 나눠 읽는 순서로 잇는다(줄바꿈 유지). total: 자르기 전 실제 쪽 수
export async function pdfPagesOrdered(data: Uint8Array, maxPages = 600): Promise<{ pages: string[]; total: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 } as Parameters<typeof pdfjs.getDocument>[0])
  try {
    const doc = await task.promise
    const out: string[] = []
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      const pieces: Piece[] = tc.items.flatMap(it => ('str' in it && it.str.trim() ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, w: it.width }] : []))
      out.push(orderPage(pieces, page.getViewport({ scale: 1 }).width))
      page.cleanup()
    }
    return { pages: out, total: doc.numPages }
  } finally { await task.destroy() }
}

export function pagedText(pages: string[], max = 40_000): string {
  const out: string[] = []
  let n = 0
  for (let i = 0; i < pages.length; i++) {
    const t = `[p.${i + 1}] ${pages[i]}`
    if (n + t.length > max) {
      if (!out.length) return t.slice(0, max) + `\n\n…(이하 생략: p.${i + 1}부터)` // 첫 쪽부터 넘치면 그 쪽만 자른다
      return out.join('\n\n') + `\n\n…(이하 생략: p.${i + 1}부터)`
    }
    out.push(t); n += t.length + 2
  }
  return out.join('\n\n')
}
