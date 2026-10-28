import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { t } from '../../shared/i18n.ts'

const msg = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

// 주간 보고 사이드바 한 줄 — 마우스를 올리면 이름 바꾸기 · 삭제(휴지통)
export function ReportItem({ name, current, onPick, onRenamed, onRemoved }: { name: string; current: boolean; onPick: () => void; onRenamed: (to: string) => void; onRemoved: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const [draft, setDraft] = useState(name)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // 확인 줄 · 고치기에서 돌아오면 누른 단추로 포커스를 돌려준다(키보드로 쓸 때 처음부터 Tab 하지 않게)
  const back = useRef<'trash' | 'pencil' | null>(null)
  const trash = useRef<HTMLButtonElement>(null), pencil = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (mode === 'confirm') cancel.current?.focus() }, [mode])
  useEffect(() => { if (mode === 'view' && back.current) { (back.current === 'trash' ? trash : pencil).current?.focus(); back.current = null } }, [mode])

  const rename = async (): Promise<void> => {
    const to = draft.trim()
    if (!to || to === name) { setMode('view'); setErr(''); return }
    setBusy(true)
    try { await window.api.reports.rename(name, to); setMode('view'); setErr(''); onRenamed(to) } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }
  const remove = async (): Promise<void> => {
    setBusy(true)
    try { await window.api.reports.remove(name); onRemoved() } catch (e) { setErr(msg(e)); setMode('view') } finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); void rename() }
    if (e.key === 'Escape') { e.preventDefault(); setDraft(name); setErr(''); back.current = 'pencil'; setMode('view') }
  }

  if (mode === 'edit')
    return (
      <div className="report-item editing">
        <input className="field" aria-label={t('보고 이름')} autoFocus value={draft} disabled={busy} maxLength={80} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => void rename()} />
        {err && <p className="err small" role="alert">{err}</p>}
      </div>
    )
  if (mode === 'confirm')
    return (
      <div className="report-item confirm" role="group" aria-label={t('{name} 삭제', { name })}>
        <span className="side-title">{t("'{name}' 을 휴지통으로 보낼까요?", { name })}</span>
        <div className="report-item-actions">
          <button ref={cancel} type="button" className="btn" disabled={busy} onClick={() => { back.current = 'trash'; setMode('view') }} onKeyDown={e => { if (e.key === 'Escape') { back.current = 'trash'; setMode('view') } }}>{t('취소')}</button>
          <button type="button" className="btn danger" disabled={busy} onClick={() => void remove()}>{t('삭제')}</button>
        </div>
      </div>
    )
  return (
    <div className="report-item">
      <button type="button" className="side-item" aria-current={current} onClick={onPick}><span className="side-title">{name}</span></button>
      <div className="report-item-tools">
        <button ref={pencil} type="button" className="icon-btn" aria-label={t('{name} 이름 바꾸기', { name })} title={t('이름 바꾸기')} onClick={() => { setDraft(name); setErr(''); setMode('edit') }}><Pencil size={14} aria-hidden /></button>
        <button ref={trash} type="button" className="icon-btn" aria-label={t('{name} 삭제', { name })} title={t('삭제(휴지통)')} onClick={() => { setErr(''); setMode('confirm') }}><Trash2 size={14} aria-hidden /></button>
      </div>
      {err && <p className="err small" role="alert">{err}</p>}
    </div>
  )
}
