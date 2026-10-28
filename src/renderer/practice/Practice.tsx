import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react'
import { ArrowLeft, Play, Square } from 'lucide-react'
import { LANGS, LANG_LABEL, LANG_RUNNERS, type Attempt, type Hint, type Lang, type Problem, type Reflection, type RunResult, type SessionReport, type Stage, type Tools, type TheoryLog } from '../../shared/types.ts'
import { guessStage } from '../../shared/stage.ts'
import { countedMs } from '../../shared/nudgeTiming.ts'
import { useNudge } from './useNudge.ts'
import { EditorPane, type EditorReady } from './EditorPane.tsx'
import { PredictCard } from './PredictCard.tsx'
import { ProblemPanel, type PanelTab } from './ProblemPanel.tsx'
import { ResultPanel } from './ResultPanel.tsx'
import { nextLevel } from '../../shared/hintLevel.ts'
import { Theory } from '../theory/Theory.tsx'
import { sanitizeProblemHtml } from '../coding/sanitize.ts'
import { StageBar } from './StageBar.tsx'
import { Select } from '../shell/Select.tsx'
import { AfterPass, emptyReflection } from './AfterPass.tsx'
import { Report } from './Report.tsx'
import { ConfirmButton } from '../shell/ConfirmButton.tsx'
import { INTERVALS } from '../../shared/review.ts'
import { t } from '../../shared/i18n.ts'

const SPLIT_KEY = 'inkline-practice-split'
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const readSplit = (): number => {
  try { return clamp(Number(localStorage.getItem(SPLIT_KEY)) || 45, 30, 70) } catch { return 45 }
}

export function Practice({ problemId, mode = 'learn', home = false, onBack, onSettings }: { problemId: number; mode?: 'learn' | 'review'; home?: boolean; onBack: () => void; onSettings: () => void }) {
  const [p, setP] = useState<Problem | null>(null)
  const [att, setAtt] = useState<Attempt | null>(null)
  const [last, setLast] = useState<RunResult | null>(null)
  const [err, setErr] = useState('')
  const [cfg, setCfg] = useState<NudgeCfg | null>(null)
  useEffect(() => {
    let stale = false
    Promise.all([window.api.coding.get(problemId), window.api.settings.all()])
      .then(async ([prob, s]) => {
        if (!prob) throw new Error(t('문제를 찾지 못했습니다'))
        const a = await window.api.practice.start(problemId, s['coding.lang'], mode)
        const lr = await window.api.practice.lastRun(a.id).catch(() => null)
        if (!stale) { setP(prob); setAtt(a); setLast(lr); setCfg({ enabled: s['nudge.enabled'], quietMs: s['nudge.quietMs'], idleMs: s['nudge.idleMs'] }) }
      })
      .catch(e => { if (!stale) setErr(e instanceof Error ? e.message : String(e)) })
    return () => { stale = true }
  }, [problemId, mode])
  // 분류가 뒤에서 끝나면 칩을 새로 읽는다
  useEffect(() => window.api.coding.onChanged(() => {
    window.api.coding.get(problemId).then(x => { if (x) setP(x) }).catch(() => {})
  }), [problemId])
  if (err) return <p className="err coding-pad" role="alert">{err} <button type="button" className="btn" onClick={onBack}>{t('목록')}</button></p>
  if (!p || !att || !cfg) return <p className="muted coding-pad">{t('불러오는 중…')}</p>
  return <Solve p={p} att={att} review={mode === 'review'} home={home} last={last} cfg={cfg} onBack={onBack} onSettings={onSettings} />
}

type NudgeCfg = { enabled: boolean; quietMs: number; idleMs: number }

function Solve({ p, att, review, home, last, cfg, onBack, onSettings }: { p: Problem; att: Attempt; review: boolean; home: boolean; last: RunResult | null; cfg: NudgeCfg; onBack: () => void; onSettings: () => void }) {
  const id = att.id
  const [theoryOpen, setTheoryOpen] = useState(false)
  const [chosen, setChosen] = useState<TheoryLog | null>(null)
  const [tagsOk, setTagsOk] = useState(false)
  useEffect(() => { if (!theoryOpen) window.api.theory.chosen(att.id).then(setChosen).catch(() => {}) }, [att.id, theoryOpen])
  useEffect(() => { if (review) return; window.api.coding.statuses().then(s => setTagsOk(['passed', 'review', 'mastered'].includes(s[p.id]?.kind ?? ''))).catch(() => {}) }, [p.id, review])
  const problemHtml = useMemo(() => sanitizeProblemHtml(p.html), [p.html])
  const [phase, setPhase] = useState<'solve' | 'reflect' | 'report'>('solve')
  const [report, setReport] = useState<SessionReport | null>(null)
  const [refl, setRefl] = useState<Reflection>(emptyReflection)
  const [dismissed, setDismissed] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [doneErr, setDoneErr] = useState('')
  const finish = (passed: boolean, refl: Reflection | null): void => {
    flush() // 끝난 시도에는 시간을 더하지 않는다
    setBusy(true); setDoneErr('')
    window.api.practice.finish(id, passed, refl)
      .then(r => { setReport(r); setPhase('report') })
      .catch(e => setDoneErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }
  const giveUp = (): void => {
    flush()
    setBusy(true)
    window.api.practice.giveUp(id).then(onBack).catch(e => { setDoneErr(e instanceof Error ? e.message : String(e)); setBusy(false) })
  }
  const [lang, setLang] = useState<Lang>(att.lang)
  const codes = useRef<Partial<Record<Lang, string>>>({ ...att.code })
  const saved = useRef<Partial<Record<Lang, string>>>({ ...att.code })
  const first = (l: Lang): string => codes.current[l] ?? p.starter[l] ?? ''
  const [code, setCode] = useState(() => first(att.lang))
  const [stage, setStage] = useState<Stage>(att.stage)
  const [manual, setManual] = useState(false)
  const [predicted, setPredicted] = useState(att.predicted)
  const [result, setResult] = useState<RunResult | null>(last)
  const [runs, setRuns] = useState<{ passed: boolean }[]>(last ? [{ passed: last.passed }] : [])
  const [running, setRunning] = useState(false)
  const [split, setSplit] = useState(readSplit)
  const [resultH, setResultH] = useState(220)
  const [tab, setTab] = useState<PanelTab>('문제') // i18n-ok
  const [hints, setHints] = useState<Hint[]>([])
  const [loaded, setLoaded] = useState<'loading' | 'ok' | 'fail'>('loading')
  const [reload, setReload] = useState(0)
  const [fresh, setFresh] = useState(false) // 다른 탭을 보는 동안 새 힌트가 왔다
  useEffect(() => {
    let stale = false
    window.api.tutor.hints(id)
      .then(h => { if (stale) return; setHints(cur => [...h, ...cur.filter(c => !h.some(x => x.id === c.id))].sort((a, b) => a.level - b.level)); setLoaded('ok') })
      .catch(e => { console.error(e); if (!stale) setLoaded('fail') })
    return () => { stale = true }
  }, [id, reload])
  const tabRef = useRef(tab)
  tabRef.current = tab
  const seen = useRef<number | null>(null) // 불러온 직후의 개수가 기준 — 처음 불러온 힌트는 새 것이 아니다
  useEffect(() => {
    if (loaded !== 'ok') return
    if (seen.current !== null && hints.length > seen.current && tabRef.current !== '힌트') setFresh(true) // i18n-ok
    seen.current = hints.length
  }, [hints.length, loaded])
  useEffect(() => { if (tab === '힌트') setFresh(false) }, [tab]) // i18n-ok
  const seq = useRef(0)
  const touched = useRef(false) // 코드를 고치거나 실행하기 전에는 저장된 단계를 그대로 둔다
  const runningRef = useRef(false)
  const dragOff = useRef<(() => void) | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)

  // 단계에 머문 시간: 바뀔 때 · 떠날 때 · 30초마다 서버에 더한다
  const cur = useRef({ stage, since: Date.now() })
  const [openedAt] = useState(Date.now)
  const [lastActivity, setLastActivity] = useState(openedAt)
  const act = useRef(openedAt) // 편집 · 실행 · 언어 바꾸기. 멈춤(idleMs) 뒤에는 단계 시계도 세지 않는다
  const idleRef = useRef(cfg.idleMs)
  idleRef.current = cfg.idleMs
  const markActive = (): void => {
    const now = Date.now()
    if (now - act.current > idleRef.current) flush() // 멈춰 있던 시간은 이전 활동 기준으로 먼저 끊어 센다
    act.current = now
    setLastActivity(now)
  }
  const hidden = useRef(document.hidden) // 창이 가려진 동안은 시간을 세지 않는다
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const flush = useCallback((next?: Stage): void => {
    if (phaseRef.current !== 'solve') return // 풀이가 끝난 뒤의 시간은 세지 않는다
    const now = Date.now(), c = cur.current
    const ms = hidden.current ? 0 : clamp(countedMs({ since: c.since, now, lastActivity: act.current, idleMs: idleRef.current }), 0, 3_600_000)
    cur.current = { stage: next ?? c.stage, since: now }
    window.api.practice.stage(id, next ?? c.stage, { [c.stage]: ms }).catch(e => console.error(e))
  }, [id])
  const goStage = useCallback((s: Stage): void => { if (s !== cur.current.stage) { flush(s); setStage(s) } }, [flush])
  // 회고에서 '← 코드로' — 아직 finish 전이라 통과 표시(단계)만 되돌린다. 회고에 머문 시간은 세지 않는다
  const before = useRef<Stage>(stage)
  const backToCode = (): void => { phaseRef.current = 'solve'; cur.current.since = Date.now(); goStage(before.current); setPhase('solve') }
  useEffect(() => {
    const t = setInterval(() => flush(), 30_000)
    const vis = (): void => {
      if (document.hidden) { flush(); hidden.current = true } else { hidden.current = false; cur.current.since = Date.now() }
    }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); flush() }
  }, [flush])
  useEffect(() => () => { dragOff.current?.(); if (runningRef.current) window.api.practice.cancelRun().catch(() => {}) }, [])

  const persist = useCallback((l: Lang, c: string): void => {
    if (saved.current[l] === c) return
    saved.current[l] = c
    window.api.practice.save(id, l, c).catch(e => console.error('코드를 저장하지 못했습니다', e))
  }, [id])
  const latest = useRef({ lang, code })
  latest.current = { lang, code }
  useEffect(() => {
    const t = setTimeout(() => persist(lang, code), 1000)
    return () => clearTimeout(t)
  }, [lang, code, persist])
  useEffect(() => () => persist(latest.current.lang, latest.current.code), [persist])
  useEffect(() => {
    const on = (): void => { persist(latest.current.lang, latest.current.code); flush() }
    window.addEventListener('beforeunload', on)
    return () => window.removeEventListener('beforeunload', on)
  }, [persist, flush])

  useEffect(() => {
    if (!touched.current) return
    goStage(guessStage({ code, starter: p.starter[lang] ?? '', runs, current: cur.current.stage, manual }))
  }, [code, runs, manual, lang, p.starter, goStage])

  const edit = (c: string): void => { touched.current = true; markActive(); codes.current[lang] = c; setCode(c) }
  const switchLang = (l: Lang): void => {
    markActive()
    codes.current[lang] = code
    persist(lang, code)
    setLang(l)
    const next = first(l)
    setCode(next)
    saved.current[l] = next
    window.api.practice.save(id, l, next).catch(e => console.error(e))
    window.api.settings.set('coding.lang', l).catch(() => {})
  }

  const [ed, setEd] = useState<{ editor: EditorReady[0]; monaco: EditorReady[1] } | null>(null)
  useNudge({ editor: ed?.editor ?? null, monaco: ed?.monaco ?? null, attemptId: id, stage, enabled: cfg.enabled && !theoryOpen && !review && phase === 'solve', quietMs: cfg.quietMs, idleMs: cfg.idleMs, openedAt, lastActivity, code, blocked: predicted === null && stage === 'understand' && !!p.examples[0] })

  const [tools, setTools] = useState<Tools | null>(null)
  useEffect(() => { window.api.tools.detect().then(setTools).catch(() => {}) }, [])
  const missing = (l: Lang): boolean => !!tools && LANG_RUNNERS[l].some(id => !tools.runners.find(x => x.id === id)?.version)
  const [support, setSupport] = useState<{ lang: Lang; why: string | null } | null>(null)
  useEffect(() => {
    let stale = false
    window.api.practice.support(p.id, lang).then(why => { if (!stale) setSupport({ lang, why }) }).catch(() => {})
    return () => { stale = true }
  }, [p.id, lang])

  const shown = result && result.lang === lang ? result : null // 다른 언어의 결과는 지금 것이 아니다
  const reason = missing(lang)
    ? t('{lang} 실행기가 설치돼 있지 않습니다 — 설치한 뒤 환경설정에서 다시 탐지하세요', { lang: LANG_LABEL[lang] })
    : (support?.lang === lang ? support.why : null) ?? shown?.unsupported ?? null
  const [dismissedReason, setDismissedReason] = useState<Lang | null>(null)
  const band = !running && phase === 'solve' && (reason
    ? dismissedReason !== lang // 예제를 돌릴 수 없는 문제는 사이트 제출로만 통과를 확인한다
    : !!shown?.passed && !shown.compileError && dismissed !== shown)
  const run = (): void => {
    if (running || reason || phase !== 'solve') return
    markActive()
    const my = ++seq.current
    runningRef.current = true
    setRunning(true)
    window.api.practice.run(id, lang, code)
      .then(r => {
        if (my !== seq.current) return
        if (r.aborted) return
        touched.current = true
        setResult(r)
        if (!r.unsupported) setRuns(x => [...x, { passed: r.passed }])
      })
      .catch(e => console.error('실행하지 못했습니다', e))
      .finally(() => { if (my === seq.current) { runningRef.current = false; setRunning(false) } })
  }
  const stop = (): void => { seq.current++; runningRef.current = false; setRunning(false); window.api.practice.cancelRun().catch(() => {}) }
  const runRef = useRef(run)
  runRef.current = run

  const drag = (move: (e: globalThis.PointerEvent) => void, done?: () => void) => (e: PE) => {
    e.preventDefault()
    const off = (): void => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      dragOff.current = null
    }
    const up = (): void => { off(); done?.() }
    dragOff.current = off
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const dragSplit = drag(e => {
    const r = body.current?.getBoundingClientRect()
    if (r) setSplit(clamp(((e.clientX - r.left) / r.width) * 100, 30, 70))
  }, () => { try { localStorage.setItem(SPLIT_KEY, String(Math.round(splitRef.current))) } catch { /* 저장 못 해도 화면은 그대로 */ } })
  const splitRef = useRef(split)
  splitRef.current = split
  const dragH = drag(e => {
    const r = right.current?.getBoundingClientRect()
    if (r) setResultH(clamp(r.bottom - e.clientY, 80, r.height - 120))
  })

  return (
    <div className="practice">
      <header className="phead">
        <button type="button" className="btn" onClick={onBack}><ArrowLeft size={14} aria-hidden /> {home ? t('홈') : t('목록')}</button>
        <h1 title={p.title}>{p.title}</h1>
        {review && <span className="chip" title={t('복습은 이론 · 힌트 없이 스스로 풉니다')}>{t('복습')}</span>}{review && <span className="muted phead-note">{t('이론 · 힌트 없이 풀기')}</span>}
        <StageBar stage={stage} onPick={s => { touched.current = true; setManual(true); goStage(s) }} />
        {chosen?.approach && (
          <details className="approach-chip">
            <summary>{t('접근: {name}', { name: chosen.approach.name })}</summary>
            <div>{chosen.approach.complexity && <p>{chosen.approach.complexity}</p>}{chosen.approach.clue && <q>{chosen.approach.clue}</q>}</div>
          </details>
        )}
        <span className="phead-gap" />
        {!review && <button type="button" className="btn" disabled={phase !== 'solve'} onClick={() => setTheoryOpen(true)}>{t('이론 학습')}</button>}
        {!review && <button type="button" className="btn" disabled={phase !== 'solve'} onClick={() => { setTheoryOpen(false); setTab('힌트') }}>{t('힌트')}{loaded === 'ok' && <> · {nextLevel(hints) === null ? t('끝') : `L${nextLevel(hints)}`}</>}</button>}{/* i18n-ok — setTab 값은 탭 키 */}
        {review && phase === 'solve' && <ConfirmButton disabled={busy} confirm={INTERVALS[0] === 1 ? t('정말 포기 — 내일 다시 복습') : t('정말 포기 — {n}일 뒤 다시 복습', { n: INTERVALS[0] })} onConfirm={giveUp}>{t('포기')}</ConfirmButton>}
        {!theoryOpen && phase === 'solve' && <>
        <Select label={t('언어')} value={lang} onChange={switchLang} options={LANGS.map(l => ({ value: l, label: LANG_LABEL[l], disabled: missing(l), hint: missing(l) ? t('설치 안 됨') : undefined }))} />
        {running
          ? <button type="button" className="btn" onClick={stop}><Square size={14} aria-hidden /> {t('멈춤')}</button>
          : <button type="button" className={band ? 'btn' : 'btn btn-primary'} disabled={!!reason} title={reason ?? t('실행 (Cmd+Enter)')} onClick={run}><Play size={14} aria-hidden /> {t('실행')}</button>}
        </>}
      </header>
      <div className="pbody" ref={body} style={{ gridTemplateColumns: `${split}% 6px 1fr`, ...((theoryOpen || phase !== 'solve') && { display: 'none' }) }}>
        <ProblemPanel p={p} tab={tab} onTab={setTab} hint={{ attemptId: id, code, stage, hints, loaded, onRetry: () => { setLoaded('loading'); setReload(n => n + 1) }, onHints: setHints, onSettings }} fresh={fresh} review={review} tagsOk={tagsOk} />
        <div className="vsplit" role="separator" aria-orientation="vertical" aria-label={t('너비 조절')} onPointerDown={dragSplit} />
        <div className="pright" ref={right} style={{ gridTemplateRows: `1fr 6px ${resultH}px` }}>
          <div className="peditor">
            <EditorPane lang={lang} value={code} onChange={edit} onRun={() => runRef.current()} onReady={(editor, monaco) => setEd({ editor, monaco })} />
            {!review && predicted === null && stage === 'understand' && p.examples[0] && (
              <PredictCard args={p.examples[0].args} onDone={async t => { await window.api.practice.predict(id, t); setPredicted(t); ed?.editor.focus() }} />
            )}
          </div>
          <div className="hsplit" role="separator" aria-orientation="horizontal" aria-label={t('높이 조절')} onPointerDown={dragH} />
          <ResultPanel result={shown} running={running} p={p} predicted={predicted || null} reason={reason} band={band} review={review} busy={busy} stage={stage}
            onCasesChange={() => setResult(null)}
            onPass={() => { if (review) finish(true, null); else { before.current = cur.current.stage; goStage('reflect'); flush(); setPhase('reflect') } }}
            onNotYet={() => {
              if (review) return finish(false, null)
              if (reason) setDismissedReason(lang)
              else { setDismissed(shown); setManual(true); goStage('debug') } // 사이트에서 아직 — 회고가 아니라 고치는 중으로
            }} />
        </div>
      </div>
      {doneErr && <p className="err coding-pad" role="alert">{doneErr}</p>}
      {phase === 'reflect' && <AfterPass approach={chosen?.approach ?? null} busy={busy} v={refl} setV={setRefl} onBack={backToCode} onSkip={() => finish(true, null)} onSave={r => finish(true, r)} />}
      {phase === 'report' && report && <Report report={report} title={p.title} home={home} onDone={onBack} />}
      {theoryOpen && <Theory problemId={p.id} attemptId={id} problemHtml={problemHtml} onClose={() => setTheoryOpen(false)} onSettings={onSettings} />}
    </div>
  )
}
