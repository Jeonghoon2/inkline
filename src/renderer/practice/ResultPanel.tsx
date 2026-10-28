import { useEffect, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, CircleX, Timer } from 'lucide-react'
import { STAGE_LABEL, type CustomCase, type ExampleResult, type Problem, type RunResult, type RunStatus, type Stage } from '../../shared/types.ts'
import { STAGE_GUIDE } from './stageGuide.ts'
import { t } from '../../shared/i18n.ts'

const ICON = { pass: CircleCheck, fail: CircleX, error: CircleAlert, timeout: Timer }
const NAME: Record<RunStatus, string> = { pass: '통과', fail: '실패', error: '오류', timeout: '시간 초과' } // i18n-ok — 보일 때 t()
const TOO_BIG = '(결과가 너무 커서 생략했습니다)' // i18n-ok — 실행기가 넣는 표지와 비교한다
// 문자열도 JSON(따옴표)으로 — 끝 공백이 보이게
const show = (v: unknown): string => (v === TOO_BIG ? t(TOO_BIG) : JSON.stringify(v) ?? String(v))

// 앞뒤로 같은 부분을 빼고 가운데 다른 부분만 강조한다
function Diff({ a, b }: { a: string; b: string }): ReactNode {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  let j = 0
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
  const mid = a.slice(i, a.length - j)
  return <>{a.slice(0, i)}{mid && <mark>{mid}</mark>}{a.slice(a.length - j)}</>
}

function Detail({ r, args, predicted }: { r: ExampleResult; args: unknown[]; predicted: string | null }) {
  const exp = show(r.expected), act = show(r.actual)
  return (
    <div className="rdetail">
      {r.stderr && r.status === 'error' && <><p className="muted">{t('오류')}</p><pre className="val err">{r.stderr}</pre></>}
      <p className="muted">{t('입력')}</p><pre className="val">{JSON.stringify(args)}</pre>
      <p className="muted">{t('기대값')}{r.index === 0 && predicted ? <span> · {t('내 예측: {value}', { value: predicted })}</span> : null}</p><pre className="val">{exp}</pre>
      {r.status !== 'timeout' && <><p className="muted">{t('내 값')}</p><pre className="val">{r.status === 'fail' && act !== t(TOO_BIG) ? <Diff a={act} b={exp} /> : r.status === 'pass' ? act : '-'}</pre></>}
      {r.status === 'timeout' && <p className="err">{t('시간 초과 ({ms}ms)', { ms: r.ms })}</p>}
      {r.stdout && <><p className="muted">{t('출력')}</p><pre className="val">{r.stdout}</pre></>}
      {r.stderr && r.status !== 'error' && <><p className="muted">{t('오류')}</p><pre className="val err">{r.stderr}</pre></>}
    </div>
  )
}

function CaseForm({ p, onSaved, onCancel }: { p: Problem; onSaved: () => void; onCancel: () => void }) {
  const [args, setArgs] = useState(''), [exp, setExp] = useState(''), [err, setErr] = useState<string | null>(null)
  const save = async (): Promise<void> => {
    let a: unknown, e: unknown
    try { a = JSON.parse(args) } catch { return setErr(t('입력이 JSON 이 아닙니다 — 예: [1, 2]')) }
    try { e = JSON.parse(exp) } catch { return setErr(t('기대값이 JSON 이 아닙니다 — 문자열은 "abc" 처럼 따옴표로 씁니다')) }
    if (!Array.isArray(a)) return setErr(t('입력은 인자를 담은 배열이어야 합니다 — 예: [1, 2]'))
    try { await window.api.practice.addCase(p.id, a, e); onSaved() } catch (x) { setErr((x as Error).message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')) }
  }
  return (
    <div className="rdetail">
      <label className="muted" htmlFor="case-args">{t('입력 (인자를 담은 JSON 배열)')}</label>
      <textarea id="case-args" className="val" rows={2} value={args} placeholder={JSON.stringify(p.examples[0]?.args ?? [])} onChange={ev => setArgs(ev.target.value)} />
      <label className="muted" htmlFor="case-exp">{t('기대값 (JSON)')}</label>
      <textarea id="case-exp" className="val" rows={2} value={exp} placeholder={JSON.stringify(p.examples[0]?.expected ?? null)} onChange={ev => setExp(ev.target.value)} />
      {err && <p className="err" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary" onClick={() => { void save() }}>{t('저장')}</button>
      <button type="button" className="btn" onClick={onCancel}>{t('취소')}</button>
    </div>
  )
}

export function ResultPanel({ result, running, p, predicted, reason, band, review, busy, stage, onPass, onNotYet, onCasesChange }: { result: RunResult | null; running: boolean; p: Problem; predicted: string | null; reason: string | null; band: boolean; review: boolean; busy: boolean; stage: Stage; onPass: () => void; onNotYet: () => void; onCasesChange: () => void }) {
  const [pick, setPick] = useState(0)
  const [cases, setCases] = useState<CustomCase[]>([])
  const [adding, setAdding] = useState(false)
  const [rmErr, setRmErr] = useState('')
  const reload = (): void => { window.api.practice.cases(p.id).then(setCases).catch(() => {}) }
  useEffect(reload, [p.id])
  const addBtn = (
    <button type="button" className="btn" onClick={() => setAdding(true)}>+ {t('내 예제')}{cases.length ? ` (${cases.length})` : ''}</button>
  )
  const form = adding && <CaseForm p={p} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); onCasesChange() }} />
  const bandEl = band && (
    <div className="rpass">
      <span>{reason ? t('사이트에 제출해 통과했나요?') : t('모든 예제를 통과했습니다 — 사이트에 제출해 통과했나요?')}</span>
      <a href={p.url} target="_blank" rel="noreferrer">{t('사이트 열기')}</a>
      <button type="button" className="btn" disabled={busy} onClick={onNotYet}>{review ? t('아직 — 내일 다시') : t('아직')}</button>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onPass}>{t('통과')}</button>
    </div>
  )
  let body: ReactNode
  if (running) body = <p className="muted">{t('예제 {n}개를 실행하는 중… 무한 반복이면 예제마다 제한 시간(환경설정 · 코드 실행)만큼 기다립니다. [멈춤]으로 바로 끝낼 수 있습니다.', { n: p.examples.length + cases.length })}</p>
  else if (reason) body = <><p className="muted">{reason}</p>{bandEl}</>
  else if (!result) body = <><p className="muted">{t('▶ 실행으로 예제를 돌려 봅니다')}</p>{!adding && addBtn}{form}</>
  else if (result.compileError) body = <pre className="val err">{result.compileError}</pre>
  else {
    const shown = result.results.filter(x => !x.custom || cases.some(c => c.id === x.custom!.id)) // 지운 내 예제는 숨긴다
    const r = shown.find(x => x.index === pick) ?? shown[0]
    body = (
      <>
        {bandEl}
        <div className="rtabs" role="tablist">
          {shown.map(x => {
            const Icon = ICON[x.status]
            return (
              <button key={x.index} type="button" role="tab" aria-selected={x === r} className={`rtab ${x.status}`} onClick={() => setPick(x.index)}>
                <Icon size={14} aria-hidden /> {x.custom ? t('내 예제 {n}', { n: shown.filter(y => y.custom && y.index <= x.index).length }) : t('예제 {n}', { n: x.index + 1 })}<span className="sr">{t(NAME[x.status])}</span>
              </button>
            )
          })}
          {!adding && addBtn}
        </div>
        {form}
        {r && !adding && <Detail r={r} args={r.custom?.args ?? p.examples[r.index]?.args ?? []} predicted={predicted} />}
        {r?.custom && !adding && <button type="button" className="btn" onClick={() => { setRmErr(''); window.api.practice.removeCase(r.custom!.id).then(() => { reload(); onCasesChange() }, (x: unknown) => setRmErr(t('지우지 못했습니다: {msg}', { msg: x instanceof Error ? x.message : String(x) }))) }}>{t('삭제')}</button>}
        {rmErr && <p className="err" role="alert">{rmErr}</p>}
      </>
    )
  }
  // 지금 단계에서 할 일(멈춤 넛지는 편집기 안 띠). 복습은 도움 없이 푼다
  const guide = !review && !running && STAGE_GUIDE[stage]
  return (
    <section className="rpanel" aria-label={t('실행 결과')}>
      {guide && <p className="rguide"><span className="rguide-stage">{t(STAGE_LABEL[stage])}</span>{t(guide)}</p>}
      {body}
    </section>
  )
}
