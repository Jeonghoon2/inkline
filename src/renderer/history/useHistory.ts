import { useEffect, useState } from 'react'
import type { HistoryData } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

// 기록 데이터 — 처음 한 번 읽고, main 이 '바뀜'을 알리면 다시 읽는다
export function useHistory(): { data: HistoryData | null; error: string } {
  const [data, setData] = useState<HistoryData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const load = (): void => {
      window.api.history
        .load()
        .then(d => {
          if (!live) return
          setData(d)
          setError('')
        })
        .catch(e => live && setError(t('기록을 읽지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) })))
    }
    load()
    const off = window.api.history.onChanged(load)
    return () => {
      live = false
      off()
    }
  }, [])
  return { data, error }
}
