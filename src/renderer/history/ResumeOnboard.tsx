import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, Plus, Search, Sparkles } from 'lucide-react'
import type { CvHead } from '../../shared/types.ts'
import { shrinkPhoto } from '../shell/photo.ts'
import { t } from '../../shared/i18n.ts'
import { roleEvidence } from './resume.ts'

// 이력서 온보딩 — 한 화면에 질문 하나: 이름 → 사진 → 연락처 → 경력 → 링크 → (저장) → 작업 기록 찾기 → 직무 고르기 → 초안 만들기 · 안내
// 기본 이력서가 없거나 이름이 비었을 때 뜨고, 도구줄 [기본 정보] 로 지금 값을 채워 다시 열 수 있다
type Step = 'name' | 'photo' | 'contact' | 'career' | 'links' | 'scan' | 'found' | 'roles' | 'none'
const MAX_ROLES = 3 // 직무별 이력서는 2~3 버전 — 이력서 자료 common/structure.md
type Ev = ReturnType<typeof roleEvidence>[number]
const ASK: Step[] = ['name', 'photo', 'contact', 'career', 'links']
// 이력서는 'YYYY.MM', 달 고르기 칸(type=month)은 'YYYY-MM'
const toMonth = (v: string): string => v.replace('.', '-')
const fromMonth = (v: string): string => v.replace('-', '.')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const url = (v: string): string => (v.trim() && !/^https?:\/\//.test(v.trim()) ? `https://${v.trim()}` : v.trim()) // github.com/x → https://github.com/x
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// 쓰던 온보딩 — 다른 탭에 다녀와도 이어서(기록을 찾던 중이었으면 링크 단계부터 다시). 닫거나 초안을 만들면 지운다
type Kept = { h: CvHead; step: Step; picked: string[]; found: { total: number; cats: [string, number][]; ev: Ev[] } }
let kept: Kept | null = null
export const keptOnboard = (): CvHead | null => kept?.h ?? null

export function ResumeOnboard({ initial, photo, have, onPhoto, onDraft, onClose, onSettings }: { initial: CvHead; photo: string; have: string[]; onPhoto: (p: string) => void; onDraft: (roles: string[]) => void; onClose: () => void; onSettings: () => void }) {
  const [h, setH] = useState<CvHead>(kept?.h ?? initial)
  const [step, setStep] = useState<Step>(kept ? (kept.step === 'scan' ? 'links' : kept.step) : 'name')
  const [err, setErr] = useState('')
  const [found, setFound] = useState<Kept['found']>(kept?.found ?? { total: 0, cats: [], ev: [] })
  const [personal, setPersonal] = useState<string[]>([]) // 개인 작업 프로젝트 — 칩을 눌러 바꾸고 바로 저장
  const entriesRef = useRef<Parameters<typeof roleEvidence>[0]>([])
  useEffect(() => { void window.api.settings.all().then(s => setPersonal(s['history.personal'])) }, [])
  const togglePersonal = (cat: string): void => {
    const next = personal.includes(cat) ? personal.filter(c => c !== cat) : [...personal, cat]
    setPersonal(next)
    void window.api.settings.set('history.personal', next)
    if (entriesRef.current.length) setFound(f => ({ ...f, ev: roleEvidence(entriesRef.current, next) }))
  }
  const [picked, setPicked] = useState<string[]>(kept?.picked ?? []) // 고른 직무(새로 만들 것)
  useEffect(() => { kept = { h, step, picked, found } }, [h, step, picked, found])
  const leave = (): void => { kept = null; onClose() }
  const [custom, setCustom] = useState('')
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { first.current?.focus() }, [step])
  useEffect(() => { setErr('') }, [h]) // 값을 고치면 안내를 지운다
  const set = (k: keyof CvHead) => (e: { target: { value: string } }) => setH(x => ({ ...x, [k]: e.target.value }))
  const at = ASK.indexOf(step)
  // 숫자 · 굵은 글자가 문장 가운데 들어가는 곳 — 번역문을 {n} · {b} 자리에서 나눠 끼운다
  const foundMsg = t('작업 기록 {n}건을 찾았어요').split('{n}')
  const noneMsg = t('작업 기록을 만들고 {b} 버튼을 눌러 보세요.').split('{b}')

  // 머리를 저장하고 작업 기록을 찾는다 — 찾는 모습이 보이게 최소 1.8초
  const finish = async (): Promise<void> => {
    setStep('scan')
    try {
      await window.api.resume.setHead({ ...h, github: url(h.github), portfolio: url(h.portfolio) })
      const [data] = await Promise.all([window.api.history.load(), new Promise(r => setTimeout(r, 1800))])
      const cats = new Map<string, number>()
      for (const e of data.entries) cats.set(e.category, (cats.get(e.category) ?? 0) + 1)
      entriesRef.current = data.entries
      setFound({ total: data.entries.length, cats: [...cats].sort((a, b) => b[1] - a[1]), ev: roleEvidence(data.entries, personal) })
      setStep(data.entries.length ? 'found' : 'none')
    } catch (e) { setErr(t('저장하지 못했습니다: {msg}', { msg: msg(e) })); setStep('links') }
  }
  const next = (e?: FormEvent): void => {
    e?.preventDefault()
    if (at < 0) return // 질문 단계가 아니면(직무 고르기 등) Enter 로 넘어가지 않는다
    setErr('')
    if (step === 'name' && (!h.name.trim() || /[#[\]]/.test(h.name))) return setErr(t('이름을 입력해 주세요(#, [ ] 는 쓸 수 없습니다)'))
    if (step === 'contact' && !EMAIL.test(h.email.trim())) return setErr(t('이메일 주소를 확인해 주세요'))
    if (step === 'contact' && !/^[0-9+\-() .]*$/.test(h.phone.trim())) return setErr(t('전화번호는 숫자와 - ( ) + 만 씁니다'))
    if (step === 'career' && h.company.trim()) {
      if (/[#[\]·]/.test(h.company)) return setErr(t('회사 이름에 # [ ] · 는 쓸 수 없습니다'))
      if (!h.start) return setErr(t('입사 연월을 골라 주세요'))
      if (h.end && h.end < h.start) return setErr(t('퇴사 연월이 입사 연월보다 앞입니다'))
    }
    if (step === 'links') return void finish()
    setStep(ASK[at + 1]!)
  }

  return (
    <section className="ob" aria-label={t('이력서 시작하기')}>
      {at >= 0 && (
        <div className="ob-top">
          <ol className="ob-dots" aria-label={t('{n} / {total} 단계', { n: at + 1, total: ASK.length })}>{ASK.map((s, i) => <li key={s} className={i <= at ? 'is-on' : ''} />)}</ol>
          <button type="button" className="btn btn-ghost" onClick={leave}>{t('나중에')}</button>
        </div>
      )}
      <form key={step} className="ob-step" onSubmit={next} noValidate>
        {step === 'name' && <>
          <h2>{t('이름을 입력해 주세요.')}</h2>
          <p className="muted">{t('이력서 맨 위에 크게 들어갑니다.')}</p>
          <input ref={first} className="ob-input" value={h.name} onChange={set('name')} maxLength={40} placeholder={t('홍길동')} aria-label={t('이름')} />
        </>}
        {step === 'photo' && <>
          <h2>{t('이력서에 첨부할 사진을 넣으세요.')}</h2>
          <p className="muted">{t('회사 양식에 사진란이 있을 때만 넣는 것을 권합니다. 이름 · 연락처 왼쪽에 들어가고, 나중에 환경설정에서 바꿀 수 있습니다.')}</p>
          <div className="ob-photo">
            {photo ? <img src={photo} alt={t('이력서 사진')} /> : <span className="ob-photo-empty" aria-hidden />}
            <label className="btn">
              {photo ? t('바꾸기') : t('사진 고르기')}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) shrinkPhoto(f).then(p => { onPhoto(p); return window.api.settings.set('resume.photo', p) }).catch(er => setErr(t('사진을 읽지 못했습니다: {msg}', { msg: msg(er) }))) }} />
            </label>
            {photo && <button type="button" className="btn" onClick={() => { onPhoto(''); void window.api.settings.set('resume.photo', '') }}>{t('빼기')}</button>}
          </div>
        </>}
        {step === 'contact' && <>
          <h2>{t('연락받을 이메일을 입력해 주세요.')}</h2>
          <p className="muted">{t('전화번호는 넣지 않아도 됩니다. 생년월일 · 주소는 받지 않습니다.')}</p>
          <input ref={first} className="ob-input" type="email" value={h.email} onChange={set('email')} maxLength={100} placeholder="name@example.com" aria-label={t('이메일')} />
          <input className="ob-input" type="tel" value={h.phone} onChange={set('phone')} maxLength={20} placeholder={t('전화번호 (선택)')} aria-label={t('전화번호')} />
        </>}
        {step === 'career' && <>
          <h2>{t('지금(또는 가장 최근) 다니는 회사를 알려 주세요.')}</h2>
          <p className="muted">{t('이력서 경력 칸에 들어가고, AI 초안이 프로젝트 소속을 채울 때 씁니다. 회사 경력이 없으면 건너뛰세요. 다른 경력은 나중에 이력서 파일에서 더할 수 있습니다.')}</p>
          <input ref={first} className="ob-input" value={h.company} onChange={set('company')} maxLength={40} placeholder={t('회사 이름')} aria-label={t('회사')} />
          <input className="ob-input" value={h.title} onChange={set('title')} maxLength={30} placeholder={t('직책 (선택, 예: 백엔드 개발자 · 팀장)')} aria-label={t('직책')} />
          <div className="ob-period">
            <label>{t('입사')} <input className="ob-input" type="month" value={toMonth(h.start)} onChange={e => setH(x => ({ ...x, start: fromMonth(e.target.value) }))} aria-label={t('입사 연월')} /></label>
            <label className="ob-now"><input type="checkbox" checked={!h.end} onChange={e => setH(x => ({ ...x, end: e.target.checked ? '' : x.start || fromMonth(new Date().toISOString().slice(0, 7)) }))} /> {t('재직 중')}</label>
            {h.end !== '' && <label>{t('퇴사')} <input className="ob-input" type="month" value={toMonth(h.end)} onChange={e => setH(x => ({ ...x, end: fromMonth(e.target.value) }))} aria-label={t('퇴사 연월')} /></label>}
          </div>
        </>}
        {step === 'links' && <>
          <h2>{t('GitHub · 포트폴리오 주소가 있으면 넣어 주세요.')}</h2>
          <p className="muted">{t('없으면 비워 두세요. 이력서에 빈칸으로 남지 않습니다.')}</p>
          <input ref={first} className="ob-input" value={h.github} onChange={set('github')} maxLength={200} placeholder={t('github.com/아이디')} aria-label={t('GitHub 주소')} />
          <input className="ob-input" value={h.portfolio} onChange={set('portfolio')} maxLength={200} placeholder={t('포트폴리오 주소 (선택)')} aria-label={t('포트폴리오 주소')} />
        </>}
        {step === 'scan' && (
          <div className="ob-scan" role="status">
            <span className="ob-radar" aria-hidden><Search size={26} /></span>
            <h2>{t('당신의 작업 기록을 찾고 있어요')}<span className="ob-ellipsis" aria-hidden /></h2>
          </div>
        )}
        {step === 'found' && (
          <div className="ob-scan">
            <span className="ob-radar is-done" aria-hidden><Sparkles size={26} /></span>
            <h2>{foundMsg[0]}<CountUp to={found.total} />{foundMsg[1]}</h2>
            <ul className="ob-cats">{found.cats.map(([c, n], i) => <li key={c} style={{ animationDelay: `${0.4 + i * 0.08}s` }}><button type="button" aria-pressed={personal.includes(c)} title={t('눌러서 회사 일 / 개인 작업을 바꿉니다')} onClick={() => togglePersonal(c)}>{c} <b className="num">{n}</b>{personal.includes(c) && <i>{t('개인')}</i>}</button></li>)}</ul>
            <p className="muted ob-cats-hint">{t("개인 작업인 프로젝트를 눌러 표시해 주세요 — 회사 경력과 가르고, 소속을 '개인'으로 씁니다.")}</p>
            <p className="muted">{t('다음으로 지원할 직무를 고르면, 기본 이력서 초안을 먼저 만들고 직무 이력서도 준비합니다.')}</p>
            <div className="ob-actions"><button type="button" className="btn" onClick={leave}>{t('나중에')}</button><button type="button" className="btn btn-primary" onClick={() => setStep('roles')}>{t('직무 고르기')}</button></div>
          </div>
        )}
        {step === 'roles' && <Roles ev={found.ev} have={have} picked={picked} setPicked={setPicked} custom={custom} setCustom={setCustom} onBack={() => setStep('found')} onDraft={() => { kept = null; onDraft(picked) }} />}
        {step === 'none' && (
          <div className="ob-scan">
            <span className="ob-radar is-done" aria-hidden><Search size={26} /></span>
            <h2>{t('아직 작업 기록이 없어요')}</h2>
            <p>{noneMsg[0]}<b>"{t('최신화')}"</b>{noneMsg[1]}</p>
            <p className="muted">{t('Claude Code · Codex 같은 AI 도구로 브랜치를 머지하거나 배포하면 work-history 스킬이 기록을 남깁니다. 다른 폴더에 기록이 있으면 환경설정에서 기록 폴더를 바꾸세요.')}</p>
            <div className="ob-actions"><button type="button" className="btn" onClick={onSettings}>{t('환경설정')}</button><button type="button" className="btn btn-primary" onClick={leave}>{t('이력서 보기')}</button></div>
          </div>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        {at >= 0 && (
          <div className="ob-actions">
            {at > 0 && <button type="button" className="btn btn-ghost" onClick={() => { setErr(''); setStep(ASK[at - 1]!) }}><ArrowLeft size={14} aria-hidden /> {t('이전')}</button>}
            {step === 'photo' && <button type="button" className={photo ? 'btn btn-primary' : 'btn'} onClick={() => next()}>{photo ? t('다음') : t('건너뛰기')}</button>}
            {step === 'career' && !h.company.trim() && <button type="button" className="btn" onClick={() => { setH(x => ({ ...x, title: '', start: '', end: '' })); setErr(''); setStep('links') }}>{t('건너뛰기')}</button>}
            {!(step === 'photo') && <button type="submit" className="btn btn-primary">{step === 'links' ? t('저장하고 기록 찾기') : t('다음')}</button>}
          </div>
        )}
      </form>
    </section>
  )
}

// 직무 고르기 — 카드마다 기록 근거(관련 기록 수 · 많이 쓴 기술). 근거가 많은 둘에 '기록이 많아요' 표시만 하고 미리 고르지 않는다
function Roles({ ev, have, picked, setPicked, custom, setCustom, onBack, onDraft }: { ev: Ev[]; have: string[]; picked: string[]; setPicked: (f: (p: string[]) => string[]) => void; custom: string; setCustom: (v: string) => void; onBack: () => void; onDraft: () => void }) {
  const [err, setErr] = useState('')
  const many = new Set([...ev].filter(r => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 2).map(r => r.slug))
  const full = picked.length >= MAX_ROLES
  const toggle = (slug: string): void => setPicked(p => (p.includes(slug) ? p.filter(x => x !== slug) : p.length >= MAX_ROLES ? p : [...p, slug]))
  const add = (): void => {
    const s = custom.trim().toLowerCase()
    if (!/^[a-z0-9-]{1,30}$/.test(s)) return setErr(t('영문 소문자 · 숫자 · - 로 써 주세요(파일 이름이 됩니다). 예: devops'))
    if (have.includes(s) || ev.some(r => r.slug === s)) return setErr(t('이미 있는 직무입니다'))
    setErr(''); setCustom(''); if (!picked.includes(s) && !full) setPicked(p => [...p, s])
  }
  const extra = picked.filter(s => !ev.some(r => r.slug === s))
  return (
    <>
      <h2>{t('어떤 직무로 지원하세요?')}</h2>
      <p className="muted">{t('여러 개 고를 수 있어요(최대 {n}개). 기록 근거는 참고용입니다 — 회사 일과 개인 작업이 섞여 셉니다.', { n: MAX_ROLES })}</p>
      <div className="ob-roles">
        {ev.map(r => {
          const own = have.includes(r.slug), on = own || picked.includes(r.slug)
          return (
            <button key={r.slug} type="button" className="ob-role" aria-pressed={on} disabled={own || (!on && full)} onClick={() => toggle(r.slug)}>
              <span className="ob-role-head"><b>{r.label}</b>{own ? <i>{t('이미 있어요')}</i> : many.has(r.slug) && <i className="is-many">{t('기록이 많아요')}</i>}<span className="ob-check" aria-hidden>{on && <Check size={12} />}</span></span>
              <small>{t('관련 기록 {n}건', { n: r.count })}{r.mine > 0 && t('(개인 {n})', { n: r.mine })}{r.top.length > 0 && ` · ${r.top.join(', ')}`}</small>
            </button>
          )
        })}
        {extra.map(s => <button key={s} type="button" className="ob-role" aria-pressed onClick={() => toggle(s)}><span className="ob-role-head"><b>{s}</b><span className="ob-check" aria-hidden><Check size={12} /></span></span><small>{t('직접 더한 직무')}</small></button>)}
      </div>
      <div className="ob-custom">
        <input className="ob-input" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} maxLength={30} placeholder={t('다른 직무 — 영문 소문자 (예: devops)')} aria-label={t('다른 직무')} disabled={full} />
        <button type="button" className="btn" onClick={add} disabled={full || !custom.trim()}><Plus size={14} aria-hidden /> {t('더하기')}</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="ob-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}><ArrowLeft size={14} aria-hidden /> {t('이전')}</button>
        <button type="button" className="btn btn-primary" onClick={onDraft}>{picked.length ? t('초안 만들기 · 기본 + 직무 {n}개', { n: picked.length }) : t('기본 이력서만 만들기')}</button>
      </div>
    </>
  )
}

// 0 에서 to 까지 0.9초 동안 올라가는 숫자
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return setN(to)
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number): void => { const k = Math.min(1, (t - t0) / 900); setN(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <b className="num">{n}</b>
}
