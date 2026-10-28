import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { AiError, CheckedChange, ResumeChange, ResumeSkip } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'
import { ResumeFlow, type FlowState } from './ResumeFlow.tsx'

type St =
  | { k: 'busy' }
  | { k: 'closed' }
  | { k: 'err'; error: AiError }
  | { k: 'done'; changes: CheckedChange[]; skipped: ResumeSkip[]; through: string; count: number; total: number; noGuide: boolean; risky: { line: string; words: string[] }[] }
const SETUP = new Set(['no-cli', 'not-installed', 'busy'])
const KIND: Record<ResumeChange['kind'], string> = { add: '더하기', replace: '바꾸기', remove: '빼기' } // i18n-ok — 쓰는 곳에서 t()
// save 로 보낼 때는 화면용 칸(id · blocked · warnings)을 뺀다 — main 이 스키마로 모르는 키를 막는다
const plainChange = ({ kind, where, before, after, anchor, why, shipped, evidence }: CheckedChange): ResumeChange => ({ kind, where, before, after, anchor, why, shipped, evidence })

// 돌고 있는(또는 끝난) 작업은 화면 밖에 둔다 — 다른 탭으로 가서 이력서 화면이 사라져도 작업은 계속되고, 돌아오면 이어서 보인다.
// main 은 한 번에 하나만 돌리니(새 요청이 앞 요청을 취소) 작업도 하나. 취소는 [취소] · [닫기] 에서만
type Mode = 'update' | 'review'
interface Job { slug: string; mode: Mode; started: number; st: St; flow: FlowState; subs: Set<() => void> }
let job: Job | null = null
export const openJob = (): { slug: string; mode: Mode } | null => (job ? { slug: job.slug, mode: job.mode } : null)
function startJob(slug: string, mode: Mode): Job {
  const j: Job = { slug, mode, started: Date.now(), st: { k: 'busy' }, flow: {}, subs: new Set() }
  job = j
  const emit = (): void => { for (const f of j.subs) f() }
  const off = window.api.resume.onStage(s => { if (job !== j) return; j.flow = { ...j.flow, [s.stage]: { state: s.state, note: s.note, at: s.state === 'on' ? Date.now() : j.flow[s.stage]?.at ?? Date.now() } }; emit() })
  void window.api.resume[mode](slug)
    .catch((e: unknown) => ({ ok: false as const, error: { code: 'cli-error' as const, message: e instanceof Error ? e.message : String(e) } }))
    .then(r => {
      off()
      if (job !== j) return
      if (!r.ok && r.error.code === 'aborted') { job = null; j.st = { k: 'closed' } }
      else j.st = r.ok ? { k: 'done', changes: r.changes, skipped: r.skipped, through: r.through, count: r.count, total: r.total, noGuide: r.noGuide, risky: r.risky } : { k: 'err', error: r.error }
      emit()
    })
  return j
}
export function closeJob(): void { if (job?.st.k === 'busy') void window.api.resume.cancel(); job = null }

// 지금 보는 이력서 하나 — AI 가 낸 고칠 곳을 보고 체크한 것만 저장한다
// update: 전체 작업 기록(새 기록은 자세히)으로 최신화 · review: 불리하거나 불필요한 줄 점검(고쳐 쓰기 · 빼기만, 최신화 날짜는 그대로)
export function ResumeUpdate({ slug, label, mode = 'update', onClose, onSettings }: { slug: string; label: string; mode?: Mode; onClose: (msg?: string) => void; onSettings: () => void }) {
  const review = mode === 'review'
  const [j, setJ] = useState<Job>(() => (job && job.slug === slug && job.mode === mode ? job : startJob(slug, mode)))
  const [, tick] = useState(0)
  const st = j.st, flow = j.flow
  const [on, setOn] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [edits, setEdits] = useState<Record<number, string>>({}) // 직접 고친 '후' 글 (카드 id → 글)
  const [editing, setEditing] = useState<Set<number>>(new Set())
  // 작업이 바뀌면 다시 그린다. 끝나면 경고 없는 카드를 미리 체크하고, 취소로 끝났으면 닫는다
  useEffect(() => {
    const f = (): void => tick(n => n + 1)
    j.subs.add(f)
    return () => { j.subs.delete(f) }
  }, [j])
  const doneKey = st.k === 'done' ? st : null
  useEffect(() => { if (doneKey) setOn(new Set(doneKey.changes.filter(c => !c.blocked && !c.warnings.length).map(c => c.id))) }, [doneKey])
  useEffect(() => { if (st.k === 'closed') onClose() }, [st.k]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // 진행 중이면 1초마다 다시 그려 경과 시간을 보인다
    if (st.k !== 'busy') return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [st.k])
  const make = (): void => { setSaveErr(''); setEdits({}); setEditing(new Set()); setJ(startJob(slug, mode)) }
  const close = (msg?: string): void => { closeJob(); onClose(msg) }
  const heading = review ? t('{label} 이력서 점검', { label }) : t('{label} 이력서 최신화', { label })
  const secs = Math.round((Date.now() - j.started) / 1000)

  const save = async (picked: CheckedChange[], through: string): Promise<void> => {
    setSaving(true)
    setSaveErr('')
    try {
      const r = await window.api.resume.save(slug, picked.map(c => ({ ...plainChange(c), after: edits[c.id] ?? c.after })), review ? '' : through)
      const done = review ? t('{label} 이력서에 {n}곳을 고쳤습니다', { label, n: r.applied }) : t('{label} 이력서에 {n}곳을 반영했습니다', { label, n: r.applied })
      close(picked.length ? `${done}${r.skipped ? ` — ${t('고친 사이 바뀐 곳 {n}개는 건너뛰었습니다', { n: r.skipped })}` : ''}` : t('이 기록까지 본 것으로 했습니다'))
    } catch (e) {
      setSaveErr(t('저장하지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) }))
      setSaving(false)
    }
  }
  const empty = (c: CheckedChange): boolean => c.kind !== 'remove' && !(edits[c.id] ?? c.after).trim() // 고쳐서 비운 카드는 넣을 수 없다
  const setEdit = (id: number, v: boolean): void => setEditing(s => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const toggle = (id: number): void => setOn(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <section className="cv-update" aria-label={heading}>
      <div className="cv-update-head">
        <h2>{heading}</h2>
        <button type="button" className="btn" onClick={() => close()}>{t('닫기')}</button>
      </div>
      {st.k === 'busy' && <ResumeFlow mode={mode} role={slug !== ''} flow={flow} now={Date.now()} />}
      {st.k === 'busy' && (
        <p className="report-maker-wait" role="status">
          <LoaderCircle size={16} className="spin" aria-hidden /> {review ? t('AI 가 불리하거나 불필요한 줄을 찾는 중… {n}초', { n: secs }) : t('AI 가 고칠 곳을 찾는 중… {n}초', { n: secs })}
          <button type="button" className="btn" onClick={() => close()}>{t('취소')}</button>
        </p>
      )}
      {st.k === 'err' && (
        <>
          <p className="err" role="alert">{st.error.message} {SETUP.has(st.error.code) && <button type="button" className="btn" onClick={onSettings}>{t('환경설정')}</button>}</p>
          <div className="report-maker-actions"><button type="button" className="btn btn-primary" onClick={() => void make()}>{t('다시 시도')}</button></div>
        </>
      )}
      {st.k === 'done' && (
        <>
          <details className="cv-log"><summary>{t('진행 기록')}</summary><ResumeFlow mode={mode} role={slug !== ''} flow={flow} now={Date.now()} /></details>
          <p className="muted">{review ? t('불리하거나 불필요한 곳 {n}개', { n: st.changes.length }) : t('전체 기록 {total}건(새 기록 {count}건)을 읽고 고칠 곳 {n}개', { total: st.total, count: st.count, n: st.changes.length })} · {t('경고가 없는 것만 미리 체크했습니다')}</p>
          {st.noGuide && <p className="warn" role="status">{t('작성 가이드(RESUME-GUIDE.md)를 찾지 못해 가이드 없이 만들었습니다')}</p>}
          {st.risky.length > 0 && (
            <div className="cv-risky" role="note">
              <b>{t('AI 가 고치지 않은 줄에도 불리할 수 있는 말이 있습니다')}</b> — {t('[다시 만들기] 하거나 파일에서 직접 고치세요')}
              <ul>{st.risky.map((r, i) => <li key={i}><span className="chip">{r.words.join(' · ')}</span> {r.line.length > 90 ? `${r.line.slice(0, 90)}…` : r.line}</li>)}</ul>
            </div>
          )}
          {st.changes.length === 0 && <p className="h-none">{review ? t('걸리는 곳이 없습니다') : t('바꿀 곳이 없습니다')}</p>}
          {st.changes.map(c => (
            <article key={c.id} className={c.blocked ? 'cv-change is-blocked' : 'cv-change'}>
              <label className="cv-change-head">
                <input type="checkbox" checked={on.has(c.id) && !empty(c)} disabled={!!c.blocked || empty(c)} onChange={() => toggle(c.id)} />
                <span className="chip">{t(KIND[c.kind])}</span><span className="muted">{c.where}</span>
                {edits[c.id] !== undefined && edits[c.id] !== c.after && <span className="chip">{t('직접 고침')}</span>}
              </label>
              {c.before && <pre className="cv-before">{c.before}</pre>}
              {editing.has(c.id)
                ? <textarea className="cv-after" aria-label={t('후 고치기')} rows={4} maxLength={2000} value={edits[c.id] ?? c.after} onChange={e => setEdits(x => ({ ...x, [c.id]: e.target.value }))} />
                : (edits[c.id] ?? c.after) && <pre className="cv-after">{edits[c.id] ?? c.after}</pre>}
              {!c.blocked && c.kind !== 'remove' && <button type="button" className="btn" onClick={() => { if (!editing.has(c.id) && !(c.id in edits)) setEdits(x => ({ ...x, [c.id]: c.after })); setEdit(c.id, !editing.has(c.id)) }}>{editing.has(c.id) ? t('고치기 끝') : t('고치기')}</button>}
              <p className="cv-why">{c.why}</p>
              {c.evidence.map((ev, i) => <p key={i} className="cv-ev muted">{t('근거 {ref} — “{quote}”', { ref: ev.ref, quote: ev.quote })}</p>)}
              {c.blocked && <p className="err">{c.blocked}</p>}
              {!c.blocked && empty(c) && <p className="err" role="alert">{t('비어 있으면 넣을 수 없습니다')}</p>}
              {c.warnings.map((w, i) => <p key={i} className="cv-warn">{w}</p>)}
            </article>
          ))}
          {st.skipped.length > 0 && (
            <details className="cv-skipped">
              <summary>{t('넣지 않은 기록과 이유 {n}건', { n: st.skipped.length })}{st.skipped.length < st.count ? ` ${t('(새 기록 {n}건 중 AI 가 이유를 적은 것)', { n: st.count })}` : ''}</summary>
              <ul>{st.skipped.map((s, i) => <li key={i}><b>{s.title}</b> — {s.why}</li>)}</ul>
            </details>
          )}
          {saveErr && <p className="err" role="alert">{saveErr}</p>}
          <div className="report-maker-actions">
            <button type="button" className="btn" disabled={saving} onClick={() => void make()}>{t('다시 만들기')}</button>
            {review
              ? st.changes.length > 0 && <button type="button" className="btn btn-primary" disabled={saving || !st.changes.some(c => on.has(c.id) && !empty(c))} onClick={() => void save(st.changes.filter(c => on.has(c.id) && !empty(c)), '')}>{t('{n}곳 고치기', { n: st.changes.filter(c => on.has(c.id) && !empty(c)).length })}</button>
              : st.changes.length
              ? <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save(st.changes.filter(c => on.has(c.id) && !empty(c)), st.through)}>{st.changes.filter(c => on.has(c.id) && !empty(c)).length ? t('{n}곳 저장', { n: st.changes.filter(c => on.has(c.id) && !empty(c)).length }) : t('아무것도 넣지 않고 이 기록까지 본 것으로 하기')}</button>
              : <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save([], st.through)}>{t('이 기록까지 본 것으로 하기')}</button>}
          </div>
        </>
      )}
    </section>
  )
}
