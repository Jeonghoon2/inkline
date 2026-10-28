import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CodeXml, NotebookPen, Plus } from 'lucide-react'
import type { ProblemStatus, ProblemSummary } from '../../shared/types.ts'
import { dueLabel, isPassedKind, passedTagCount } from '../../shared/review.ts'
import { FilterChips } from '../shell/FilterChips.tsx'
import { EmptyState } from '../shell/EmptyState.tsx'
import { Composer } from '../coding/Composer.tsx'
import { ProblemList } from '../coding/ProblemList.tsx'
import { MistakeBook } from '../coding/MistakeBook.tsx'
import { Practice } from '../practice/Practice.tsx'
import { t } from '../../shared/i18n.ts'

const anyPass = isPassedKind
const KIND_LABEL: Record<string, string> = { solving: '풀이 중', passed: '통과', review: '복습 예정', mastered: '익힘' } // i18n-ok — 보일 때 t()
const toggle = <T,>(s: Set<T>, v: T): Set<T> => { const n = new Set(s); if (!n.delete(v)) n.add(v); return n }

export function CodingTab({ side, onSettings, onFocus, onHome, request, preset, reset }: { side: HTMLElement | null; onSettings: () => void; onFocus: (on: boolean) => void; onHome: () => void; request: { id: number; mode: 'learn' | 'review'; n: number } | null; preset: { kind: 'due' | 'solving'; n: number } | null; reset: number }) {
  const [rows, setRows] = useState<ProblemSummary[]>([])
  const [openId, setOpenId] = useState<number | null>(request?.id ?? null)
  const [fromHome, setFromHome] = useState(!!request) // 홈에서 연 문제는 끝나면 홈으로
  const [levels, setLevels] = useState<Set<number>>(new Set())
  const [unclassified, setUnclassified] = useState(false)
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [book, setBook] = useState(false)
  const [mode, setMode] = useState<'learn' | 'review'>(request?.mode ?? 'learn')
  const [statuses, setStatuses] = useState<Record<number, ProblemStatus>>({})
  const [kinds, setKinds] = useState<Set<string>>(new Set())
  const [dueToday, setDueToday] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(() => {
    window.api.coding.list().then(setRows).catch(e => console.error('문제 목록을 읽지 못했습니다', e))
    window.api.coding.statuses().then(setStatuses).catch(e => console.error('상태를 읽지 못했습니다', e))
  }, [])
  const open = (id: number, m: 'learn' | 'review' = 'learn'): void => { setFromHome(false); setMode(m); setOpenId(id) }
  useEffect(() => {
    if (request) { setFromHome(true); setBook(false); setOpenId(request.id); setMode(request.mode) }
  }, [request?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); return window.api.coding.onChanged(load) }, [load])
  const clearFilters = (): void => { setLevels(new Set()); setUnclassified(false); setTags(new Set()); setKinds(new Set()); setDueToday(false) }
  const filtered = levels.size > 0 || unclassified || tags.size > 0 || kinds.size > 0 || dueToday
  // 홈의 '오늘 복습' · '풀이 중' 바로 가기 — 그 상태만 거른 목록으로
  useEffect(() => {
    if (!preset) return
    clearFilters(); setBook(false); setOpenId(null)
    if (preset.kind === 'due') setDueToday(true); else setKinds(new Set(['solving']))
  }, [preset?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  // 레일의 코테 연습을 다시 누르면 목록으로(오답 노트 · 풀이 화면에서)
  const reset0 = useRef(reset) // 탭을 다시 열 때(마운트)는 무시하고, 열려 있는 동안 레일을 다시 누를 때만
  useEffect(() => { if (reset !== reset0.current) { reset0.current = reset; setBook(false); setOpenId(null) } }, [reset])
  // 풀이 화면에서는 보조 사이드바를 접는다
  useEffect(() => {
    onFocus(openId !== null)
    return () => onFocus(false)
  }, [openId, onFocus])

  const tagCount = useMemo(() => passedTagCount(rows, statuses), [rows, statuses])
  const isDue = (id: number): boolean => { const s = statuses[id]; return s?.kind === 'review' && dueLabel(s.dueAt, new Date()) === '오늘' } // i18n-ok — shared/review.ts 의 표지와 비교
  const dueCount = rows.filter(r => isDue(r.id)).length
  const shown = rows.filter(r => {
    const k = statuses[r.id]?.kind ?? 'new'
    if ((kinds.size || dueToday) && !(kinds.has(k) || (kinds.has('passed') && anyPass(k)) || (dueToday && isDue(r.id)))) return false
    const c = r.classification
    const byLevel = !levels.size && !unclassified ? true : c ? levels.has(c.difficulty) : unclassified
    const byTag = !tags.size || (anyPass(k) && (c?.tags.some(tag => tags.has(tag)) ?? false)) // 통과 전 유형은 모르는 것으로
    return byLevel && byTag
  })

  const goList = (): void => { setBook(false); setOpenId(null); setTimeout(() => composer.current?.focus(), 0) }
  const item = (label: string, n: number, on: boolean, fn: () => void) => (
    <button key={label} type="button" className="side-item" aria-current={on} onClick={() => { setBook(false); setOpenId(null); fn() }}>
      <span>{label}</span><span className="num">{n}</span>
    </button>
  )

  const sidebar = (
    <>
      <button type="button" className="side-item" onClick={goList}><Plus size={16} aria-hidden /><span>{t('문제 가져오기')}</span></button>
      <button type="button" className="side-item" aria-current={book && openId === null} onClick={() => { setOpenId(null); setBook(true) }}><NotebookPen size={16} aria-hidden /><span>{t('오답 노트')}</span></button>
      <div className="side-label">{t('상태')}</div>
      {(['solving', 'passed', 'review', 'mastered'] as const).map(k =>
        item(t(KIND_LABEL[k]), rows.filter(r => k === 'passed' ? anyPass(statuses[r.id]?.kind ?? '') : statuses[r.id]?.kind === k).length, kinds.has(k), () => setKinds(s => toggle(s, k))))}
      {item(t('오늘 복습'), dueCount, dueToday, () => setDueToday(d => !d))}
      <div className="side-label">{t('난이도')}</div>
      {[1, 2, 3, 4, 5].map(n => item(`Lv ${n}`, rows.filter(r => r.classification?.difficulty === n).length, levels.has(n), () => setLevels(s => toggle(s, n))))}
      {item(t('미분류'), rows.filter(r => !r.classification).length, unclassified, () => setUnclassified(u => !u))}
      <div className="side-label">{t('태그')}</div>
      {tagCount.length === 0 && <p className="muted side-hint">{t('한 번 통과하면 유형으로 거를 수 있어요')}</p>}
      {tagCount.map(([tag, n]) => item(tag, n, tags.has(tag), () => setTags(s => toggle(s, tag))))}
      {rows.length > 0 && <div className="side-label">{t('최근')}</div>}
      {rows.slice(0, 10).map(r => (
        <button key={r.id} type="button" className="side-item" aria-current={openId === r.id} onClick={() => { setBook(false); open(r.id) }}>
          <span className="side-title">{r.title}</span>
        </button>
      ))}
    </>
  )

  return (
    <>
      {side && createPortal(sidebar, side)}
      {openId !== null ? (
        <Practice key={`${openId}-${mode}`} problemId={openId} mode={mode} home={fromHome} onBack={fromHome ? onHome : book ? () => setOpenId(null) : goList} onSettings={onSettings} />
      ) : book ? (
        <MistakeBook onOpen={id => open(id)} />
      ) : (
        <div className="coding">
          {rows.length === 0 && <EmptyState icon={CodeXml} title={t('어떤 문제를 풀까요?')} />}
          <Composer ref={composer} onSettings={onSettings} onOpen={p => { load(); open(p.id) }} />
          {rows.length > 0 && <FilterChips onClearAll={clearFilters} chips={[
            ...[...kinds].map(k => ({ label: KIND_LABEL[k] ? t(KIND_LABEL[k]) : k, clear: () => setKinds(s => toggle(s, k)) })),
            ...(dueToday ? [{ label: t('오늘 복습'), clear: () => setDueToday(false) }] : []),
            ...[...levels].sort().map(n => ({ label: `Lv ${n}`, clear: () => setLevels(s => toggle(s, n)) })),
            ...(unclassified ? [{ label: t('미분류'), clear: () => setUnclassified(false) }] : []),
            ...[...tags].map(tag => ({ label: t('태그: {tag}', { tag }), clear: () => setTags(s => toggle(s, tag)) }))
          ]} />}
          {rows.length > 0 && <ProblemList rows={shown} statuses={statuses} onOpen={open} />}
          {rows.length > 0 && !shown.length && filtered && <p className="problem-none"><button type="button" className="btn" onClick={clearFilters}>{t('거르기 모두 풀기')}</button></p>}
        </div>
      )}
    </>
  )
}
