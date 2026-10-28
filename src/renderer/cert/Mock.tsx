// src/renderer/cert/Mock.tsx
// 모의 시험 — 시작 → 시험(남은 시간 · 과목 탭 · 문항 번호 칸, 피드백 없음) → 결과(과목 점수 · 과락 선 · 평균 · 합격, 틀린 문제 해설)
import { useEffect, useRef, useState } from 'react'
import type { CertMockResult, CertPaper, CertRules } from '../../shared/cert.ts'
import { cleanErr, useJob } from './job.ts'
import { Preparing } from './ImportFlow.tsx'
import { keepMock, leftSecs, resumeMock, unansweredNote } from './mockKeep.ts'
import { ConfirmButton } from '../shell/ConfirmButton.tsx'
import { t } from '../../shared/i18n.ts'

const MARK = ['①', '②', '③', '④']
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
export function Mock({ bookId, onBack }: { bookId: number; onBack: () => void }) {
  // 진행 중이던 시험이 있으면 그대로 이어 간다(남은 시간은 마감 시각으로 다시 셈)
  const [was] = useState(() => resumeMock(bookId, Date.now()))
  const [paper, setPaper] = useState<CertPaper | null>(was?.paper ?? null)
  const [preparing, setPreparing] = useState(false)
  const [picks, setPicks] = useState<Record<number, number | null>>(was?.picks ?? {})
  const [flags, setFlags] = useState<Set<number>>(() => new Set(was?.flags))
  const [at, setAt] = useState(was?.at ?? 0)
  const [deadline, setDeadline] = useState(was?.deadline ?? 0)
  const [left, setLeft] = useState(was?.left ?? 0)
  const [res, setRes] = useState<CertMockResult | null>(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState<{ rules: CertRules; subjects: string[] } | null>(null)
  const job = useJob()
  // 규칙 · 과목은 한 번만 읽는다(시작 화면 안내 · 결과의 과락 선)
  useEffect(() => { let c = false; window.api.cert.home(bookId).then(h => { if (!c) setInfo({ rules: h.book.rules, subjects: h.subjects.map(x => x.subject) }) }).catch(e => { if (!c) setErr(cleanErr(e)) }); return () => { c = true } }, [bookId])
  const sent = useRef(false)
  const busy = useRef(false)
  const start = async (): Promise<void> => {
    if (busy.current) return
    busy.current = true; setPreparing(true); setErr('')
    const p = await window.api.cert.mockStart(bookId).catch(e => ({ error: cleanErr(e) }))
    busy.current = false; setPreparing(false)
    if ('error' in p) { setErr(p.error); return }
    setPaper(p); setPicks(Object.fromEntries(p.questions.map(q => [q.id, null]))); setDeadline(Date.now() + p.minutes * 60_000); setLeft(p.minutes * 60); setAt(0)
  }
  const submit = async (): Promise<void> => {
    if (!paper || sent.current) return
    sent.current = true
    try { setRes(await window.api.cert.mockSubmit(paper.mockId, picks)); keepMock(null) } catch (e) { setErr(cleanErr(e)); sent.current = false }
  }
  useEffect(() => {
    if (!paper || res) return
    const t = setInterval(() => setLeft(leftSecs(deadline, Date.now())), 1000)
    return () => clearInterval(t)
  }, [paper, res, deadline])
  useEffect(() => { if (paper && !res) keepMock({ bookId, paper, picks, flags: [...flags], at, deadline }) }, [bookId, paper, picks, flags, at, deadline, res])
  const quit = (): void => { keepMock(null); onBack() }
  // 시간이 다 되면 자동 제출 — 부수 효과라 setState 안이 아니라 효과에 둔다
  useEffect(() => { if (paper && !res && left === 0) void submit() }, [left]) // eslint-disable-line react-hooks/exhaustive-deps
  // 키보드: 1~4 보기 고르기, ←/→ 문항 이동 (입력칸 · 조합 중 · 보조키는 건너뜀)
  const key = useRef<(e: KeyboardEvent) => void>(() => {})
  key.current = e => {
    if (!paper || res || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    const cur = paper.questions[at]
    if (e.key === 'ArrowLeft') { setAt(a => Math.max(0, a - 1)); e.preventDefault() }
    else if (e.key === 'ArrowRight') { setAt(a => Math.min(paper.questions.length - 1, a + 1)); e.preventDefault() }
    else if (cur && /^[1-4]$/.test(e.key) && Number(e.key) <= cur.choices.length) { setPicks(p => ({ ...p, [cur.id]: Number(e.key) - 1 })); e.preventDefault() }
  }
  useEffect(() => { const f = (e: KeyboardEvent): void => key.current(e); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [])

  if (res) return (
    <div className="cert-mock">
      <div className="cert-bar-top"><button type="button" className="btn" onClick={onBack}>{t('← 과정 홈')}</button></div>
      <h2>{res.score.passed ? t('합격 기준을 넘었어요') : t('아직 합격 기준에 못 미쳐요')} · {t('평균 {n}점', { n: res.score.avg })}</h2>
      {paper && paper.short.length > 0 && <p className="muted">{t('문제가 모자라 {list} 적게 냈어요(교재 항목이 더 나뉘면 채워집니다)', { list: paper.short.map(sh => t('{subject} {n}문항', { subject: sh.subject, n: sh.missing })).join(' · ') })}</p>}
      <div className="cert-scores">
        {res.score.subjects.map(s => (
          <div key={s.subject} className={`cert-score${s.failed ? ' failed' : ''}`}>
            <span>{s.subject}</span>
            <span className="cert-bar"><i className="m" style={{ width: `${s.score}%` }} />{info && <i className="cut" aria-hidden="true" title={t('과락 {n}점', { n: info.rules.minSubject })} style={{ left: `${info.rules.minSubject}%` }} />}</span>
            <span className="num">{t('{score}점 ({right}/{total})', { score: s.score, right: s.right, total: s.total })}{s.failed ? ` · ${t('과락')}` : ''}</span>
          </div>
        ))}
      </div>
      {info && <p className="muted">{t('과락 선 {min}점 · 합격 평균 {avg}점', { min: info.rules.minSubject, avg: info.rules.minAvg })}</p>}
      <h3>{t('틀린 문제 해설')}</h3>
      {res.review.filter(r => r.picked !== r.answer).map(r => (
        <div key={r.questionId} className="cert-card">
          <div className="cert-meta">{r.subject}</div>
          <p className="cert-stem">{r.stem}</p>
          <p>{t('내 답 {mine} · 정답 {answer}', { mine: r.picked === null ? t('안 풂') : `${MARK[r.picked]} ${r.choices[r.picked]}`, answer: `${MARK[r.answer]} ${r.choices[r.answer]}` })}</p>
          <p><b>{t('정답 이유')}</b> {r.why}</p>
          {r.picked !== null && r.notes[r.picked] && <p><b>{t('고른 보기')}</b> {r.notes[r.picked]}</p>}
        </div>
      ))}
    </div>
  )
  if (!paper) return (
    <div className="cert-mock">
      <div className="cert-bar-top"><button type="button" className="btn" onClick={onBack}>{t('← 과정 홈')}</button></div>
      <h2>{t('모의 시험')}</h2>
      <p className="muted">{t('실제 시험처럼 과목마다 문제를 풀고, 끝나면 과목 점수 · 과락 · 합격 여부와 틀린 문제 해설을 보여 줍니다. 시험 중에는 정답을 보여 주지 않아요.')}</p>
      {info && <p>{info.subjects.map(x => t('{subject} {n}문항', { subject: x, n: info.rules.perSubject })).join(' · ')} · {t('시험 시간 {n}분', { n: info.rules.minutes })}</p>}
      {preparing && <Preparing label={job.flow.material?.state === 'on' ? job.flow.material.note ?? t('문제 준비 중') : t('문제 준비 중')} />}
      {err && <p className="err" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary" disabled={preparing} onClick={() => void start()}>{t('시작')}</button>
      {preparing && <button type="button" className="btn" onClick={() => void window.api.cert.cancel()}>{t('취소')}</button>}
    </div>
  )
  const q = paper.questions[at]!
  const subjects = [...new Set(paper.questions.map(x => x.subject))]
  const answered = Object.values(picks).filter(v => v !== null).length
  const note = unansweredNote(paper, picks)
  return (
    <div className="cert-mock">
      <div className="cert-bar-top">
        <span className="num" aria-live="off">{t('남은 시간 {time}', { time: mmss(left) })}</span>
        <span className="muted num">{t('{done} / {total} 풂', { done: answered, total: paper.questions.length })}</span>
        <span className="cert-actions">
          <ConfirmButton confirm={t('정말 그만두기 — 푼 답은 버려집니다')} onConfirm={quit}>{t('그만두기')}</ConfirmButton>
          <ConfirmButton className="btn btn-primary" ask={!!note} confirm={t('{note} — 그래도 제출', { note })} onConfirm={() => void submit()}>{t('제출')}</ConfirmButton>
        </span>
      </div>
      {paper.short.length > 0 && <p className="muted">{t('문제가 모자란 과목: {list}', { list: paper.short.map(s => t('{subject} {n}개', { subject: s.subject, n: s.missing })).join(' · ') })}</p>}
      <div className="cert-tabs" role="tablist">
        {subjects.map(s => <button key={s} type="button" role="tab" aria-selected={q.subject === s} className="chip" onClick={() => setAt(paper.questions.findIndex(x => x.subject === s))}>{s}</button>)}
      </div>
      <div className="cert-mock-body">
        <div className="cert-card">
          <div className="cert-meta">{t('{subject} · {n}번', { subject: q.subject, n: at + 1 })}</div>
          <p className="cert-stem">{q.stem}</p>
          <div className="cert-choices" role="radiogroup" aria-label={t('보기')}>
            {q.choices.map((c, i) => <button key={i} type="button" role="radio" aria-checked={picks[q.id] === i} className={`cert-choice${picks[q.id] === i ? ' picked' : ''}`} onClick={() => setPicks(p => ({ ...p, [q.id]: i }))}><span className="cert-mark">{MARK[i]}</span>{c}</button>)}
          </div>
          <div className="cert-sure">
            <button type="button" className="btn" disabled={at === 0} onClick={() => setAt(a => a - 1)}>{t('이전')}</button>
            <button type="button" className="btn" onClick={() => setFlags(f => { const n = new Set(f); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n })}>{flags.has(q.id) ? t('표시 지우기') : t('나중에 보기')}</button>
            <button type="button" className="btn" disabled={at === paper.questions.length - 1} onClick={() => setAt(a => a + 1)}>{t('다음')}</button>
          </div>
        </div>
        <nav className="cert-grid" aria-label={t('문항 번호')}>
          {paper.questions.map((x, i) => <button key={x.id} type="button" aria-current={i === at} className={`cert-num${picks[x.id] !== null ? ' done' : ''}${flags.has(x.id) ? ' flag' : ''}`} onClick={() => setAt(i)}>{i + 1}</button>)}
        </nav>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  )
}
