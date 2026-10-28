import { useEffect, useRef } from 'react'
import type { editor as E } from 'monaco-editor'
import type { Stage } from '../../shared/types.ts'
import { nudgeDue } from '../../shared/nudgeTiming.ts'
import { hideBand, showBand } from './nudgeBand.ts'

type Ed = E.IStandaloneCodeEditor
type M = typeof import('monaco-editor')

export function useNudge(o: { editor: Ed | null; monaco: M | null; attemptId: number; stage: Stage; enabled: boolean; quietMs: number; idleMs: number; openedAt: number; lastActivity: number; code: string; blocked?: boolean }): void {
  const { editor, monaco, attemptId, enabled, quietMs, idleMs, openedAt, lastActivity } = o
  const live = useRef({ code: o.code, stage: o.stage, blocked: !!o.blocked })
  live.current = { code: o.code, stage: o.stage, blocked: !!o.blocked }

  // 활동(lastActivity)이 바뀔 때마다 이 효과가 정리되어 보이던 넛지가 지워지고 다음 멈춤을 다시 기다린다
  useEffect(() => {
    if (!editor || !monaco || !enabled) return
    let dead = false
    let visibleAt = Date.now() // 가려졌다 돌아오면 그때부터 다시 센다
    const onVis = (): void => { if (!document.hidden) visibleAt = Date.now() }
    document.addEventListener('visibilitychange', onVis)
    const t = setInterval(() => {
      if (live.current.blocked) return
      const now = Date.now()
      if (!nudgeDue({ now, openedAt, lastActivity: Math.max(lastActivity, visibleAt), quietMs, idleMs, hidden: document.hidden })) return
      clearInterval(t)
      const { code, stage } = live.current
      window.api.tutor.nudge(attemptId, code, stage).then(text => {
        if (dead || !text) return
        if (editor.getValue().trim() === '') editor.updateOptions({ placeholder: text })
        else showBand(editor, monaco, text)
      }).catch(e => { if (!dead) console.error('넛지를 받지 못했습니다', e) })
    }, 1000)
    return () => {
      dead = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      try { editor.updateOptions({ placeholder: '' }); hideBand(editor) } catch { /* 편집기가 먼저 닫힘 */ }
    }
  }, [editor, monaco, attemptId, enabled, quietMs, idleMs, openedAt, lastActivity])
}
