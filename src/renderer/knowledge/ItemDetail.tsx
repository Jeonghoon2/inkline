import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, FileText, Globe, Paperclip, Pencil, Trash2 } from 'lucide-react'
import type { KItem } from '../../shared/knowledge.ts'
import { md } from '../history/render.ts'
import { t } from '../../shared/i18n.ts'

const msg = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
const isHttp = (u: string): boolean => /^https?:\/\//i.test(u)

export function ItemDetail({ item, onBack, onEdit, onRemoved }: { item: KItem; onBack: () => void; onEdit: () => void; onRemoved: () => void }) {
  // 열리면 제목으로 포커스(키보드로 바로 읽고 Tab), Esc 는 목록으로 — 입력칸 · 확인 줄 안에서는 그대로
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => { head.current?.focus() }, [item.category, item.slug])
  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !(e.target as Element).closest?.('input, textarea, select, [role=group], dialog')) onBack() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onBack])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const remove = async (): Promise<void> => {
    setBusy(true)
    try { await window.api.knowledge.remove(item.category, item.slug); onRemoved() } catch (e) { setErr(msg(e)); setConfirm(false) } finally { setBusy(false) }
  }
  const [drag, setDrag] = useState(false)
  const [note, setNote] = useState('')
  // 원문 PDF 붙이기 — 고르거나 끌어다 놓는다. 저장되면 폴더 감시로 화면이 새로 읽는다
  const attach = async (path: string | null): Promise<void> => {
    if (!path) return
    setBusy(true); setErr(''); setNote('')
    try { await window.api.knowledge.attach(item.category, item.slug, path); setNote(t('원문 PDF 를 붙였습니다')) } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }
  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault(); setDrag(false)
    const f = [...e.dataTransfer.files].find(x => /\.pdf$/i.test(x.name))
    if (f) void attach(window.api.knowledge.pathForFile(f))
    else setErr(t('PDF 파일만 붙일 수 있습니다'))
  }
  const row = (k: string, v: string) => v && <div className="kd-row"><dt>{k}</dt><dd>{v}</dd></div>
  const sec = (k: string, text: string) => text && <section><h3>{k}</h3><div className="report kd-md" dangerouslySetInnerHTML={{ __html: md(text) }} /></section>
  return (
    <article className={drag ? 'kd dragging' : 'kd'} aria-label={item.title || item.slug}
      onDragOver={e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) { e.preventDefault(); setDrag(true) } }}
      onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div className="kd-bar">
        <button type="button" className="btn" onClick={onBack}><ArrowLeft size={14} aria-hidden /> {t('목록')}</button>
        {confirm ? (
          <span className="kd-confirm" role="group" aria-label={t('삭제 확인')}>
            <span>{t('휴지통으로 보낼까요?')}</span>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirm(false)}>{t('취소')}</button>
            <button type="button" className="btn danger" disabled={busy} onClick={() => void remove()}>{t('삭제')}</button>
          </span>
        ) : (
          <span className="kd-tools">
            <button type="button" className="btn" onClick={() => { setErr(''); setConfirm(true) }}><Trash2 size={14} aria-hidden /> {t('삭제')}</button>
            {item.file
              ? <button type="button" className="btn" onClick={() => { setErr(''); window.api.knowledge.openFile(item.category, item.file!).catch((e: unknown) => setErr(msg(e))) }}><FileText size={14} aria-hidden /> {t('원문 PDF 열기')}</button>
              : <>
                <button type="button" className="btn" disabled={busy} title={t('PDF 를 고르거나 이 화면에 끌어다 놓으세요')} onClick={() => { void window.api.knowledge.pickPdf().then(attach) }}><Paperclip size={14} aria-hidden /> {t('원문 PDF 붙이기')}</button>
                <button type="button" className="btn" disabled={!isHttp(item.url)} title={t('앱 안 창에서 원문을 열어 받은 PDF 를 자동으로 붙입니다')} onClick={() => { setErr(''); window.api.knowledge.browse(item.category, item.slug).catch((e: unknown) => setErr(msg(e))) }}><Globe size={14} aria-hidden /> {t('브라우저로 받기')}</button>
              </>}
            <button type="button" className="btn" onClick={onEdit}><Pencil size={14} aria-hidden /> {t('고치기')}</button>
          </span>
        )}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {note && <p className="muted" role="status">{note}</p>}
      {drag && <p className="kd-drop" aria-hidden>{t('여기에 놓으면 원문 PDF 로 붙입니다')}</p>}
      <h2 ref={head} tabIndex={-1}>{item.title || item.slug}</h2>
      {item.error && <p className="err">{t('형식 오류: {error} — [고치기] 로 채워 주세요', { error: t(item.error) })}</p>}
      <dl className="kd-meta">
        {row(t('종류'), t(item.kind))}
        {row(t('분류'), item.category)}
        {row(t('출처'), item.source)}
        {item.url && <div className="kd-row"><dt>{t('주소')}</dt><dd>{isHttp(item.url) ? <a href={item.url} target="_blank" rel="noreferrer">{item.url} <ExternalLink size={12} aria-hidden /></a> : item.url}</dd></div>}
        {row(t('태그'), item.tags.join(', '))}
        {row(t('원문'), item.file ?? '')}
        {row(t('요약'), item.summary)}
        {row(t('추가'), [item.added, item.by && t(item.by)].filter(Boolean).join(' · '))}
      </dl>
      {sec(t('핵심 내용'), item.points)}
      {sec(t('쓰인 곳'), item.uses)}
      {sec(t('메모'), item.memo)}
    </article>
  )
}
