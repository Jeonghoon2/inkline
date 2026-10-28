// src/renderer/cert/CourseHome.tsx
import { useEffect, useState } from 'react'
import type { CertBook, CertHome } from '../../shared/cert.ts'
import { cleanErr, useJob } from './job.ts'
import { PageView } from './PageView.tsx'
import { ConfirmButton } from '../shell/ConfirmButton.tsx'
import { dropMock } from './mockKeep.ts'
import { t } from '../../shared/i18n.ts'

const pct = (n: number, d: number): string => `${d ? Math.round((n / d) * 100) : 0}%`
export function CourseHome({ book, busy, onStudy, onMock, onWrongs, onPairs, onRetry, onRemoved }: { book: CertBook; busy: boolean; onStudy: (s: string | null) => void; onMock: () => void; onWrongs: () => void; onPairs: () => void; onRetry: () => void; onRemoved: () => void }) {
  const [h, setH] = useState<CertHome | null>(null)
  const [page, setPage] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const job = useJob()
  useEffect(() => {
    let cancelled = false
    window.api.cert.home(book.id).then(r => { if (!cancelled) setH(r) }).catch(e => { if (!cancelled) setErr(cleanErr(e)) })
    return () => { cancelled = true }
  }, [book.id, busy])
  if (err) return <p className="err" role="alert">{err}</p>
  if (!h) return null
  const remove = (): void => { window.api.cert.remove(book.id).then(() => { dropMock(book.id); onRemoved() }, e => setErr(cleanErr(e))) }
  return (
    <div className="cert-home">
      <div className="cert-home-head">
        <h2>{book.name} · {t(book.kind)}</h2>
        {h.daysLeft !== null && h.daysLeft >= 0 && <span className="cert-dday">{t('시험까지 {n}일', { n: h.daysLeft })}</span>}
      </div>
      {book.status === 'importing' && !busy && (
        <section className="cert-unsplit">
          <p>{t('항목 나누기가 아직 끝나지 않았어요 — 나눈 데까지만 공부에 나와요.')}</p>
          <button type="button" className="btn btn-primary" disabled={job.running} onClick={onRetry}>{t('이어서 나누기')}</button>
        </section>
      )}
      <div className="cert-today">
        <span>{t('오늘 복습')} <b className="num">{h.due}</b> · {t('새 항목')} <b className="num">{h.fresh}</b></span>
        <button type="button" className="btn btn-primary" disabled={!h.map.length} onClick={() => onStudy(null)}>{t('공부 시작')}</button>
      </div>
      <section aria-label={t('과목 숙달도')}>
        <div className="side-label">{t('과목 숙달도')} <span className="muted">{t('익힘 · 배우는 중 · 못 봄')}</span></div>
        {h.subjects.map(s => (
          <button key={s.subject} type="button" className="cert-subj" disabled={!s.total} onClick={() => onStudy(s.subject)}>
            <span className="cert-subj-name">{s.subject}</span>
            <span className="cert-bar" aria-hidden>
              <i className="m" style={{ width: pct(s.mastered, s.total) }} /><i className="l" style={{ width: pct(s.learning, s.total) }} />
            </span>
            <span className="cert-subj-n">{pct(s.mastered, s.total)} · {t('{n}항목', { n: s.total })}{s.recent !== null ? ` · ${t('최근 정답률 {n}%', { n: s.recent })}` : ''}</span>
          </button>
        ))}
      </section>
      <section aria-label={t('항목 지도')}>
        <div className="side-label">{t('항목 지도')}</div>
        <div className="cert-map">{h.map.map(i => <span key={i.id} className={`cert-cell ${i.mastery}`} title={`${i.subject} · ${i.title}`} />)}</div>
      </section>
      <div className="cert-actions">
        <button type="button" className="btn" disabled={!h.map.length || busy} onClick={onMock}>{t('모의 시험')}</button>
        <button type="button" className="btn" onClick={onWrongs}>{t('오답 노트')} {h.wrongs}</button>
        <button type="button" className="btn" onClick={onPairs}>{t('헷갈리는 쌍')} {h.pairs}</button>
      </div>
      {h.unsplit.length > 0 && (
        <section className="cert-unsplit">
          <p>{t('못 나눈 쪽 {n}개 — 이 쪽들의 항목은 공부에 나오지 않을 수 있어요.', { n: h.unsplit.length })}</p>
          <div>{h.unsplit.slice(0, 40).map(p => <button key={p} type="button" className="chip" onClick={() => setPage(p)}>p.{p}</button>)}</div>
          <button type="button" className="btn" disabled={busy} onClick={onRetry}>{t('다시 나누기')}</button>
        </section>
      )}
      <ConfirmButton className="btn cert-remove" confirm={t('정말 지우기 — 과정과 공부 기록이 모두 사라집니다')} onConfirm={remove}>{t('과정 지우기')}</ConfirmButton>
      {page !== null && <PageView bookId={book.id} page={page} onClose={() => setPage(null)} />}
    </div>
  )
}
