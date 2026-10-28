import { watch, type FSWatcher } from 'node:fs'

// 기록 폴더 감시 — 저장 한 번에도 이벤트가 여러 개 오므로 delayMs 동안 모아 한 번만 알린다
export function watchDir(root: string, onChange: () => void, delayMs = 300): () => void {
  let w: FSWatcher
  try {
    w = watch(root, { recursive: true })
  } catch {
    return () => {}
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  w.on('change', (_t, name) => {
    if (name && !/\.(md|mp4)$/.test(String(name))) return // 기록이 아닌 파일(.DS_Store 등)은 무시
    clearTimeout(timer)
    timer = setTimeout(onChange, delayMs)
  })
  w.on('error', () => {}) // 폴더가 지워지면 조용히 멈춘다 (설정에서 다시 고르면 새로 감시)
  return () => {
    clearTimeout(timer)
    w.close()
  }
}
