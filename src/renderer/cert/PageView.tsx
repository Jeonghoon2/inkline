// src/renderer/cert/PageView.tsx — 교재 원문 한 쪽
import { useEffect, useRef, useState } from 'react'
import { cleanErr } from './job.ts'
import { t } from '../../shared/i18n.ts'
export function PageView({ bookId, page, onClose }: { bookId: number; page: number; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const closeBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let cancelled = false
    setText(null); setErr('')
    window.api.cert.page(bookId, page).then(t => { if (!cancelled) setText(t) }).catch(e => { if (!cancelled) setErr(cleanErr(e)) })
    return () => { cancelled = true }
  }, [bookId, page])
  useEffect(() => { closeBtn.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="cert-page" role="dialog" aria-label={t('교재 p.{page}', { page })}>
      <div className="cert-page-head"><b>{t('교재 p.{page}', { page })}</b><button ref={closeBtn} type="button" className="btn" onClick={onClose}>{t('닫기')}</button></div>
      {err ? <p className="err cert-page-body" role="alert">{err}</p> : <pre className="cert-page-body">{text ?? t('불러오는 중…')}</pre>}
    </div>
  )
}
