// src/renderer/cert/Study.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CertFeedback, CertNext } from '../../shared/cert.ts'
import { Feedback } from './Feedback.tsx'
import { M_IDS, MaterialFlow, Preparing } from './ImportFlow.tsx'
import { cleanErr, clearFlow, useJob } from './job.ts'
import { PageView } from './PageView.tsx'
import { locale, t } from '../../shared/i18n.ts'

const MARK = ['①', '②', '③', '④']
const typing = (e: KeyboardEvent): boolean => !!(e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')
export function Study({ bookId, subject, onBack }: { bookId: number; subject: string | null; onBack: () => void }) {
  const [next, setNext] = useState<CertNext | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [fb, setFb] = useState<CertFeedback | null>(null)
  const [page, setPage] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const busy = useRef(false)
  const loading = useRef(false)
  const job = useJob()
  const load = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    setNext(null); setPick(null); setFb(null); setErr(''); clearFlow(M_IDS)
    try { setNext(await window.api.cert.next(bookId, subject)) } catch (e) { setErr(cleanErr(e)) } finally { loading.current = false }
  }, [bookId, subject])
  useEffect(() => { void load() }, [load])
  const card = next && 'card' in next ? next.card : null
  const skip = async (itemId: number): Promise<void> => {
    try { await window.api.cert.seen(itemId) } catch (e) { setErr(cleanErr(e)); return }
    void load()
  }
  const submit = async (sure: boolean): Promise<void> => {
    if (!card || pick === null || fb || busy.current) return
    busy.current = true
    try { setFb(await window.api.cert.answer(card.questionId, pick, sure, card.kind === 'review' ? 'review' : 'learn')) } catch (e) { setErr(cleanErr(e)) } finally { busy.current = false }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat || typing(e) || page !== null) return
      const onBtn = !!(e.target as Element).closest?.('button:not([role="radio"])')
      if (card && !fb && '1234'.includes(e.key) && e.key.length === 1) { e.preventDefault(); setPick(Number(e.key) - 1) }
      else if (onBtn && (e.key === 'Enter' || e.key === ' ')) return
      else if (next && 'explainOnly' in next && e.key === 'Enter') { e.preventDefault(); void skip(next.explainOnly.itemId) }
      else if (card && !fb && pick !== null && e.key === 'Enter') { e.preventDefault(); void submit(true) }
      else if (card && !fb && pick !== null && e.key === ' ') { e.preventDefault(); void submit(false) }
      else if (fb && (e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); void load() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })
  return (
    <div className="cert-study">
      <div className="cert-bar-top"><button type="button" className="btn" onClick={onBack}>{t('← 과정 홈')}</button>{card && <span className="muted num">{t('복습 {due} · 새 항목 {fresh}', { due: card.left.due, fresh: card.left.fresh })}</span>}</div>
      {err && <p className="err" role="alert">{err}</p>}
      {!next && !err && (M_IDS.some(id => job.flow[id]) ? <MaterialFlow flow={job.flow} /> : <Preparing label={t('문제를 준비하고 있어요')} />)}
      {next && 'error' in next && <p className="err" role="alert">{next.error} <button type="button" className="btn" onClick={() => void load()}>{t('다시 시도')}</button></p>}
      {next && 'done' in next && <div className="cert-done"><h2>{t('오늘 할 공부를 모두 마쳤어요')}</h2>{next.nextDue && <p className="muted">{t('다음 복습은 {date}에 나옵니다', { date: new Date(next.nextDue).toLocaleDateString(locale(), { month: 'long', day: 'numeric' }) })}</p>}</div>}
      {next && 'explainOnly' in next && (
        <div className="cert-card">
          <div className="cert-meta">{next.explainOnly.subject} · {t('설명만 있는 항목')}</div>
          <h2>{next.explainOnly.title}</h2>
          {next.explainOnly.material?.explain && <p>{next.explainOnly.material.explain}</p>}
          <p className="cert-quote">{next.explainOnly.body}</p>
          <button type="button" className="btn btn-primary" onClick={() => void skip(next.explainOnly.itemId)}>{t('다음 →')}</button>
        </div>
      )}
      {card && (
        <div className="cert-card" key={card.questionId}>
          <div className="cert-meta">{card.item.subject}{card.item.freq > 0 ? ` · ${t('기출 {n}회', { n: card.item.freq })}` : ''}{card.kind === 'review' ? ` · ${t('복습')}` : ''}</div>
          <h2 className="cert-stem">{card.stem}</h2>
          <div className="cert-choices" role="radiogroup" aria-label={t('보기')}>
            {card.choices.map((c, i) => (
              <button key={i} type="button" role="radio" aria-checked={pick === i} disabled={!!fb}
                className={`cert-choice${pick === i ? ' picked' : ''}${fb && i === fb.answer ? ' right' : ''}${fb && pick === i && !fb.correct ? ' wrong' : ''}`}
                onClick={() => setPick(i)}><span className="cert-mark">{MARK[i]}</span>{c}{fb && i === fb.answer && <b className="cert-answer">{t('정답')}</b>}</button>
            ))}
          </div>
          {!fb ? (
            <div className="cert-sure">
              <button type="button" className="btn btn-primary" disabled={pick === null} onClick={() => void submit(true)}>{t('확실해요')} <kbd>⏎</kbd></button>
              <button type="button" className="btn" disabled={pick === null} onClick={() => void submit(false)}>{t('애매해요')} <kbd>Space</kbd></button>
            </div>
          ) : (
            <>
              <Feedback fb={fb} choices={card.choices} picked={pick!} onPage={setPage} />
              <button type="button" className="btn btn-primary" onClick={() => void load()}>{t('다음 →')} <kbd>⏎</kbd></button>
            </>
          )}
        </div>
      )}
      {page !== null && <PageView bookId={bookId} page={page} onClose={() => setPage(null)} />}
    </div>
  )
}
