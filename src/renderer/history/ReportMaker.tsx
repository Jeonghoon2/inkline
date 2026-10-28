import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { AiError, Entry } from '../../shared/types.ts'
import { md as mdDate, recentWeeks, weekOf } from '../../shared/week.ts'
import { t } from '../../shared/i18n.ts'
import { Select } from '../shell/Select.tsx'
import { md } from './render.ts'
import { weekHint } from './filter.ts'
import { useReportCats } from './reportCats.ts'

type St = { k: 'pick' } | { k: 'busy'; secs: number } | { k: 'err'; error: AiError } | { k: 'done'; text: string; exists: boolean }
const SETUP = new Set(['no-cli', 'not-installed', 'busy'])

// 주를 고르고, 작업 기록에서 체크한 프로젝트의 그 주 기록으로 보고를 만든다
export function ReportMaker({ entries, reports, onClose, onSaved, onSettings }: { entries: Entry[]; reports: string[]; onClose: () => void; onSaved: (name: string) => void; onSettings: () => void }) {
  const cats = useMemo(() => [...new Set(entries.map(e => e.category))].sort(), [entries])
  const report = useReportCats(cats)
  const weeks = useMemo(() => recentWeeks(new Date(), 8), [])
  const [week, setWeek] = useState(weeks[0]!.key)
  const [audience, setAudience] = useState<'dev' | 'nondev' | 'company'>('dev')
  const nameOf = (w: string): string => (audience === 'nondev' ? `${w}-비개발자` : audience === 'company' ? `${w}-회사` : w) // i18n-ok — 보고 파일 이름
  const name = nameOf(week)
  const [st, setSt] = useState<St>({ k: 'pick' })
  const [ask, setAsk] = useState(false) // 저장 안 한 보고를 두고 닫으려 할 때
  const seq = useRef(0)
  useEffect(() => () => { seq.current++; void window.api.reports.cancel() }, [])
  useEffect(() => {
    if (st.k !== 'busy') return
    const t = setInterval(() => setSt(s => (s.k === 'busy' ? { k: 'busy', secs: s.secs + 1 } : s)), 1000)
    return () => clearInterval(t)
  }, [st.k])

  const inWeek = (key: string): Entry[] => entries.filter(e => report.on.has(e.category) && weekOf(e.date).key === key)
  const picked = inWeek(week)
  const perCat = cats.filter(c => report.on.has(c)).map(c => [c, picked.filter(e => e.category === c).length] as const)

  const make = async (): Promise<void> => {
    const n = ++seq.current
    setSt({ k: 'busy', secs: 0 })
    const r = await window.api.reports.make(week, [...report.on], audience).catch((e: unknown) => ({ ok: false as const, error: { code: 'cli-error' as const, message: e instanceof Error ? e.message : String(e) } }))
    if (n !== seq.current) return
    if (!r.ok) return setSt(r.error.code === 'aborted' ? { k: 'pick' } : { k: 'err', error: r.error })
    setSt({ k: 'done', text: r.text, exists: false })
  }
  const save = async (text: string, overwrite: boolean): Promise<void> => {
    try {
      const r = await window.api.reports.save(name, text, overwrite)
      if (r.exists) return setSt({ k: 'done', text, exists: true })
      onSaved(name)
    } catch (e) {
      setSt({ k: 'err', error: { code: 'cli-error', message: t('저장하지 못했습니다: {msg}', { msg: e instanceof Error ? e.message : String(e) }) } })
    }
  }

  return (
    <section className="report-maker" aria-label={t('주간 보고 만들기')}>
      <div className="report-maker-head">
        <h2>{t('주간 보고 만들기')}</h2>
        <button type="button" className="btn" onClick={() => (st.k === 'done' ? setAsk(true) : onClose())}>{t('닫기')}</button>
      </div>
      {ask && (
        <p className="warn" role="alert">{t('만든 보고를 저장하지 않고 닫을까요? 다시 만들려면 AI 를 또 불러야 합니다.')}{' '}
          <button type="button" className="btn" autoFocus onClick={() => setAsk(false)}>{t('계속 보기')}</button>{' '}
          <button type="button" className="btn" onClick={onClose}>{t('저장하지 않고 닫기')}</button>
        </p>
      )}
      {(st.k === 'pick' || st.k === 'err') && (
        <>
          <div className="report-maker-row">
            <span className="muted">{t('주')}</span>
            <Select label={t('주')} value={week} onChange={setWeek}
              options={weeks.map((w, i) => ({ value: w.key, label: `${i === 0 ? t('이번 주') : i === 1 ? t('지난주') : w.key} · ${mdDate(w.start)} ~ ${mdDate(w.end)}`, hint: weekHint(inWeek(w.key).length, reports.includes(nameOf(w.key))) }))} />
          </div>
          <div className="report-maker-row">
            <span className="muted">{t('대상')}</span>
            <Select label={t('대상')} value={audience} onChange={setAudience}
              options={[{ value: 'dev', label: t('개발자용'), hint: t('기술 용어 · 수치 그대로') }, { value: 'nondev', label: t('비개발자용'), hint: t('쉬운 말 · 결과 중심') }, { value: 'company', label: t('회사 보고용'), hint: t('과제 · 업무명 · 기간만 간략히') }]} />
          </div>
          <div className="report-maker-row">
            <span className="muted">{t('프로젝트')}</span>
            <div className="report-maker-cats">
              {perCat.length ? perCat.map(([c, n]) => <span key={c} className={n ? 'chip' : 'chip off'}>{c} {n}</span>) : <span className="muted">{t('체크한 프로젝트가 없습니다')}</span>}
            </div>
          </div>
          <p className="muted small">{t('프로젝트는 작업 기록 탭 사이드바의 체크로 고릅니다. 고른 AI 가 work-history 스킬의 보고 형식으로 묶습니다.')}</p>
          {st.k === 'err' && <p className="err" role="alert">{st.error.message} {SETUP.has(st.error.code) && <button type="button" className="btn" onClick={onSettings}>{t('환경설정')}</button>}</p>}
          <div className="report-maker-actions">
            <button type="button" className="btn btn-primary" disabled={!picked.length} onClick={() => void make()}>{picked.length ? t('{n}건으로 만들기', { n: picked.length }) : t('그 주 기록이 없습니다')}</button>
          </div>
        </>
      )}
      {st.k === 'busy' && (
        <p className="report-maker-wait" role="status">
          <LoaderCircle size={16} className="spin" aria-hidden /> {t('AI 가 정리하는 중… {n}초', { n: st.secs })}
          <button type="button" className="btn" onClick={() => { void window.api.reports.cancel() }}>{t('취소')}</button>
        </p>
      )}
      {st.k === 'done' && (
        <>
          <div className="report" dangerouslySetInnerHTML={{ __html: md(st.text) }} />
          {st.exists && <p className="warn" role="alert">{t('{name} 보고가 이미 있습니다 — 덮어쓸까요?', { name })}</p>}
          <div className="report-maker-actions">
            <button type="button" className="btn" onClick={() => void make()}>{t('다시 만들기')}</button>
            {st.exists
              ? <button type="button" className="btn btn-primary" onClick={() => void save(st.text, true)}>{t('덮어쓰기')}</button>
              : <button type="button" className="btn btn-primary" onClick={() => void save(st.text, false)}>{t('저장')}</button>}
          </div>
        </>
      )}
    </section>
  )
}
