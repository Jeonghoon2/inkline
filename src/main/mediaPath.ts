import { join } from 'node:path'

// inkline-media://shorts/<이름>.mp4 → <root>/shorts/<이름>.mp4 (그 밖의 주소는 null)
export function mediaPath(root: string, url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'shorts') return null
    const name = decodeURIComponent(u.pathname.slice(1))
    return /^[^/\\]+\.mp4$/.test(name) && !name.includes('..') ? join(root, 'shorts', name) : null
  } catch { return null }
}

// Range 머리 해석 — null: 머리 없음/무시(전체), 'invalid': 범위 밖(416)
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (!m[1] && !m[2])) return null
  let start: number, end: number
  if (!m[1]) { start = Math.max(0, size - Number(m[2])); end = size - 1 }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1 }
  return start > end || start >= size ? 'invalid' : { start, end }
}
