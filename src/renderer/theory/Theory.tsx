import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BadgeCheck, FlaskConical, History, ListChecks, PenLine, PencilRuler, Ruler, SearchCheck, Terminal } from 'lucide-react'
import { StageFlow, type FlowState, type StageNode } from '../shell/StageFlow.tsx'
import type { AiError, Approach, ConceptRef, Limits, Nature, SceneSet } from '../../shared/types.ts'
import { ScenePlayer } from './ScenePlayer.tsx'
import { locale, t } from '../../shared/i18n.ts'

type Step = 'pick' | 'concept' | 'map' | 'explain'
type Res =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'err'; error: AiError }
  | { k: 'scenes'; set: SceneSet; fam: boolean }
type ApRes = { k: 'loading' } | { k: 'err'; error: AiError } | { k: 'ok'; list: Approach[] }

const NATURE: Record<Nature, string> = { algorithm: '알고리즘', datastructure: '자료구조', hybrid: '혼합' } // i18n-ok — 보일 때 t()
const STEP_NAME: Record<Step, string> = { pick: '접근 고르기', concept: '이론', map: '이 문제에 연결', explain: '자기설명' } // i18n-ok — 보일 때 t()
// 이론 장면 만들기 단계 — main(theory/pipeline)이 알린다. 개념: 설계 → 실행 검산 → 장면 쓰기 → 품질 검사 → 학습 점검 / 문제 연결: 쓰기 → 품질 → 점검
// 글은 그릴 때 t() 로 — 모듈 맨 위에서 부르면 언어가 정해지기 전이다
const nodes = (): Record<string, StageNode> => ({
  design: { icon: PencilRuler, title: t('설계'), sub: t('용어 · 예시 · 진행 코드'), ai: true },
  exec: { icon: Terminal, title: t('실행 검산'), sub: t('진행 상태를 실제로 실행'), ai: false },
  write: { icon: PenLine, title: t('장면 쓰기'), sub: t('자막 · 예측 질문'), ai: true },
  quality: { icon: SearchCheck, title: t('품질 검사'), sub: t('질문 간격 · 답 새는지'), ai: false },
  check: { icon: BadgeCheck, title: t('학습 점검'), sub: t('처음 배우는 사람 눈으로'), ai: true },
  // 접근 찾기 — 제약 읽기 → 비슷한 문제 → 후보 쓰기 → 규칙 · 단서 대조 → 실행 검산
  'a-limits': { icon: Ruler, title: t('제약 읽기'), sub: t('입력 크기 → 허용 시간 복잡도'), ai: false },
  'a-similar': { icon: History, title: t('비슷한 문제'), sub: t('예전에 푼 같은 유형'), ai: false },
  'a-write': { icon: PenLine, title: t('후보 쓰기'), sub: t('복잡도 · 문제 글 속 단서'), ai: true },
  'a-rules': { icon: ListChecks, title: t('규칙 · 단서 대조'), sub: t('단서가 글에 있나 · 허용 복잡도 · 같은 개념'), ai: false },
  'a-exec': { icon: FlaskConical, title: t('실행 검산'), sub: t('참고 풀이 ↔ 단순 풀이를 예제 · 무작위 입력으로'), ai: true }
})
const LAYERS = {
  concept: [['design'], ['exec'], ['write'], ['quality'], ['check']],
  map: [['write'], ['quality'], ['check']],
  approach: [['a-limits'], ['a-similar'], ['a-write'], ['a-rules'], ['a-exec']]
}
const SETUP = new Set(['no-cli', 'not-installed', 'busy'])
const fail = (e: unknown): AiError => ({ code: 'cli-error', message: e instanceof Error ? e.message : String(e) })

export function Theory({ problemId, attemptId, problemHtml, onClose, onSettings }: { problemId: number; attemptId: number; problemHtml: string; onClose: () => void; onSettings: () => void }) {
  const [step, setStep] = useState<Step>('pick')
  const [ap, setAp] = useState<Approach | null>(null)
  const [ci, setCi] = useState(0)
  const [explain, setExplain] = useState('')
  const [res, setRes] = useState<Res>({ k: 'idle' })
  const [flow, setFlow] = useState<FlowState>({}) // 장면 만들기 단계
  const [apRes, setApRes] = useState<ApRes>({ k: 'loading' })
  const [apFlow, setApFlow] = useState<FlowState>({}) // 접근 찾기 단계
  const [apReq, setApReq] = useState({ n: 0, refresh: false }) // [다시 분석]은 refresh, [다시 시도]는 바로 전 요청 그대로
  const [limits, setLimits] = useState<Limits | null>(null)
  const [pickErr, setPickErr] = useState('')
  useEffect(() => window.api.theory.onStage(st => {
    const put = (p: FlowState): FlowState => ({ ...p, [st.stage]: { state: st.state, note: st.note, at: st.state === 'on' ? Date.now() : p[st.stage]?.at ?? Date.now() } })
    if (st.stage.startsWith('a-')) setApFlow(put); else setFlow(put)
  }), [])
  const [nonce, setNonce] = useState(0)
  const [open, setOpen] = useState(false) // 요약 카드에서 장면 펼치기
  const seq = useRef(0)
  const force = useRef(false)
  const concepts = ap?.concepts ?? []
  const cur: ConceptRef | undefined = step === 'map' ? concepts[concepts.length - 1] : concepts[ci]
  const ticking = apRes.k === 'loading' || res.k === 'loading'
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!ticking) return; const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [ticking])

  useEffect(() => () => { window.api.theory.cancel().catch(() => {}) }, [])
  useEffect(() => { window.api.theory.limits(attemptId).then(setLimits).catch(() => {}) }, [attemptId])

  // 접근 찾기 — 들어오자마자 시작한다
  useEffect(() => {
    let live = true
    setApRes({ k: 'loading' }); setApFlow({})
    window.api.theory.approaches(attemptId, apReq.refresh)
      .then(r => { if (live) setApRes(r.ok ? { k: 'ok', list: r.list } : { k: 'err', error: r.error }) })
      .catch(e => { if (live) setApRes({ k: 'err', error: fail(e) }) })
    return () => { live = false }
  }, [attemptId, apReq])

  useEffect(() => {
    if (step !== 'concept' && step !== 'map') { setRes({ k: 'idle' }); return }
    if (!cur) return
    const n = ++seq.current
    const refresh = force.current
    force.current = false
    setRes({ k: 'loading' }); setOpen(false); setFlow({})
    const stale = (): boolean => n !== seq.current
    const back = (e: AiError): void => {
      if (e.code !== 'aborted') { setRes({ k: 'err', error: e }); return }
      setRes({ k: 'idle' })
      if (step === 'concept') { if (ci > 0) setCi(ci - 1); else setStep('pick') } else { setCi(concepts.length - 1); setStep('concept') }
    }
    const api = window.api.theory
    api.scenes(attemptId, cur, step === 'map' ? 'map' : 'theory', '', refresh)
      .then(async r => {
        if (stale()) return
        if (!r.ok) return back(r.error)
        const fam = step === 'concept' && (await api.familiar(attemptId, cur.tag).catch(() => 0)) >= 2
        if (!stale()) setRes({ k: 'scenes', set: r.set, fam })
      })
      .catch(e => { if (!stale()) back(fail(e)) })
    return () => { seq.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ci, nonce])

  const saved = useRef(false)
  const finish = (): void => {
    saved.current = true
    window.api.theory.log(attemptId, explain).catch(() => {}).finally(onClose)
  }
  const close = (): void => { window.api.theory.cancel().catch(() => {}); onClose() }
  // 자기설명을 적다가 어디로 나가든('← 풀이로' · 힌트 · 목록 · 다른 탭) 적은 글은 남긴다
  const live = useRef({ step, explain })
  live.current = { step, explain }
  useEffect(() => () => {
    const { step: s, explain: e } = live.current
    if (!saved.current && s === 'explain' && e.trim()) window.api.theory.log(attemptId, e).catch(() => {})
  }, [attemptId])
  const choose = async (i: number, a: Approach): Promise<void> => {
    setPickErr('')
    try {
      await window.api.theory.choose(attemptId, { index: i, own: '', name: a.name })
      setAp(a); setCi(0); setStep('concept')
    } catch (e) { setPickErr(fail(e).message) }
  }
  const nextConcept = (): void => {
    if (ci + 1 < concepts.length) setCi(ci + 1)
    else setStep('map')
  }
  const reload = (refresh: boolean): void => { force.current = refresh; setNonce(n => n + 1) }
  const reAnalyze = (refresh: boolean): void => setApReq(r => ({ n: r.n + 1, refresh }))
  const cancelLoad = (): void => { window.api.theory.cancel().catch(() => {}) } // 요청이 'aborted' 로 끝나면 이전 단계로

  const loading = res.k === 'loading'
  const apErr = step === 'pick' && apRes.k === 'err' ? apRes.error : null
  const err = apErr ?? (res.k === 'err' ? res.error : null)
  const playing = (step === 'concept' || step === 'map') && res.k === 'scenes' && (step === 'map' || !res.fam || open)
  const NODE = nodes()
  const apFlowView = <div className="theory-flow"><StageFlow nodes={NODE} layers={LAYERS.approach} flow={apFlow} now={now} label={t('접근 찾기 진행')} /></div>

  return (
    <section className="theory theory-root" aria-label={t('이론 학습')}>
      <div className="theory-head">
        <button type="button" className="btn" onClick={close}><ArrowLeft size={14} aria-hidden /> {t('풀이로')}</button>
        <h2 className="theory-title">{t(STEP_NAME[step])}{step === 'concept' && cur ? ` · ${cur.name}` : ''}</h2>
        <span className="phead-gap" />
        {playing && <button type="button" className="btn" onClick={() => reload(true)}>{t('다시 만들기')}</button>}
      </div>

      {loading && (
        <>
          <div className="theory-flow"><StageFlow nodes={NODE} layers={step === 'map' ? LAYERS.map : LAYERS.concept} flow={flow} now={now} label={step === 'map' ? t('연결 장면 만들기 진행') : t('이론 장면 만들기 진행')} /></div>
          <div className="theory-wait"><button type="button" className="btn" onClick={cancelLoad}>{t('취소')}</button></div>
        </>
      )}

      {err && (
        <p className="err" role="alert">{err.message} {SETUP.has(err.code)
          ? <button type="button" className="btn" onClick={onSettings}>{t('환경설정')}</button>
          : <button type="button" className="btn" onClick={() => (apErr ? reAnalyze(apReq.refresh) : reload(false))}>{t('다시 시도')}</button>}</p>
      )}

      {step === 'pick' && (
        <>
          <div className="theory-limits">
            {limits?.source === 'text' ? <p><strong>{t('입력 크기')}</strong> N ≤ {limits.n?.toLocaleString(locale())} → {t('{limit} 이하로 풀어야 해요', { limit: limits.allowed ?? '' })}</p>
              : limits?.source === 'ai' ? <p className="muted">{t('입력 크기 (추정)')} {limits.note}</p> : null}
            {limits?.lines.length ? <ul>{limits.lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
          </div>
          <details className="theory-problem"><summary>{t('문제 보기')}</summary><div className="problem-body" dangerouslySetInnerHTML={{ __html: problemHtml }} /></details>
        </>
      )}

      {step === 'pick' && apRes.k === 'loading' && apFlowView}
      {step === 'pick' && apRes.k === 'ok' && (
        <>
          <div className="theory-cards">
            {apRes.list.map((a, i) => (
              <button key={`${i}-${a.name}`} type="button" className="theory-card" onClick={() => void choose(i, a)}>
                <span className="theory-card-top"><span className="chip">{t(NATURE[a.nature])}</span>{a.complexity && <span className="chip">{a.complexity}</span>}{a.check?.status === 'pass' && <span className="chip ok" title={t('참고 풀이를 예제 · 무작위 입력으로 확인했어요')}>{t('실행 확인')}</span>}{a.check?.status === 'unknown' && <span className="chip" title={a.check.why}>{t('확인 못 함')}</span>}</span>
                <strong>{a.name}</strong>
                {a.clue && <q className="theory-clue">{a.clue}</q>}
                <span>{a.why}</span>
                <span className="theory-concepts">{a.concepts.map(c => c.name).join(' · ')}</span>
              </button>
            ))}
          </div>
          {pickErr && <p className="err" role="alert">{pickErr}</p>}
          <div><button type="button" className="btn" onClick={() => reAnalyze(true)}>{t('다시 분석')}</button></div>
        </>
      )}

      {step === 'concept' && res.k === 'scenes' && res.fam && !open && cur && (
        <article className="hint-card">
          <h3>{t('{name} — 이미 두 번 이상 풀어 본 유형이에요', { name: cur.name })}</h3>
          {res.set.summary.length ? <ul>{res.set.summary.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p>{cur.name}</p>}
          <div className="theory-nav">
            <button type="button" className="btn" onClick={nextConcept}>{t('건너뛰기')}</button>
            <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{t('장면 펼쳐 보기')}</button>
          </div>
        </article>
      )}

      {playing && res.k === 'scenes' && (
        <ScenePlayer scenes={res.set.scenes} onDone={step === 'map' ? () => setStep('explain') : nextConcept} />
      )}

      {step === 'explain' && (
        <>
          <label className="hint-self">{t('이 문제에 이 개념을 어떻게 쓸지 자기 말로 적어 보세요')}
            <textarea className="field" rows={4} maxLength={500} value={explain} onChange={e => setExplain(e.target.value)} /></label>
          <div className="theory-nav">
            <span />
            <button type="button" className="btn btn-primary" onClick={finish}>{t('편집기로 돌아가기')}</button>
          </div>
        </>
      )}
    </section>
  )
}
