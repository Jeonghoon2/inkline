import type { ReactNode } from 'react'
import { FolderX } from 'lucide-react'
import type { HistoryData } from '../../shared/types.ts'
import { EmptyState } from '../shell/EmptyState.tsx'
import { t } from '../../shared/i18n.ts'

// 기록 탭 공통 — 아직 못 읽었거나 · 오류 · 폴더 없음을 먼저 처리하고, 읽었으면 화면을 그린다
export function HistoryGate({ history, onSettings, children }: { onSettings: () => void; history: { data: HistoryData | null; error: string }; children: (data: HistoryData, error: string) => ReactNode }) {
  const { data, error } = history
  if (!data) return error ? <div className="history"><p className="err" role="alert">{error}</p></div> : null
  if (!data.exists)
    return (
      <EmptyState icon={FolderX} title={t('기록 폴더가 없습니다')}>
        <p className="muted">{data.root}</p>
        <p className="muted">{t('환경설정에서 바꿀 수 있습니다')}</p>
        <button type="button" className="btn" onClick={onSettings}>{t('환경설정 열기')}</button>
      </EmptyState>
    )
  return <>{children(data, error)}</>
}
