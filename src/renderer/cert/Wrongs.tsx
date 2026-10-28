// src/renderer/cert/Wrongs.tsx — 확실했는데 틀린 문제 먼저(서버가 그 순서로 준다)
import { useEffect, useRef, useState } from 'react'
import type { CertFeedback, CertWrong } from '../../shared/cert.ts'
import { cleanErr } from './job.ts'
import { Feedback } from './Feedback.tsx'
import { PageView } from './PageView.tsx'
import { t } from '../../shared/i18n.ts'

const MARK = ['①', '②', '③', '④']
const typing = (e: KeyboardEvent): boolean => !!(e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')
export function Wrongs({ bookId, onBack }: { bookId: number; onBack: () => void }) {
  const [rows, setRows] = useState<CertWrong[] | null>(null)
  const [retry, setRetry] = useState<{ id: number; pick: number | null; fb: CertFeedback | null } | null>(null)
  const [page, setPage] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const busy = useRef(false)
  const load = (): void => { window.api.cert.wrongs(bookId).then(r => { setRows(r); setErr('') }, e => setErr(cleanErr(e))) }
  useEffect(load, [bookId])
  const submit = async (sure: boolean): Promise<void> => {
    if (!retry || retry.pick === null || retry.fb || busy.current) return
    busy.current = true
    try { const fb = await window.api.cert.answer(retry.id, retry.pick, sure, 'review'); setRetry(s => s && { ...s, fb }) } catch (e) { setErr(cleanErr(e)) } finally { busy.current = false }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (!retry || retry.fb || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat || typing(e) || page !== null) return
      if (e.key.length === 1 && '1234'.includes(e.key)) {
        if (Number(e.key) > (rows?.find(r => r.questionId === retry.id)?.choices.length ?? 0)) return
        e.preventDefault(); setRetry({ ...retry, pick: Number(e.key) - 1 })
      } else if ((e.key === 'Enter' || e.key === ' ') && retry.pick !== null && !(e.target as Element).closest?.('button:not([role="radio"])')) { e.preventDefault(); void submit(e.key === 'Enter') }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })
  if (!rows) return <div className="cert-wrongs"><div className="cert-bar-top"><button type="button" className="btn" onClick={onBack}>{t('← 과정 홈')}</button></div>{err && <p className="err" role="alert">{err}</p>}</div>
  const open = rows.filter(r => !r.fixed), fixed = rows.filter(r => r.fixed)
  // 과목 › 항목 묶음, 확실했는데 틀린 문제가 든 묶음 먼저(안쪽은 서버 순서 그대로)
  const map = new Map<string, CertWrong[]>()
  for (const r of open) { const k = `${r.subject}\u0000${r.itemTitle}`; map.set(k, [...(map.get(k) ?? []), r]) }
  const groups = [...map].map(([key, rs]) => ({ key, rows: rs })).sort((a, b) => Number(b.rows.some(r => r.sure)) - Number(a.rows.some(r => r.sure)))
  const card = (r: CertWrong) => (
    <div key={r.questionId} className="cert-card">
      <div className="cert-meta">{r.subject} · {r.itemTitle}{r.sure ? ` · ${t('확실했는데 틀림')}` : ''}{r.fixed ? ` · ${t('다시 풀어 맞힘')}` : ''}</div>
      <p className="cert-stem">{r.stem}</p>
      {retry?.id === r.questionId ? (
        <>
          <div className="cert-choices" role="radiogroup" aria-label={t('보기')}>
            {r.choices.map((c, i) => <button key={i} type="button" role="radio" aria-checked={retry.pick === i} disabled={!!retry.fb} className={`cert-choice${retry.pick === i ? ' picked' : ''}`} onClick={() => setRetry({ ...retry, pick: i })}><span className="cert-mark">{MARK[i]}</span>{c}</button>)}
          </div>
          {!retry.fb ? (
            <div className="cert-sure">
              <button type="button" className="btn btn-primary" disabled={retry.pick === null} onClick={() => void submit(true)}>{t('확실해요')}</button>
              <button type="button" className="btn" disabled={retry.pick === null} onClick={() => void submit(false)}>{t('애매해요')}</button>
            </div>
          ) : (
            <><Feedback fb={retry.fb} choices={r.choices} picked={retry.pick!} onPage={setPage} /><button type="button" className="btn" onClick={() => { setRetry(null); load() }}>{t('닫기')}</button></>
          )}
        </>
      ) : (
        <>
          <p>{t('내 답 {mine} · 정답 {answer}', { mine: r.picked === null ? t('안 풂') : `${MARK[r.picked]} ${r.choices[r.picked]}`, answer: `${MARK[r.answer]} ${r.choices[r.answer]}` })}</p>
          <p><b>{t('정답 이유')}</b> {r.why}</p>
          {r.picked !== null && r.notes[r.picked] && <p><b>{t('고른 보기')}</b> {r.notes[r.picked]}</p>}
          <button type="button" className="btn" onClick={() => setRetry({ id: r.questionId, pick: null, fb: null })}>{t('다시 풀기')}</button>
        </>
      )}
    </div>
  )
  return (
    <div className="cert-wrongs">
      <div className="cert-bar-top"><button type="button" className="btn" onClick={onBack}>{t('← 과정 홈')}</button><span className="muted num">{t('남은 오답 {n}', { n: open.length })}</span></div>
      {err && <p className="err" role="alert">{err}</p>}
      {!rows.length && <p className="muted">{t('아직 틀린 문제가 없어요.')}</p>}
      {groups.map(g => <section key={g.key} className="cert-group"><h2 className="cert-group-h">{g.rows[0]!.subject} › {g.rows[0]!.itemTitle}</h2>{g.rows.map(card)}</section>)}
      {fixed.length > 0 && <details><summary>{t('다시 풀어 맞힌 문제 {n}', { n: fixed.length })}</summary>{fixed.map(card)}</details>}
      {page !== null && <PageView bookId={bookId} page={page} onClose={() => setPage(null)} />}
    </div>
  )
}
