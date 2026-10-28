// 가져오기 · 항목 나누기 진행 — 탭을 옮겨도 남게 모듈에 둔다(이력서 최신화와 같은 방식)
import { useSyncExternalStore } from 'react'
import type { FlowState } from '../shell/StageFlow.tsx'

export interface Job { running: boolean; kind: 'import' | 'segment' | null; bookId: number | null; flow: FlowState; error: string; importError: string }
let job: Job = { running: false, kind: null, bookId: null, flow: {}, error: '', importError: '' }
const subs = new Set<() => void>()
const set = (p: Partial<Job>): void => { job = { ...job, ...p }; subs.forEach(f => f()) }
let hooked = false
const hook = (): void => {
  if (hooked) return
  hooked = true
  window.api.cert.onStage(s => set({ flow: { ...job.flow, [s.stage]: { state: s.state, note: s.note, progress: s.progress, at: s.state === 'on' ? (job.flow[s.stage]?.state === 'on' ? job.flow[s.stage]!.at : Date.now()) : job.flow[s.stage]?.at ?? Date.now() } } }))
}
// 공부 화면이 새 문제를 기다리기 전에 이전 항목의 작은 단계 기록을 지운다
export const clearFlow = (ids: string[]): void => { hook(); const f = { ...job.flow }; for (const id of ids) delete f[id]; set({ flow: f }) }
export const useJob = (): Job => { hook(); return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => job) }
// Electron 이 붙이는 "Error invoking remote method ..." 머리말을 뗀다
export const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const msg = cleanErr
export async function runImport(path: string): Promise<number | null> {
  hook()
  if (job.running) return null
  set({ running: true, kind: 'import', bookId: null, flow: {}, error: '', importError: '' })
  const r = await window.api.cert.import(path).catch(e => ({ ok: false as const, error: msg(e) }))
  set({ running: false, kind: null, bookId: r.ok ? r.bookId : null, importError: r.ok ? '' : r.error })
  return r.ok ? r.bookId : null
}
export async function runSegment(bookId: number): Promise<void> {
  hook()
  if (job.running) return
  set({ running: true, kind: 'segment', bookId, error: '', flow: { ...job.flow, segment: undefined } })
  const r = await window.api.cert.segment(bookId).catch(e => ({ ok: false as const, error: msg(e) }))
  set({ running: false, kind: null, error: r.ok ? '' : r.error })
}
