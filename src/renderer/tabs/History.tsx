import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Play } from 'lucide-react'
import type { Entry, HistoryData } from '../../shared/types.ts'
import { FilterChips } from '../shell/FilterChips.tsx'
import { HistoryGate } from '../history/Gate.tsx'
import { locale, t } from '../../shared/i18n.ts'
import { esc, entryKeys, hl, md2, tally, toDay, TYPE_ORDER, weekday } from '../history/render.ts'
import { matches, type Filter } from '../history/filter.ts'
import { Badge, typeColor } from '../history/Badge.tsx'
import { ConceptTip } from '../history/ConceptTip.tsx'
import { Overview } from '../history/Overview.tsx'
import { Detail } from '../history/Detail.tsx'
import { useReportCats } from '../history/reportCats.ts'

type View = 'card' | 'compact'
const VIEW_KEY = 'inkline-history-view'
const readView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'compact' ? 'compact' : 'card' } catch { return 'card' } // 저장소를 못 쓰면 카드로
}

let kept: Filter = { cat: null, type: null, tag: null, day: null, q: '' } // 탭을 오가도 거르기를 기억(앱이 켜져 있는 동안)

export function HistoryTab({ side, history, onSettings, onKnowledge }: { side: HTMLElement | null; history: { data: HistoryData | null; error: string }; onSettings: () => void; onKnowledge: (key: string) => void }) {
  return <HistoryGate history={history} onSettings={onSettings}>{(data, error) => <HistoryView side={side} data={data} error={error} onKnowledge={onKnowledge} />}</HistoryGate>
}

function HistoryView({ side, data, error, onKnowledge }: { side: HTMLElement | null; data: HistoryData; error: string; onKnowledge: (key: string) => void }) {
  const { entries, concepts } = data
  const [f, setF] = useState<Filter>(kept)
  useEffect(() => { kept = f }, [f])
  const [view, setViewState] = useState<View>(readView)
  const [openKey, setOpenKey] = useState<string | null>(null) // 열린 기록은 번호가 아니라 이름표로 — 데이터를 다시 읽어도 같은 기록
  const recKey = (e: Entry): string => `${e.date}|${e.category}|${e.title}`
  const found = openKey === null ? -1 : entries.findIndex(e => recKey(e) === openKey)
  const open = found < 0 ? null : found
  const setOpen = (i: number | null): void => setOpenKey(i === null ? null : recKey(entries[i]!))
  useEffect(() => { if (openKey !== null && found < 0) setOpenKey(null) }, [openKey, found])
  const q = useRef<HTMLInputElement>(null)
  const set = (p: Partial<Filter>): void => setF(s => ({ ...s, ...p }))
  const NONE: Filter = { cat: null, type: null, tag: null, day: null, q: '' }
  const clearAll = (): void => setF(NONE)
  const filtered = !!(f.cat || f.type || f.tag || f.day || f.q)
  const setView = (v: View): void => {
    setViewState(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* 저장 못 해도 이번엔 바뀐다 */ }
  }

  const keysOf = useMemo(() => entries.map(e => entryKeys(e, concepts)), [entries, concepts])
  const shorts = useMemo(() => new Set(data.shorts), [data.shorts])
  const cats = useMemo(() => [...new Set(entries.map(e => e.category))].sort(), [entries])
  const types = useMemo(
    () => [...new Set([...TYPE_ORDER, ...entries.map(e => e.type)].filter(t => t && entries.some(e => e.type === t)))],
    [entries]
  )
  const catCount = tally(entries, e => e.category)
  const report = useReportCats(cats)
  const pool = entries.filter((e, i) => matches(e, f, keysOf[i]!, true)) // 종류만 빼고 거른 것 — 종류 건수
  const typeCount = tally(pool, e => e.type)
  const shown = entries.flatMap((e, i) => (matches(e, f, keysOf[i]!) ? [i] : []))

  // '/' 로 검색 — 상세 창이 열렸거나 입력 칸에 있으면 무시
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== '/' || open !== null || (e.target as Element).closest?.('input, textarea, select')) return
      e.preventDefault()
      q.current?.focus()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  const sidebar = (
    <>
      <button type="button" className="side-item" aria-current={!f.cat} onClick={clearAll}>
        <span>{t('전체')}</span><span className="num">{entries.length}</span>
      </button>
      <div className="side-label">{t('프로젝트 · 체크한 것만 주간 보고에')}</div>
      {cats.map(c => (
        <div key={c} className="side-check">
          <input type="checkbox" aria-label={t('{name} 주간 보고에 넣기', { name: c })} checked={report.on.has(c)} disabled={!report.ready} onChange={() => report.toggle(c)} />
          <button type="button" className="side-item" aria-current={f.cat === c} onClick={() => set({ cat: c })}>
            <span>{c}</span><span className="num">{catCount[c]}</span>
          </button>
        </div>
      ))}
    </>
  )

  const onCard = (i: number) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => setOpen(i),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(i) } }
  })

  // 목록 — 달 → 날짜 칸(날짜 · 요일 · 건수) → 카드 또는 한 줄
  const days: { date: string; items: number[] }[] = []
  for (const i of shown) {
    const date = entries[i]!.date
    if (days.at(-1)?.date === date) days.at(-1)!.items.push(i)
    else days.push({ date, items: [i] })
  }
  const compact = view === 'compact'
  const list = days.map(({ date, items }, n) => {
    const month = date.slice(0, 7)
    const head = n === 0 || days[n - 1]!.date.slice(0, 7) !== month ? <div className="month num">{toDay(date).toLocaleDateString(locale(), { year: 'numeric', month: 'long' })}</div> : null
    const d = toDay(date)
    return (
      <div key={date}>
        {head}
        <div className={compact ? 'day is-compact' : 'day'}>
          <div className="day-date"><b className="mono">{md2(d)}</b><small>{t('{day} · {n}건', { day: weekday(d, 'long'), n: items.length })}</small></div>
          <div className="day-items">{items.map(i => (compact ? <Row key={i} e={entries[i]!} {...onCard(i)} /> : <Card key={i} e={entries[i]!} keys={keysOf[i]!} shorts={shorts} {...onCard(i)} />))}</div>
        </div>
      </div>
    )
  })

  return (
    <>
      {side && createPortal(sidebar, side)}
      <ConceptTip concepts={concepts}>
        <div className="history">
          {error && <p className="err" role="alert">{error}</p>}
          <Overview entries={entries} concepts={concepts} shorts={data.shorts.length} types={types} day={f.day} onDay={k => set({ day: f.day === k ? null : k })} />
          <div className="filters">
            <div className="ftypes" role="group" aria-label={t('종류')}>
              {[null, ...types].map(ty => (
                <button key={ty ?? ''} type="button" aria-pressed={f.type === ty} onClick={() => set({ type: ty })}>
                  {ty === null ? t('전체') : t(ty)} <span className="num">{ty === null ? pool.length : typeCount[ty] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="fright">
              <label className="sr" htmlFor="h-q">{t('검색')}</label>
              <input id="h-q" ref={q} type="search" placeholder={t('검색 — 제목·내용·개념  ( / )')} aria-keyshortcuts="/" value={f.q} onChange={e => set({ q: e.target.value })} />
              <div className="fview" role="group" aria-label={t('보기 방식')}>
                <button type="button" aria-pressed={view === 'card'} onClick={() => setView('card')}>{t('카드')}</button>
                <button type="button" aria-pressed={view === 'compact'} onClick={() => setView('compact')}>{t('압축')}</button>
              </div>
            </div>
          </div>
          <FilterChips onClearAll={() => set({ cat: null, day: null, tag: null })} chips={[
            ...(f.cat ? [{ label: t('프로젝트: {name}', { name: f.cat }), clear: () => set({ cat: null }) }] : []),
            ...(f.day ? [{ label: t('날짜: {date}', { date: md2(toDay(f.day)) }), clear: () => set({ day: null }) }] : []),
            ...(f.tag ? [{ label: t('분류: {name}', { name: f.tag }), clear: () => set({ tag: null }) }] : [])
          ]} />
          {shown.length ? list : !entries.length ? <div className="h-none">{t('아직 기록이 없습니다 — AI 도구(Claude Code 등)로 작업을 머지 · 배포하면 여기에 쌓입니다')}</div> : <div className="h-none">{t('맞는 기록이 없습니다')}{filtered && <> <button type="button" className="btn" onClick={clearAll}>{t('거르기 모두 풀기')}</button></>}</div>}
        </div>
      </ConceptTip>
      <Detail
        entries={entries} concepts={concepts} keysOf={keysOf} shown={shown} shorts={shorts} index={open}
        onOpen={setOpen} onClose={() => setOpen(null)} onKnowledge={onKnowledge}
        onPick={(kind, v) => { set(kind === 'cat' ? { cat: v } : { tag: v }); setOpen(null) }}
      />
    </>
  )
}

type CardProps = { role: 'button'; tabIndex: number; onClick: () => void; onKeyDown: (e: KeyboardEvent) => void }

function Row({ e, ...a }: { e: Entry } & CardProps) {
  return (
    <article className="hrow" {...a}>
      <span className="hrow-t">{e.title}</span><span className="cat">{e.category}</span><Badge type={e.type} />
    </article>
  )
}

function Card({ e, keys, shorts, ...a }: { e: Entry; keys: string[]; shorts: Set<string> } & CardProps) {
  const sh = keys.filter(k => shorts.has(k)).length
  return (
    <article className="item" style={{ '--t': typeColor(e.type) } as CSSProperties} {...a}>
      <div className="item-head">
        <Badge type={e.type} /><span className="cat">{e.category}</span>
        {keys.length > 0 && (
          <span className="item-meta">
            {t('개념 {n}', { n: keys.length })}
            {sh > 0 && <> · <Play size={11} fill="currentColor" aria-hidden /> {t('쇼츠 {n}', { n: sh })}</>}
          </span>
        )}
      </div>
      <h3>{e.title}</h3>
      {e.body && <p dangerouslySetInnerHTML={{ __html: hl(esc(e.body)) }} />}
    </article>
  )
}
