import { useState } from 'react'
import { cleanErr } from './job.ts'
import { ConfirmButton } from '../shell/ConfirmButton.tsx'
import { dropMock } from './mockKeep.ts'
import { CERT_KINDS, type CertBook, type CertKind } from '../../shared/cert.ts'
import { t } from '../../shared/i18n.ts'

export function ConfirmCard({ book, onDone, onRemoved }: { book: CertBook; onDone: (b: CertBook) => void; onRemoved: () => void }) {
  const [name, setName] = useState(book.name)
  const [kind, setKind] = useState<CertKind>(book.kind)
  const [subjects, setSubjects] = useState(book.subjects.join('\n'))
  const [rules, setRules] = useState(book.rules)
  const [exam, setExam] = useState(book.examDate ?? '')
  const [err, setErr] = useState('')
  const num = (k: keyof typeof rules) => (e: React.ChangeEvent<HTMLInputElement>) => setRules(r => ({ ...r, [k]: Number(e.target.value) }))
  const save = async (): Promise<void> => {
    try { onDone(await window.api.cert.confirm(book.id, { name, kind, subjects: subjects.split('\n').map(s => s.trim()).filter(Boolean), rules, examDate: exam || null })) }
    catch (e) { setErr(cleanErr(e)) }
  }
  return (
    <form className="cert-confirm" onSubmit={e => { e.preventDefault(); void save() }}>
      <h2>{t('이 교재가 맞나요?')}</h2>
      <p className="muted">{t('AI 가 앞쪽 글을 보고 제안했어요. 틀린 곳을 고치면 그 기준으로 공부와 모의 시험을 만듭니다.')}</p>
      {book.checkNote && <div className="cert-check-note">{book.checkNote.split('\n').map((l, i) => <p key={i} className={l.startsWith('교재 글에서') ? 'warn' : 'muted'}>{l}</p>)}</div>}{/* i18n-ok — 본체가 쓴 점검 문구의 머리말로 경고를 가린다 */}
      <label>{t('자격증 이름')}<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required /></label>
      <fieldset className="cert-kinds"><legend>{t('종류')}</legend>
        {CERT_KINDS.map(k => <button key={k} type="button" className={`chip${k === kind ? ' on' : ''}`} aria-pressed={k === kind} onClick={() => setKind(k)}>{t(k)}</button>)}
      </fieldset>
      <label>{t('과목(한 줄에 하나, 교재 순서)')}<textarea rows={5} value={subjects} onChange={e => setSubjects(e.target.value)} /></label>
      <fieldset className="cert-rules"><legend>{t('합격 기준')}</legend>
        <label>{t('과목당 문항')}<input type="number" min={1} max={200} value={rules.perSubject} onChange={num('perSubject')} /></label>
        <label>{t('과목 최저 점수')}<input type="number" min={0} max={100} value={rules.minSubject} onChange={num('minSubject')} /></label>
        <label>{t('평균 점수')}<input type="number" min={0} max={100} value={rules.minAvg} onChange={num('minAvg')} /></label>
        <label>{t('시험 시간(분)')}<input type="number" min={1} max={600} value={rules.minutes} onChange={num('minutes')} /></label>
      </fieldset>
      <label>{t('시험일(선택 — 넣으면 복습 간격을 시험에 맞춥니다)')}<input type="date" value={exam} onChange={e => setExam(e.target.value)} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="cert-actions">
        <button type="submit" className="btn btn-primary">{t('확인하고 항목 나누기')}</button>
        <ConfirmButton confirm={t('정말 빼기 — 넣은 교재가 지워집니다')} onConfirm={() => { window.api.cert.remove(book.id).then(() => { dropMock(book.id); onRemoved() }, e => setErr(cleanErr(e))) }}>{t('이 교재 빼기')}</ConfirmButton>
      </div>
    </form>
  )
}
