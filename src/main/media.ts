import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { mediaPath, parseRange } from './mediaPath.ts'

export { mediaPath, parseRange }

// app ready 전에 부른다 — standard·secure 가 없으면 Chromium 이 <video> 의 Range 넘겨 보기를 network 오류로 처리한다
export const registerMediaScheme = (): void =>
  protocol.registerSchemesAsPrivileged([{ scheme: 'inkline-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])

// ready 뒤에 부른다 — net.fetch(file:) 은 Range 를 무시해 넘겨 보기가 안 되므로 직접 Range 를 처리한다
export const handleMedia = (getRoot: () => string): void =>
  protocol.handle('inkline-media', async req => {
    try {
      const p = mediaPath(getRoot(), req.url)
      if (!p) return new Response('', { status: 404 })
      const st = await stat(p)
      if (!st.isFile()) return new Response('', { status: 404 })
      const size = st.size
      const r = parseRange(req.headers.get('range'), size)
      const base = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' }
      if (r === 'invalid') return new Response('', { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } })
      const { start, end } = r ?? { start: 0, end: size - 1 }
      if (size === 0) return new Response('', { status: 200, headers: base })
      const body = Readable.toWeb(createReadStream(p, { start, end })) as unknown as BodyInit
      return new Response(body, {
        status: r ? 206 : 200,
        headers: { ...base, 'Content-Length': String(end - start + 1), ...(r && { 'Content-Range': `bytes ${start}-${end}/${size}` }) }
      })
    } catch { return new Response('', { status: 404 }) }
  })
