import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { House } from 'lucide-react'
import { MISTAKE_LABEL, type DueItem, type Entry, type MistakeGroup, type ProblemStatus, type ProblemSummary } from '../../shared/types.ts'
import { weekOf } from '../../shared/week.ts'
import type { TabId } from '../shell/Rail.tsx'
import { EmptyState } from '../shell/EmptyState.tsx'
import { t } from '../../shared/i18n.ts'

type Open = (problemId: number, mode: 'learn' | 'review') => void

export function Home({ onOpen, onCoding, side, entries, onTab, onCodingFilter }: { onOpen: Open; onCoding: () => void; side: HTMLElement | null; entries: Entry[]; onTab: (t: TabId) => void; onCodingFilter: (k: 'due' | 'solving') => void }) {
  const [due, setDue] = useState<DueItem[]>([])
  const [rows, setRows] = useState<ProblemSummary[] | null>(null)
  const [st, setSt] = useState<Record<number, ProblemStatus>>({})
  const [book, setBook] = useState<MistakeGroup[]>([])

  const load = useCallback(() => {
    const warn = (what: string) => (e: unknown) => console.error(`${what}을 읽지 못했습니다`, e)
    window.api.review.due().then(setDue).catch(warn('복습')) // i18n-ok — 개발자용 로그
    window.api.coding.list().then(setRows).catch(warn('문제 목록')) // i18n-ok — 개발자용 로그
    window.api.coding.statuses().then(setSt).catch(warn('상태')) // i18n-ok — 개발자용 로그
    window.api.tutor.mistakeBook().then(setBook).catch(warn('오답 노트')) // i18n-ok — 개발자용 로그
  }, [])
  useEffect(() => { load(); return window.api.coding.onChanged(load) }, [load])

  // 사이드바 — 이번 주 기록 · 코테 현황 · 자주 쓰는 곳 바로 가기
  const week = weekOf(new Date().toLocaleDateString('sv')).key // sv = YYYY-MM-DD, 로컬 날짜
  const thisWeek = entries.filter(e => weekOf(e.date).key === week).length
  const solvingN = Object.values(st).filter(s => s.kind === 'solving').length
  const go = (tab: TabId, label: string, n?: number): ReactNode => (
    <button type="button" className="side-item" onClick={() => onTab(tab)}><span>{label}</span>{n !== undefined && <span className="num">{n}</span>}</button>
  )
  const sidebar = side && createPortal(
    <>
      <div className="side-label">{t('이번 주')}</div>
      {go('history', t('작업 기록'), thisWeek)}
      {go('reports', t('주간 보고 만들기'))}
      <div className="side-label">{t('코테 연습')}</div>
      <button type="button" className="side-item" onClick={() => onCodingFilter('due')}><span>{t('오늘 복습')}</span><span className="num">{due.length}</span></button>
      <button type="button" className="side-item" onClick={() => onCodingFilter('solving')}><span>{t('풀이 중')}</span><span className="num">{solvingN}</span></button>
      <div className="side-label">{t('바로 가기')}</div>
      {go('resume', t('이력서 최신화'))}
      {go('knowledge', t('지식사전'))}
    </>,
    side
  )

  if (!rows) return sidebar || null
  if (rows.length === 0) {
    return (
      <div className="home">
        {sidebar}
        <EmptyState icon={House} title={t('오늘은 무엇을 할까요?')}>
          <button type="button" className="btn" onClick={onCoding}>{t('코테 연습에서 문제를 가져와 보세요')}</button>
        </EmptyState>
      </div>
    )
  }

  const solving = rows.filter(r => st[r.id]?.kind === 'solving').slice(0, 5)
  const kinds = Object.values(st).map(s => s.kind)
  const top = [...book].sort((a, b) => b.count - a.count)[0]
  const stats: [string, number, string?][] = [
    [t('가져온 문제'), rows.length],
    [t('통과'), kinds.filter(k => k === 'passed' || k === 'review' || k === 'mastered').length],
    [t('익힘'), kinds.filter(k => k === 'mastered').length],
    [t('오답'), book.reduce((n, g) => n + g.count, 0), top ? `${t(MISTAKE_LABEL[top.type])} ${top.count}` : undefined]
  ]

  return (
    <div className="home">
      {sidebar}
      <div className="side-label">{t('오늘 복습 {n}', { n: due.length })}</div>
      {due.length === 0 && <p className="muted">{t('오늘 복습할 문제가 없습니다')}</p>}
      {due.map((d, i) => (
        <div key={d.problemId} className="home-row">
          <span className="home-title">{d.title}</span>
          <span className="muted">{t('{n}번째 복습', { n: d.step + 1 })}</span>
          {d.maxHint >= 4 && <span className="chip">{t('L{n} 힌트 사용', { n: d.maxHint })}</span>}
          <button type="button" className={i === 0 ? 'btn btn-primary' : 'btn'} onClick={() => onOpen(d.problemId, 'review')}>{t('복습 시작')}</button>
        </div>
      ))}
      {solving.length > 0 && <div className="side-label">{t('이어서 풀기')}</div>}
      {solving.map(r => (
        <div key={r.id} className="home-row">
          <span className="home-title">{r.title}</span>
          <button type="button" className="btn" onClick={() => onOpen(r.id, 'learn')}>{t('이어서 풀기')}</button>
        </div>
      ))}
      <div className="home-stats">
        {stats.map(([label, n, sub]) => (
          <div key={label} className="home-stat">
            <span className="muted">{label}</span>
            <b>{n}</b>
            {sub && <span className="muted">{sub}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
