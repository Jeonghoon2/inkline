import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { GraduationCap, Plus } from 'lucide-react'
import type { CertBook } from '../../shared/cert.ts'
import { EmptyState } from '../shell/EmptyState.tsx'
import { runImport, runSegment, useJob } from './job.ts'
import { ImportFlow, bookFlow } from './ImportFlow.tsx'
import { ConfirmCard } from './ConfirmCard.tsx'
import { CourseHome } from './CourseHome.tsx'
import { Study } from './Study.tsx'
import { Mock } from './Mock.tsx'
import { Wrongs } from './Wrongs.tsx'
import { Pairs } from './Pairs.tsx'
import { t } from '../../shared/i18n.ts'

export type View = { v: 'home' } | { v: 'study'; subject: string | null } | { v: 'mock' } | { v: 'wrongs' } | { v: 'pairs' }
let kept: { sel: number | null; view: View } = { sel: null, view: { v: 'home' } } // 탭을 옮겨도 보던 화면을 남긴다

const closed = new Set<number>() // 끝난 진행 타임라인을 닫은 교재
const resumed = new Set<number>() // 끝난 직후 목록이 낡았을 때 같은 교재를 또 나누지 않게 한 번만 이어 간다

const dday = (b: CertBook): string => {
  if (!b.examDate) return ''
  const d = Math.round((new Date(`${b.examDate}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000)
  return d > 0 ? `D-${d}` : d === 0 ? 'D-day' : ''
}

export function CertTab({ side }: { side: HTMLElement | null }) {
  const [books, setBooks] = useState<CertBook[] | null>(null)
  const [sel, setSelS] = useState<number | null>(kept.sel)
  const [view, setViewS] = useState<View>(kept.view)
  const [drag, setDrag] = useState(false)
  const [, redraw] = useState(0) // 모듈 Set(closed)을 바꾼 뒤 다시 그리기
  const job = useJob()
  const setSel = (s: number | null): void => { kept = { ...kept, sel: s }; setSelS(s) }
  const setView = (v: View): void => { kept = { ...kept, view: v }; setViewS(v) }
  const reload = useCallback(() => window.api.cert.list().then(setBooks).catch(() => setBooks([])), [])
  useEffect(() => { void reload() }, [reload, job.running])
  const book = books?.find(b => b.id === sel) ?? null
  // 확인했는데 항목 나누기가 덜 끝났으면(앱을 껐다 켬) 이어서 — 이 교재의 나누기가 실패 · 취소됐으면 저절로 다시 하지 않는다([이어서 나누기])
  useEffect(() => { if (book?.confirmed && book.status === 'importing' && !job.running && !(job.error && job.bookId === book.id) && !resumed.has(book.id)) { resumed.add(book.id); void runSegment(book.id) } }, [book?.id, book?.confirmed, book?.status, job.running, job.error, job.bookId])

  const add = async (path: string | null): Promise<void> => {
    if (!path) return
    const id = await runImport(path)
    await reload()
    if (id) { setSel(id); setView({ v: 'home' }) }
  }
  const drop = (e: React.DragEvent): void => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void add(window.api.cert.pathForFile(f)) }

  const sidebar = (
    <>
      <div className="side-label">{t('과정')}</div>
      {books?.map(b => (
        <button key={b.id} type="button" className="side-item" aria-current={b.id === sel} onClick={() => { setSel(b.id); setView({ v: 'home' }) }}>
          <span className="side-title">{b.name} · {t(b.kind)}</span><span className="num">{dday(b)}</span>
        </button>
      ))}
      <button type="button" className="side-item cert-add" disabled={job.running} onClick={() => void window.api.cert.pickPdf().then(add)}><Plus size={14} aria-hidden /> <span>{t('교재 넣기')}</span></button>
    </>
  )
  const portal = side && createPortal(sidebar, side)
  if (!books) return portal
  const banner = job.importError && <p className="err" role="alert">{job.importError}</p>

  if (job.running && job.kind === 'import') return <div className="cert">{portal}<ImportFlow job={job} flow={bookFlow(null, job)} big /></div>
  if (!book) return (
    <div className={`cert cert-drop${drag ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={drop}>
      {portal}
      {banner}
      <EmptyState icon={GraduationCap} title={books.length ? t('왼쪽에서 과정을 고르세요') : t('교재 PDF 를 넣어 자격증 공부를 시작하세요')}>
        <p className="muted">{t('PDF 를 여기에 끌어 놓거나 고르세요. 교재를 항목으로 나누고, 항목마다 먼저 맞혀 보는 문제와 쉬운 설명을 만듭니다.')}</p>
        <p className="muted">{t('교재 글 일부가 환경설정에서 고른 AI 로 전송됩니다. 교재와 만든 자료는 이 앱 안에만 저장합니다.')}</p>
        <button type="button" className="btn btn-primary" disabled={job.running} onClick={() => void window.api.cert.pickPdf().then(add)}>{t('PDF 고르기')}</button>
        {job.error && <p className="err" role="alert">{job.error}</p>}
      </EmptyState>
    </div>
  )
  if (!book.confirmed) return <div className="cert">{portal}{banner}<ImportFlow job={job} flow={bookFlow(book, job)} /><ConfirmCard key={book.id} book={book} onDone={b => { resumed.add(b.id); closed.delete(b.id); void reload(); void runSegment(b.id) }} onRemoved={() => { setSel(null); void reload() }} /></div>

  const segmenting = job.running && job.kind === 'segment' && job.bookId === book.id
  if (segmenting) return <div className="cert">{portal}{banner}<ImportFlow job={job} flow={bookFlow(book, job)} big /></div> // 나누는 동안은 진행만 크게, 과정 홈은 끝난 뒤에
  const back = (): void => setView({ v: 'home' })
  return (
    <div className="cert">
      {portal}
      {banner}
      {/* 나누는 중 · 실패는 어느 화면에서나, 이번에 막 끝난 결과는 과정 홈에서 닫기 전까지 */}
      {(segmenting || (job.bookId === book.id && (job.error || (view.v === 'home' && job.flow.segment?.state === 'done' && !closed.has(book.id))))) && <ImportFlow job={job} flow={bookFlow(book, job)} onClose={() => { closed.add(book.id); redraw(n => n + 1) }} />}
      {view.v === 'home' && <CourseHome key={book.id} book={book} busy={segmenting} onStudy={(s: string | null) => setView({ v: 'study', subject: s })} onMock={() => setView({ v: 'mock' })} onWrongs={() => setView({ v: 'wrongs' })} onPairs={() => setView({ v: 'pairs' })} onRetry={() => void runSegment(book.id)} onRemoved={() => { setSel(null); void reload() }} />}
      {view.v === 'study' && <Study bookId={book.id} subject={view.subject} onBack={back} />}
      {view.v === 'mock' && <Mock bookId={book.id} onBack={back} />}
      {view.v === 'wrongs' && <Wrongs bookId={book.id} onBack={back} />}
      {view.v === 'pairs' && <Pairs bookId={book.id} onBack={back} />}
    </div>
  )
}
