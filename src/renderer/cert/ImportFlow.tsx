import { BookOpen, EyeOff, FileText, ListChecks, PenLine, ScanSearch, Scissors, ShieldCheck, Shuffle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { StageFlow, type FlowState, type StageNode } from '../shell/StageFlow.tsx'
import type { CertBook } from '../../shared/cert.ts'
import type { Job } from './job.ts'
import { t } from '../../shared/i18n.ts'

const NODE: Record<string, StageNode> = {
  import: { icon: FileText, title: '가져오기', sub: '쪽 글 뽑기 · 단 정리', ai: false }, // i18n-ok
  classify: { icon: ScanSearch, title: '판별', sub: '자격증 · 종류 · 과목', ai: true }, // i18n-ok
  confirm: { icon: ListChecks, title: '확인', sub: '이름 · 과목 · 합격 기준', ai: false, user: true }, // i18n-ok
  segment: { icon: Scissors, title: '항목 나누기', sub: '쪽 묶음마다 항목 위치 → 원문 대조', ai: true } // i18n-ok
}
// 교재 넣기는 한 줄로 이어진 흐름 — 가져오기 → 판별 → 확인(사람) → 항목 나누기
const LAYERS = [['import'], ['classify'], ['confirm'], ['segment']]
// 표는 최상위라 한국어로 두고 그릴 때 옮긴다(언어는 앱 시작 뒤에 정해진다)
const tr = (nodes: Record<string, StageNode>): Record<string, StageNode> =>
  Object.fromEntries(Object.entries(nodes).map(([k, n]) => [k, { ...n, title: t(n.title), sub: t(n.sub) }]))

// 앱을 껐다 켜거나 다른 과정을 보다 와서 이번 진행 기록이 없으면, 끝난 단계는 교재 정보로 채운다
export function bookFlow(book: CertBook | null, job: Job): FlowState {
  const own = !book || job.bookId === book.id || (job.running && job.kind === 'import') ? job.flow : {}
  if (!book) return own
  return {
    ...own,
    import: own.import ?? { state: 'done', note: t('{n}쪽', { n: book.pages }), at: 0 },
    classify: own.classify ?? { state: 'done', note: `${book.name} · ${t(book.kind)} · ${t('{n}과목', { n: book.subjects.length })}`, at: 0 },
    confirm: book.confirmed ? { state: 'done', note: t('확인함'), at: 0 } : { state: 'on', note: t('아래 카드에서 확인해 주세요'), at: 0 }
  }
}

// big: 가져오기 · 항목 나누기 중에는 진행만 화면 가운데에 크게(과정 홈은 끝난 뒤에)
export function ImportFlow({ job, flow, onClose, big = false }: { job: Job; flow: FlowState; onClose?: () => void; big?: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!job.running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [job.running])
  return (
    <div className={`cert-flow${big ? ' is-big' : ''}`}>
      <StageFlow nodes={tr(NODE)} layers={LAYERS} flow={flow} now={now} label={t('교재 넣기 진행')} />
      <div className="cert-flow-actions">
        {job.running && <button type="button" className="btn" onClick={() => void window.api.cert.cancel()}>{t('취소')}</button>}
        {!job.running && onClose && <button type="button" className="btn" onClick={onClose}><X size={14} aria-hidden /> {t('닫기')}</button>}
      </div>
      {job.error && <p className="err" role="alert">{job.error}</p>}
    </div>
  )
}

// 문제 준비처럼 AI 를 기다리는 동안 — 지난 초와 물결 막대(타임라인과 같은 모양)
export function Preparing({ label }: { label: string }) {
  const [t0] = useState(Date.now())
  const [now, setNow] = useState(t0)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return (
    <div className="cert-prep" role="status">
      <span className="cert-prep-row"><span>{label}</span><span className="muted num">{t('{n}초', { n: Math.round((now - t0) / 1000) })}</span></span>
      <span className="tl-wave" aria-hidden />
    </div>
  )
}

// 문제 만들기 모듈 — 공부 화면이 기다리는 항목의 작은 단계(서버의 m-* 알림)
const M_NODE: Record<string, StageNode> = {
  'm-explain': { icon: BookOpen, title: '설명', sub: '쉬운 설명 · 외우기 · 헷갈리는 항목', ai: true }, // i18n-ok
  'm-lure': { icon: Shuffle, title: '오답 후보', sub: '같은 과목에서 헷갈리기 쉬운 항목', ai: false }, // i18n-ok
  'm-write': { icon: PenLine, title: '문제 쓰기', sub: '원문 근거로 4지선다', ai: true }, // i18n-ok
  'm-rules': { icon: ListChecks, title: '규칙 검사', sub: '근거 문장 · 보기 · 정답 길이', ai: false }, // i18n-ok
  'm-blind': { icon: EyeOff, title: '블라인드 풀이', sub: '정답을 가리고 풀어 대조', ai: true }, // i18n-ok
  'm-check': { icon: ShieldCheck, title: '점검', sub: '모호함 · 오개념', ai: true } // i18n-ok
}
export const M_IDS = Object.keys(M_NODE)
export function MaterialFlow({ flow }: { flow: FlowState }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  // 변형 문제는 설명 단계 없이 오답 후보부터 — 없는 단계에 초점이 머물지 않게 뺀다
  const ids = flow['m-explain'] || !flow['m-lure'] ? M_IDS : M_IDS.slice(1)
  return <div className="cert-flow"><StageFlow nodes={tr(M_NODE)} layers={ids.map(id => [id])} flow={flow} now={now} label={t('문제 만들기 진행')} /></div>
}
