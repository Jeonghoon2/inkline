import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessagesSquare } from 'lucide-react'
import type { Concept, HistoryData } from '../../shared/types.ts'
import { GRADES, stats, todayQueue, type DrillRow, type Grade } from '../../shared/drill.ts'
import { EmptyState } from '../shell/EmptyState.tsx'
import { FilterChips } from '../shell/FilterChips.tsx'
import { HistoryGate } from '../history/Gate.tsx'
import { locale, t } from '../../shared/i18n.ts'

export function DrillTab({ side, history, onSettings }: { side: HTMLElement | null; history: { data: HistoryData | null; error: string }; onSettings: () => void }) {
  return <HistoryGate history={history} onSettings={onSettings}>{data => <DrillView side={side} concepts={data.concepts} />}</HistoryGate>
}

const typing = (e: KeyboardEvent): boolean => !!(e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')
// 단추에 포커스가 있으면 Space · Enter 는 그 단추가 받는다(두 번 눌리지 않게) — 1 · 2 · 3 은 어디서든
const onButton = (e: KeyboardEvent): boolean => !!(e.target as Element).closest?.('button')

function DrillView({ side, concepts }: { side: HTMLElement | null; concepts: Record<string, Concept> }) {
  const [rows, setRows] = useState<DrillRow[] | null>(null)
  const [error, setError] = useState('')
  const [only, setOnly] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [mine, setMine] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false) // 같은 카드를 두 번 채점하지 않게(state 는 다음 렌더에야 바뀐다)
  const [tick, setTick] = useState(0)

  useEffect(() => { window.api.drill.state().then(setRows).catch(e => setError(t('진행표를 읽지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) }))) }, [])
  useEffect(() => { const f = (): void => setTick(n => n + 1); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f) }, []) // 자정을 넘겨 돌아오면 오늘을 다시 센다
  useEffect(() => { if (only && !concepts[only]) setOnly(null) }, [only, concepts])

  const names = useMemo(() => Object.keys(concepts).sort((a, b) => a.localeCompare(b, 'ko')), [concepts])
  const now = useMemo(() => new Date(), [rows, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => rows && stats(concepts, rows, now), [concepts, rows, now])
  const queue = useMemo(() => {
    if (!rows) return []
    return only ? todayQueue({ [only]: concepts[only] }, rows, now, Infinity) : todayQueue(concepts, rows, now)
  }, [concepts, rows, now, only])
  const card = queue[0]
  const cardKey = card ? `${card.concept}/${card.q}` : ''
  useEffect(() => { setShown(false); setMine('') }, [cardKey])

  const grade = async (g: Grade): Promise<void> => {
    if (!card || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try { setRows(await window.api.drill.grade(card.concept, card.q, g)); setError('') } catch (e) { setError(t('저장하지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) })) } finally { busyRef.current = false; setBusy(false) }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (!card || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat || typing(e)) return
      if (!shown && (e.key === ' ' || e.key === 'Enter') && !onButton(e)) { e.preventDefault(); setShown(true) }
      else if (shown && '123'.includes(e.key) && e.key.length === 1) { e.preventDefault(); void grade(GRADES[Number(e.key) - 1]) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })

  const learnedOf = (c: string): number => rows?.filter(r => r.concept === c && r.step >= 2 && r.q < concepts[c].qs.length).length ?? 0
  const sidebar = st && (
    <>
      <div className="side-label">{t('오늘')}</div>
      <div className="drill-stat"><span>{t('남은 카드')}</span><span className="num">{st.due + st.newAvailable}</span></div>
      <div className="drill-stat"><span>{t('복습')}</span><span className="num">{st.due}</span></div>
      <div className="drill-stat"><span>{t('새 카드')}</span><span className="num">{st.newAvailable}</span></div>
      <div className="drill-stat"><span>{t('전체 개념')}</span><span className="num">{names.length}</span></div>
      <div className="drill-stat"><span>{t('익힌 질문')}</span><span className="num">{st.learned} / {st.total}</span></div>
      <div className="side-label">{t('개념')}</div>
      {only && <button type="button" className="side-item" onClick={() => setOnly(null)}><span>{t('전체로')}</span></button>}
      {names.map(c => (
        <button key={c} type="button" className="side-item" aria-current={only === c} onClick={() => setOnly(c)}>
          <span className="side-title">{c}</span><span className="num">{learnedOf(c)}/{concepts[c].qs.length}</span>
        </button>
      ))}
    </>
  )

  if (names.length === 0)
    return (
      <EmptyState icon={MessagesSquare} title={t('연습할 개념이 없습니다')}>
        <p className="muted">{t('면접 질문은 ~/My-History/concepts.md 의 개념 사전에서 가져옵니다')}</p>
        <p className="muted">{t('작업 기록 스킬로 개념을 쌓으면 여기에 질문이 나타납니다')}</p>
      </EmptyState>
    )

  const next = rows?.filter(r => concepts[r.concept] && r.q < concepts[r.concept].qs.length && (!only || r.concept === only)).map(r => r.dueAt).sort()[0]
  const c = card && concepts[card.concept]
  const qa = card && c ? c.qs[card.q] : null
  return (
    <div className="drill">
      {side && sidebar && createPortal(sidebar, side)}
      {error && <p className="err" role="alert">{error}</p>}
      <FilterChips onClearAll={() => setOnly(null)} chips={only ? [{ label: t('개념: {name}', { name: only }), clear: () => setOnly(null) }] : []} />
      {rows && !card && (
        <div className="drill-done">
          <h2>{t('오늘 할 카드를 모두 마쳤습니다')}</h2>
          {next && <p className="muted">{t('다음 카드는 {date}에 나옵니다', { date: new Date(next).toLocaleDateString(locale(), { month: 'long', day: 'numeric' }) })}</p>}
        </div>
      )}
      {card && c && qa && (
        <div className="drill-card" key={cardKey}>
          <div className="drill-concept">{card.concept}</div>
          <h2 className="drill-q">{qa.q}</h2>
          <textarea className="drill-mine" rows={4} placeholder={t('내 답(적지 않아도 됩니다)')} aria-label={t('내 답')} value={mine} onChange={e => setMine(e.target.value)} />
          {!shown ? (
            <button type="button" className="btn btn-primary" onClick={() => setShown(true)}>{t('답 보기')}</button>
          ) : (
            <>
              <div className="drill-ans"><strong>{t('답')}</strong> {qa.a}</div>
              {c.why && <div className="drill-why"><strong>{t('원리')}</strong> {c.why}</div>}
              <div className="drill-grades">
                {GRADES.map((g, i) => <button key={g} type="button" className={`btn drill-g${i}`} disabled={busy} onClick={() => void grade(g)}>{t(g)} <kbd>{i + 1}</kbd></button>)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
