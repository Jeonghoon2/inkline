import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, FileText, Plus } from 'lucide-react'
import type { HistoryData } from '../../shared/types.ts'
import { EmptyState } from '../shell/EmptyState.tsx'
import { t } from '../../shared/i18n.ts'
import { HistoryGate } from '../history/Gate.tsx'
import { md } from '../history/render.ts'
import { ReportMaker } from '../history/ReportMaker.tsx'
import { ReportItem } from '../history/ReportItem.tsx'

export function ReportsTab({ side, history, onSettings }: { side: HTMLElement | null; history: { data: HistoryData | null; error: string }; onSettings: () => void }) {
  return <HistoryGate history={history} onSettings={onSettings}>{(data, error) => <ReportsView side={side} reports={data.reports} entries={data.entries} error={error} onSettings={onSettings} />}</HistoryGate>
}

function ReportsView({ side, reports, entries, error, onSettings }: { side: HTMLElement | null; reports: HistoryData['reports']; entries: HistoryData['entries']; error: string; onSettings: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const [making, setMaking] = useState(false)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const maker = making && <div className="history"><ReportMaker entries={entries} reports={reports.map(r => r.name)} onClose={() => setMaking(false)} onSaved={n => { setPick(n); setMaking(false) }} onSettings={onSettings} /></div>
  if (!reports.length)
    return maker || (
      <EmptyState icon={FileText} title={t('주간 보고가 없습니다')}>
        <button type="button" className="btn btn-primary" onClick={() => setMaking(true)}><Plus size={14} aria-hidden /> {t('주간 보고 만들기')}</button>
      </EmptyState>
    )
  const cur = reports.find(r => r.name === pick) ?? reports[0]! // 없어졌거나 안 골랐으면 최신

  const copy = async (): Promise<void> => {
    let m = t('복사했습니다')
    try { await navigator.clipboard.writeText(cur.text) } catch { m = t('복사하지 못했습니다') }
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(''), 1500)
  }

  const sidebar = reports.map(r => (
    <ReportItem key={r.name} name={r.name} current={r.name === cur.name} onPick={() => { setPick(r.name); setMsg('') }}
      onRenamed={to => setPick(to)} onRemoved={() => { if (r.name === cur.name) setPick(null) }} />
  ))

  return (
    <>
      {side && createPortal(sidebar, side)}
      {maker || <div className="history">
        {error && <p className="err" role="alert">{error}</p>}
        <div className="report-bar">
          <span className="muted" role="status">{msg}</span>
          <button type="button" className="btn" onClick={copy}><Copy size={14} aria-hidden /> {t('복사')}</button>
          <button type="button" className="btn btn-primary" onClick={() => setMaking(true)}><Plus size={14} aria-hidden /> {t('주간 보고 만들기')}</button>
        </div>
        <div className="report" dangerouslySetInnerHTML={{ __html: md(cur.text) }} />
      </div>}
    </>
  )
}
