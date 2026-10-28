import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, screen, type BrowserWindow, type Rectangle } from 'electron'

type Saved = Rectangle & { maximized?: boolean }
const file = (): string => join(app.getPath('userData'), 'window.json')

// 처음 켤 때는 화면 작업 영역의 90%(최대 1920×1200), 그 뒤로는 마지막 크기 · 위치. 저장한 자리가 지금 연결된 화면 밖이면 버린다
export function initialBounds(): Saved {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Saved
    const area = screen.getDisplayMatching(s).workArea
    const visible = s.x < area.x + area.width - 100 && s.x + s.width > area.x + 100 && s.y >= area.y - 10 && s.y < area.y + area.height - 100
    if ([s.x, s.y, s.width, s.height].every(Number.isFinite) && s.width >= 960 && s.height >= 600 && visible) return s
  } catch { /* 처음이거나 깨졌으면 기본 크기 */ }
  const a = screen.getPrimaryDisplay().workArea
  const width = Math.min(1920, Math.round(a.width * 0.9)), height = Math.min(1200, Math.round(a.height * 0.9))
  return { x: a.x + Math.round((a.width - width) / 2), y: a.y + Math.round((a.height - height) / 2), width, height }
}

export function rememberBounds(win: BrowserWindow): void {
  const save = (): void => {
    try { writeFileSync(file(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })) } catch { /* 못 저장해도 다음엔 기본 크기 */ }
  }
  win.on('close', save)
}
