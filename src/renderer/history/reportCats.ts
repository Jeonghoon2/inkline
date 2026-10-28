import { useEffect, useState } from 'react'

// 주간 보고에 넣을 프로젝트 — 설정에는 뺀 것만 둔다(새 프로젝트는 저절로 체크)
export function useReportCats(all: string[]): { on: Set<string>; toggle: (c: string) => void; ready: boolean } {
  const [excluded, setExcluded] = useState<string[] | null>(null)
  useEffect(() => {
    window.api.settings.all().then(s => setExcluded(s['report.excluded'])).catch(() => setExcluded([]))
  }, [])
  const out = new Set(excluded ?? [])
  const on = new Set(all.filter(c => !out.has(c)))
  const toggle = (c: string): void => {
    const next = out.has(c) ? [...out].filter(x => x !== c) : [...out, c]
    setExcluded(next)
    window.api.settings.set('report.excluded', next).catch(e => console.error('주간 보고 프로젝트를 저장하지 못했습니다', e))
  }
  return { on, toggle, ready: excluded !== null }
}
