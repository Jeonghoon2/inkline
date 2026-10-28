import type { Concept, Entry } from '../../shared/types.ts'
import { locale, t } from '../../shared/i18n.ts'
import { dkey, md2, tally, toDay, weekday } from './render.ts'
import { Badge } from './Badge.tsx'

const WEEKS = 8
const shade = (n: number): string => `var(--heat${n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4})`

// 개요 — 이번 주(월요일부터 오늘까지), 최근 8주 활동 지도(하루 기록 수), 숫자 4칸
export function Overview({ entries, concepts, shorts, types, day, onDay }: {
  entries: Entry[]; concepts: Record<string, Concept>; shorts: number; types: string[]; day: string | null; onDay: (k: string) => void
}) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const mon = new Date(today)
  mon.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const week = entries.filter(e => toDay(e.date) >= mon)
  const byType = tally(week, e => e.type), byCat = tally(week, e => e.category), perDay = tally(entries, e => e.date)
  const [peakDay, peak] = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]

  const cols = []
  for (let w = WEEKS - 1; w >= 0; w--) {
    const start = new Date(mon)
    start.setDate(mon.getDate() - w * 7)
    const cells = []
    for (let d = 0; d < 7; d++) {
      const day1 = new Date(start)
      day1.setDate(start.getDate() + d)
      const k = dkey(day1), n = perDay[k] ?? 0, future = day1 > today
      cells.push(
        n && !future ? ( // 기록 있는 날은 단추 — 누르면 그날 기록만 본다(다시 누르면 풀림)
          <button key={k} type="button" className="heat" aria-pressed={day === k} title={t('{date} · {n}건 — 눌러서 이 날만 보기', { date: md2(day1), n })}
            aria-label={t('{date} {n}건', { date: md2(day1), n })} style={{ background: shade(n) }} onClick={() => onDay(k)} />
        ) : (
          <span key={k} className={future ? 'heat future' : 'heat'} title={`${md2(day1)} · ${future ? t('아직') : t('{n}건', { n })}`} style={future ? undefined : { background: shade(n) }} />
        )
      )
    }
    const prev = new Date(start)
    prev.setDate(start.getDate() - 7)
    const label = w === WEEKS - 1 || prev.getMonth() !== start.getMonth() ? start.toLocaleDateString(locale(), { month: 'short' }) : '' // 달이 바뀌는 주에만
    cols.push(<div className="heat-col" key={dkey(start)}>{cells}<span className="heat-label">{label}</span></div>)
  }

  const stat = (n: number, l: string) => (
    <div className="ov-card ov-stat" key={l}><b className="mono">{n}</b><span>{l}</span></div>
  )
  const shownTypes = types.filter(t => byType[t])
  return (
    <div className="overview">
      <div className="ov-card ov-week">
        <div className="ov-h"><span>{t('이번 주')}</span><span className="num">{md2(mon)} – {md2(today)}</span></div>
        <div className="ov-big">
          <b className="mono">{week.length}</b>
          <span>{t('건')}{Object.entries(byCat).map(([c, n]) => ` · ${c} ${n}`).join('')}</span>
        </div>
        <div className="ov-chips">
          {shownTypes.length ? shownTypes.map(ty => <Badge key={ty} type={ty} count={byType[ty]} />) : <span className="ov-none">{t('아직 기록이 없어요')}</span>}
        </div>
      </div>
      <div className="ov-card ov-map">
        <div className="ov-h"><span>{t('활동 지도')}</span><span className="num">{t('최근 {n}주 · 하루 기록 수', { n: WEEKS })}</span></div>
        <div className="heat-grid" role="group" aria-label={t('최근 {n}주 하루 기록 수 — 칸을 누르면 그날만 본다', { n: WEEKS })}>
          <div className="heat-col heat-days" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(i => <span key={i}>{i % 2 ? '' : weekday(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i), 'short')}</span>)}</div>
          {cols}
        </div>
        <div className="heat-legend" aria-hidden="true">
          {t('적음')}{[0, 1, 2, 3, 4].map(i => <span key={i} style={{ background: `var(--heat${i})` }} />)}{t('많음')}
          {peak > 0 && ` · ${t('{date} 하루 {n}건이 가장 많다', { date: md2(toDay(peakDay)), n: peak })}`}
        </div>
      </div>
      <div className="ov-stats">
        {stat(entries.length, t('기록'))}
        {stat(Object.keys(perDay).length, t('작업한 날'))}
        {stat(Object.keys(concepts).length, t('면접 개념'))}
        {stat(shorts, t('60초 쇼츠'))}
      </div>
    </div>
  )
}
