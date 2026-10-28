import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Globe, IdCard, Lightbulb, FileDown, History, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import type { CvHead, HistoryData } from '../../shared/types.ts'
import { ResumeOnboard, keptOnboard } from '../history/ResumeOnboard.tsx'
import { EmptyState } from '../shell/EmptyState.tsx'
import { HistoryGate } from '../history/Gate.tsx'
import { ResumeUpdate, openJob } from '../history/ResumeUpdate.tsx'
import { md } from '../../shared/week.ts'
import { locale, t } from '../../shared/i18n.ts'
import { cvBlanks, cvIsBlank, cvRoles, cvSplit, gapItem, gapLackCount, renderResume } from '../history/resume.ts'

const ROLE_KEY = 'inkline-cv-role'

export function ResumeTab({ side, history, onSettings }: { side: HTMLElement | null; history: { data: HistoryData | null; error: string }; onSettings: () => void }) {
  return <HistoryGate history={history} onSettings={onSettings}>{(data, error) => <ResumeView side={side} data={data} error={error} onSettings={onSettings} />}</HistoryGate>
}

// 화면이 사라져도(다른 탭에 다녀와도) 남겨 둘 이력서 탭 상태 — 안내 문구 · 이전 판 목록. 최신화 · 점검 작업은 ResumeUpdate 의 job
type Backup = { name: string; at: string }
const kept: { msg: string; err: string; bk: Backup[] | null; bkSlug: string } = { msg: '', err: '', bk: null, bkSlug: '' }
// [자료 다시 모으기] 도 화면 밖에서 돈다 — 끝나면 안내 문구를 남긴다(그때 다른 탭이어도)
let gather: { slug: string; subs: Set<() => void> } | null = null
function startGather(slug: string): void {
  const g = { slug, subs: new Set<() => void>() }
  gather = g
  kept.msg = ''; kept.err = ''
  window.api.resume.research(slug)
    .then(r => { if (r.ok) kept.msg = t('{label} 자료를 새로 모았습니다 — 출처 {n}개 중 {opened}개를 열어 확인했습니다', { label: r.label, n: r.sources, opened: r.opened }) + (r.backup ? ` · ${t('있던 자료는 {path} 에 두었습니다', { path: r.backup.split('/').slice(-2).join('/') })}` : ''); else kept.err = t('자료를 모으지 못했습니다: {msg}', { msg: r.error.message }) })
    .catch((e: unknown) => { kept.err = t('자료를 모으지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) }) })
    .finally(() => { gather = null; for (const f of g.subs) f() })
}

function ResumeView({ side, data, error, onSettings }: { side: HTMLElement | null; data: HistoryData; error: string; onSettings: () => void }) {
  const roles = cvRoles(data.resume, data.roles)
  // 돌고 있는 최신화 · 점검이 있으면 그 이력서와 비교 화면으로 돌아온다(다른 탭에 다녀와도)
  const [pick, setPick] = useState(() => { const oj = openJob(); if (oj) return oj.slug; try { return localStorage.getItem(ROLE_KEY) ?? '' } catch { return '' } })
  const [msg, setMsg] = useState(kept.msg)
  const [pdfErr, setPdfErr] = useState(kept.err)
  const [blanks, setBlanks] = useState<string[] | null>(null) // PDF 저장 전 빈칸 확인 — null 이면 닫힘
  const [updating, setUpdating] = useState<'update' | 'review' | null>(() => openJob()?.mode ?? null) // 열린 비교 화면
  const [bk, setBk] = useState<Backup[] | null>(() => (kept.bkSlug === pick ? kept.bk : null)) // 이전 판 패널 — null 이면 닫힘
  const [restoring, setRestoring] = useState(false)
  const [since, setSince] = useState<string | null>(null)
  const [photo, setPhoto] = useState('')
  const [, tick] = useState(0)
  // 자료 모으기가 끝나면 남긴 안내를 보인다
  useEffect(() => { const g = gather; if (!g) return; const f = (): void => { setMsg(kept.msg); setPdfErr(kept.err); tick(n => n + 1) }; g.subs.add(f); return () => { g.subs.delete(f) } }, [gather]) // eslint-disable-line react-hooks/exhaustive-deps
  const regather = (): void => { setMsg(''); setPdfErr(''); startGather(cur.slug); tick(n => n + 1) }
  // 온보딩 — 기본 이력서가 없거나 이름이 비면 뜬다. head 는 열 때 읽은 지금 값(null = 닫힘)
  const needs = !/^# \S/m.test(data.resume)
  const [ob, setOb] = useState<CvHead | null>(() => keptOnboard()) // 쓰던 온보딩이 있으면 이어서
  const openOb = (): void => { choose(''); void window.api.resume.head().then(setOb, () => setOb({ name: '', email: '', phone: '', github: '', portfolio: '', company: '', title: '', start: '', end: '' })) } // 온보딩은 기본 이력서의 일
  const started = useRef(false)
  // 온보딩 끝 — 고른 직무의 이력서 뼈대를 만들고(직무 초안은 그 직무를 열 때 하나씩), 기본 이력서 초안부터
  const draftFirst = async (roles: string[]): Promise<void> => {
    const failed: string[] = []
    for (const r of roles) await window.api.resume.addRole(r).catch(() => failed.push(r))
    setOb(null)
    choose('')
    if (failed.length) setPdfErr(t('직무 이력서를 만들지 못했습니다: {list}', { list: failed.join(', ') }))
    setUpdating('update')
  }
  useEffect(() => { if (needs && !started.current && !ob) { started.current = true; openOb() } }, [needs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.api.settings.all().then(s => setPhoto(s['resume.photo']), () => {}) }, []) // 환경설정에서 바꾸면 탭을 다시 열 때 읽는다
  const cur = roles.find(r => r.slug === pick) ?? roles[0]!
  useEffect(() => { kept.msg = msg; kept.err = pdfErr; kept.bk = bk; kept.bkSlug = cur.slug }, [msg, pdfErr, bk, cur.slug]) // 다른 탭에 다녀와도 남게
  const [doc, groups] = cvSplit(cur.text)
  useEffect(() => { let live = true; window.api.resume.since(cur.slug).then(d => { if (live) setSince(d) }, () => live && setSince(null)); return () => { live = false } }, [cur.slug, data.loadedAt, updating]) // 비교 화면을 닫으면 다시 읽는다 — 파일을 안 바꾼 저장(본 것으로 하기)은 폴더 감시가 모른다
  const fresh = since ? data.entries.filter(e => e.date >= since).length : 0

  const choose = (slug: string): void => {
    setPick(slug)
    const oj = openJob()
    setUpdating(oj && oj.slug === slug ? oj.mode : null) // 그 이력서에 돌고 있는 작업이 있으면 다시 연다
    setMsg('')
    setPdfErr('')
    setBk(null)
    setBlanks(null)
    try { localStorage.setItem(ROLE_KEY, slug) } catch { /* 저장 못 해도 화면은 된다 */ }
  }
  const savePdf = async (checked = false): Promise<void> => {
    setMsg('')
    setPdfErr('')
    const b = cvBlanks(doc)
    if (!checked && b.length) return setBlanks(b)
    setBlanks(null)
    try {
      const r = await window.api.resume.savePdf(t('이력서-{label}', { label: cur.label }))
      if (r) setMsg(t('저장했습니다: {path} · {n}쪽', { path: r.path, n: r.pages }) + (cur.slug && r.pages > 2 ? ` — ${t('직무 이력서는 2쪽 이내를 권합니다')}` : ''))
    } catch (e) { setPdfErr(t('PDF 를 저장하지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) })) }
  }

  const openBk = async (): Promise<void> => {
    setMsg('')
    setPdfErr('')
    try { setBk(await window.api.resume.backups(cur.slug)) } catch (e) { setPdfErr(t('이전 판을 읽지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) })) }
  }
  const restore = async (name: string): Promise<void> => {
    if (restoring) return
    setRestoring(true)
    try {
      await window.api.resume.restore(cur.slug, name)
      setBk(null)
      setMsg(t('되돌렸습니다 — 지금 판도 백업해 두었습니다'))
    } catch (e) { setPdfErr(t('되돌리지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) })) } finally { setRestoring(false) }
  }
  const sidebar = roles.map(r => (
    <button key={r.slug} type="button" className="side-item" aria-current={r.slug === cur.slug} onClick={() => choose(r.slug)}>
      <span>{r.label}</span>
    </button>
  ))

  return (
    <>
      {side && createPortal(sidebar, side)}
      {ob ? (
        <div className="resume"><ResumeOnboard initial={ob} photo={photo} have={data.roles.map(r => r.slug)} onPhoto={setPhoto} onSettings={onSettings} onClose={() => setOb(null)} onDraft={roles => void draftFirst(roles)} /></div>
      ) : !doc.trim() ? (
        <EmptyState icon={IdCard} title={t('이력서가 없습니다')}>
          <p className="muted">{t('이름 · 연락처를 넣고 작업 기록으로 첫 이력서를 만들어 보세요')}</p>
          {cur.slug === '' && <button type="button" className="btn btn-primary" onClick={openOb}>{t('시작하기')}</button>}
        </EmptyState>
      ) : (
      <div className="resume">
        {error && <p className="err" role="alert">{error}</p>}
        <div className="cv-toolbar">
          <span className="muted">{t('{path} 를 고치면 바로 바뀝니다', { path: `${data.root.replace(/^\/Users\/[^/]+/, '~')}/${cur.file}` })}</span>
          {msg && <span className="muted" role="status">{msg}</span>}
          {pdfErr && <p className="err" role="alert">{pdfErr}</p>}
          <button type="button" className="btn" disabled={!data.entries.length || !!updating} title={t('전체 기록 {n}건을 읽고 고칠 곳을 찾습니다', { n: data.entries.length }) + (since ? ` — ${t('{date} 이후 새 기록은 자세히', { date: md(since) })}` : '')} onClick={() => { setMsg(''); setUpdating('update') }}>
            <RefreshCw size={14} aria-hidden /> {t('최신화')}{since && <span className="muted"> · {fresh ? t('새 기록 {n}건', { n: fresh }) : t('새 기록 없음')}</span>}
          </button>
          <button type="button" className="btn" disabled={!!updating} title={t('인사 담당자 눈으로 불리하거나 불필요한 줄을 찾아 고쳐 쓰기 · 빼기를 냅니다')} onClick={() => { setMsg(''); setBk(null); setUpdating('review') }}><ShieldCheck size={14} aria-hidden /> {t('점검')}</button>
          {cur.slug && <button type="button" className="btn" disabled={!!updating || !!gather} title={t('이 직무의 이력서 · 자기소개서 자료를 웹에서 새로 모아 Knowledge/resume 에 씁니다(2~4분)')} onClick={regather}><Globe size={14} aria-hidden /> {gather?.slug === cur.slug ? t('자료 모으는 중…') : t('자료 다시 모으기')}</button>}
          <button type="button" className="btn" disabled={!!updating} title={t('이름 · 사진 · 연락처 · 링크')} onClick={() => { setMsg(''); setBk(null); openOb() }}><UserRound size={14} aria-hidden /> {t('기본 정보')}</button>
          <button type="button" className="btn" disabled={!!updating} onClick={() => void openBk()}><History size={14} aria-hidden /> {t('이전 판')}</button>
          <button type="button" className="btn" onClick={() => void savePdf()}><FileDown size={14} aria-hidden /> {t('PDF로 저장')}</button>
        </div>
        {blanks && (
          <div className="cv-blanks" role="alert">
            <span>{t('아직 안 채운 칸 {n}곳이 PDF 에 그대로 찍힙니다: {list}', { n: blanks.length, list: blanks.join(' · ') })}</span>
            <button type="button" className="btn" onClick={() => void savePdf(true)}>{t('그래도 저장')}</button>
            <button type="button" className="btn" onClick={() => setBlanks(null)}>{t('취소')}</button>
          </div>
        )}
        {bk && (
          <section className="cv-update" aria-label={t('이전 판')}>
            <div className="cv-update-head"><h2>{t('이전 판')}</h2><button type="button" className="btn" onClick={() => setBk(null)}>{t('닫기')}</button></div>
            {bk.length === 0 && <p className="h-none">{t('백업이 없습니다')}</p>}
            <ul>{bk.map(b => <li key={b.name}>{new Date(b.at).toLocaleString(locale())} <button type="button" className="btn" disabled={restoring} onClick={() => void restore(b.name)}>{t('되돌리기')}</button></li>)}</ul>
          </section>
        )}
        {updating
          ? <ResumeUpdate key={`${cur.slug}-${updating}`} slug={cur.slug} label={cur.label} mode={updating} onSettings={onSettings} onClose={m => { setUpdating(null); if (m) setMsg(m) }} />
          : cvIsBlank(doc)
            ? (
              <div className="cv-blank-card">
                <h2>{t('{label} 이력서가 아직 비어 있어요', { label: cur.label })}</h2>
                <p className="muted">{cur.slug ? t("작업 기록 {n}건에서 이 직무에 맞는 일을 골라, 직무 점검표 · 채용 자료 기준으로 초안을 쓰고 '보완할 경험'도 채웁니다.", { n: data.entries.length }) : t('작업 기록 {n}건에서 넣을 일을 골라 첫 초안을 씁니다.', { n: data.entries.length })} {t('1~2분 걸리고, 비교 화면에서 고른 것만 저장합니다.')}</p>
                <button type="button" className="btn btn-primary" disabled={!data.entries.length} onClick={() => { setMsg(''); setUpdating('update') }}>{cur.slug ? t('이 직무 초안 만들기') : t('초안 만들기')}</button>
              </div>
            )
            : <div dangerouslySetInnerHTML={{ __html: renderResume(doc, new Date(), photo) }} />}
      </div>
      )}
      {!ob && groups.length > 0 && <Gap key={cur.slug} label={cur.label} groups={groups} />}
    </>
  )
}

// 보완할 경험 말풍선 — 올리면 열리고(떼면 0.25초 뒤 닫힘), 누르면 고정, 다시 누르거나 Esc · 바깥을 누르면 닫힌다
function Gap({ label, groups }: { label: string; groups: { name: string; items: string[] }[] }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!pinned) return
    const away = (e: MouseEvent): void => { if (!box.current?.contains(e.target as Node)) { setPinned(false); setOpen(false) } }
    document.addEventListener('click', away)
    return () => document.removeEventListener('click', away)
  }, [pinned])
  const lack = gapLackCount(groups)
  const hover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches
  return (
    <div
      className="gap"
      ref={box}
      onMouseEnter={() => { if (hover) { window.clearTimeout(timer.current); setOpen(true) } }}
      onMouseLeave={() => { if (hover && !pinned) timer.current = window.setTimeout(() => setOpen(false), 250) }}
      onKeyDown={e => { if (e.key === 'Escape') { setPinned(false); setOpen(false); box.current?.querySelector('button')?.focus() } }}
    >
      {groups.length > 0 && (
        <div className="gap-panel" id="gapPanel" hidden={!open} role="region" aria-label={t('보완할 경험 — {label}', { label })}>
          <p className="gap-head"><b>{t('보완할 경험')}</b><span>{label}</span></p>
          <p className="gap-note">{t('기록에서 근거를 찾지 못한 점검표 항목과, 지금 프로젝트로 해 볼 만한 다음 걸음')}</p>
          {groups.map((g, i) => (
            <section key={i}>
              {g.name && <h3>{g.name} <span className="num">{g.items.length}</span></h3>}
              <ul>{g.items.map((t, j) => <li key={j} dangerouslySetInnerHTML={{ __html: gapItem(t) }} />)}</ul>
            </section>
          ))}
        </div>
      )}
      <button type="button" className="gap-btn" aria-expanded={open} aria-controls="gapPanel" aria-label={t('보완할 경험 {n}개 보기', { n: lack })} onClick={() => { setOpen(!pinned); setPinned(!pinned) }}>
        <Lightbulb size={17} aria-hidden /><span className="gap-label">{t('보완할 경험')}</span><b className="num">{lack}</b>
      </button>
    </div>
  )
}
