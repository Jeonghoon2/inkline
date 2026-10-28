// src/renderer/cert/Pairs.tsx — 2번 이상 헷갈린 쌍, 누르면 차이 3줄 먼저 → 공통점 → 구별 문제 2개
import { useEffect, useRef, useState } from 'react'
import type { CertFeedback, CertPairCard, CertPairRow } from '../../shared/cert.ts'
import { cleanErr } from './job.ts'
import { Feedback } from './Feedback.tsx'
import { PageView } from './PageView.tsx'
import { t } from '../../shared/i18n.ts'

const MARK = ['①', '②', '③', '④']
const typing = (e: KeyboardEvent): boolean => !!(e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')
export function Pairs({ bookId, onBack }: { bookId: number; onBack: () => void }) {
  const [rows, setRows] = useState<CertPairRow[] | null>(null)
  const [card, setCard] = useState<CertPairCard | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ans, setAns] = useState<Record<number, { pick: number; fb: CertFeedback | null }>>({})
  const [page, setPage] = useState<number | null>(null)
  const sending = useRef(false)
  useEffect(() => { window.api.cert.pairs(bookId).then(setRows, e => setErr(cleanErr(e))) }, [bookId, card])
  const open = async (r: CertPairRow): Promise<void> => {
    if (busy) return
    setBusy(true); setErr(''); setAns({})
    try {
      const c = await window.api.cert.pairCard(bookId, r.a, r.b)
      if ('error' in c) setErr(c.error); else setCard(c)
    } catch (e) { setErr(cleanErr(e)) } finally { setBusy(false) }
  }
  // 아직 안 푼 첫 문제가 지금 푸는 문제
  const cur = card?.questions.find(q => !ans[q.id]?.fb)
  const submit = async (qid: number, sure: boolean): Promise<void> => {
    const a = ans[qid]
    if (!a || a.fb || sending.current) return
    sending.current = true
    try { const fb = await window.api.cert.answer(qid, a.pick, sure, 'review'); setAns(s => ({ ...s, [qid]: { pick: a.pick, fb } })) } catch (e) { setErr(cleanErr(e)) } finally { sending.current = false }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (!cur || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat || typing(e) || page !== null) return
      if (e.key.length === 1 && '1234'.includes(e.key)) {
        if (Number(e.key) > cur.choices.length) return
        e.preventDefault(); setAns(s => ({ ...s, [cur.id]: { pick: Number(e.key) - 1, fb: null } }))
      } else if ((e.key === 'Enter' || e.key === ' ') && ans[cur.id] && !(e.target as Element).closest?.('button:not([role="radio"])')) { e.preventDefault(); void submit(cur.id, e.key === 'Enter') }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })
  if (!rows) return <div className="cert-pairs"><div className="cert-bar-top"><button type="button" className="btn" onClick={onBack}>{t('← 과정 홈')}</button></div>{err && <p className="err" role="alert">{err}</p>}</div>
  return (
    <div className="cert-pairs">
      <div className="cert-bar-top"><button type="button" className="btn" onClick={card ? () => setCard(null) : onBack}>{card ? t('← 쌍 목록') : t('← 과정 홈')}</button></div>
      {err && <p className="err" role="alert">{err}</p>}
      {!card && (
        <>
          {!rows.length && <p className="muted">{t('아직 헷갈린 쌍이 없어요. 문제에서 다른 항목의 개념을 고르면 여기에 쌓여요.')}</p>}
          {rows.map(r => (
            <button key={`${r.a}-${r.b}`} type="button" className="cert-pair" disabled={busy || r.count < 2} onClick={() => void open(r)}>
              <span>{r.aTitle} ↔ {r.bTitle}</span><span className="muted num">{t('{n}번', { n: r.count })}{r.count < 2 ? ` · ${t('2번부터 비교 카드')}` : ''}</span>
            </button>
          ))}
          {busy && <p className="muted">{t('비교 카드를 만들고 있어요…')}</p>}
        </>
      )}
      {card && (
        <div className="cert-card">
          <h2>{card.aTitle} ↔ {card.bTitle}</h2>
          <div className="cert-side"><div><b>{card.aTitle}</b><p>{card.aBody}</p></div><div><b>{card.bTitle}</b><p>{card.bBody}</p></div></div>
          <ol className="cert-diffs">{card.diffs.map((d, i) => <li key={i}>{d}</li>)}</ol>
          <p className="muted"><b>{t('공통점')}</b> {card.common}</p>
          {card.questions.map(q => {
            const a = ans[q.id]
            return (
              <div key={q.id} className="cert-pair-q">
                <p className="cert-stem">{q.stem}</p>
                <div className="cert-choices" role="radiogroup" aria-label={t('보기')}>
                  {q.choices.map((c, i) => <button key={i} type="button" role="radio" aria-checked={a?.pick === i} disabled={!!a?.fb} className={`cert-choice${a?.pick === i ? ' picked' : ''}`} onClick={() => setAns(s => ({ ...s, [q.id]: { pick: i, fb: null } }))}><span className="cert-mark">{MARK[i]}</span>{c}</button>)}
                </div>
                {a && !a.fb && <div className="cert-sure"><button type="button" className="btn btn-primary" onClick={() => void submit(q.id, true)}>{t('확실해요')}</button><button type="button" className="btn" onClick={() => void submit(q.id, false)}>{t('애매해요')}</button></div>}
                {a?.fb && <Feedback fb={a.fb} choices={q.choices} picked={a.pick} onPage={setPage} />}
              </div>
            )
          })}
        </div>
      )}
      {page !== null && <PageView bookId={bookId} page={page} onClose={() => setPage(null)} />}
    </div>
  )
}
