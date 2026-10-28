import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, LoaderCircle } from 'lucide-react'
import { HINT_LABEL, STAGES, STAGE_LABEL, type AiError, type Hint, type Stage } from '../../shared/types.ts'
import { nextLevel } from '../../shared/hintLevel.ts'
import { Parsons } from './Parsons.tsx'
import { t } from '../../shared/i18n.ts'

const SETUP = new Set(['no-cli', 'not-installed', 'cli-error', 'busy'])
const STAGE_CHOICES = STAGES.filter(s => s !== 'reflect')

function CopyBtn({ text }: { text: string }) {
  const [bad, setBad] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const fail = (): void => { setBad(true); clearTimeout(timer.current); timer.current = setTimeout(() => setBad(false), 2000) }
  return (
    <>
      <button type="button" className="btn" onClick={() => { if (!navigator.clipboard?.writeText) fail(); else navigator.clipboard.writeText(text).catch(fail) }}><Copy size={14} aria-hidden /> {t('복사')}</button>
      {bad && <span className="err" role="alert"> {t('복사하지 못했습니다')}</span>}
    </>
  )
}

// AI 글 속 `이름` 은 코드 글꼴로(백틱을 그대로 보이지 않게)
const code = (s: string): ReactNode[] => s.split(/`([^`\n]+)`/).map((x, i) => (i % 2 ? <code key={i}>{x}</code> : x))

function Card({ h, onAnswer }: { h: Hint; onAnswer: (s: Stage) => void }) {
  const b = h.body
  return (
    <article className="hint-card">
      <h3>L{h.level} · {t(HINT_LABEL[h.level])}</h3>
      {b.kind === 'stage' && (
        <>
          <p>{b.question}</p>
          <div className="hint-stages">
            {STAGE_CHOICES.map(s => (
              <button key={s} type="button" className={`btn${b.answer === s ? ' btn-primary' : ''}`} aria-pressed={b.answer === s} onClick={() => onAnswer(s)}>{t(STAGE_LABEL[s])}</button>
            ))}
          </div>
        </>
      )}
      {b.kind === 'text' && b.text.split(/\n+/).map((x, i) => <p key={i}>{code(x)}</p>)}
      {b.kind === 'concept' && (
        <>
          <p><span className="chip">{b.concept}</span></p>
          <p>{code(b.text)}</p>
          <table className="hint-table"><tbody>{b.skeleton.map((r, i) => <tr key={i}><th scope="row">{t(r.label)}</th><td>{code(r.desc)}</td></tr>)}</tbody></table>
        </>
      )}
      {b.kind === 'pseudo' && (<><p>{code(b.text)}</p><pre className="val hint-code">{b.pseudo}</pre></>)}
      {b.kind === 'parsons' && <Parsons blocks={b.blocks} distractors={b.distractors} seed={h.id} />}
      {b.kind === 'snippet' && (
        <>
          <p>{code(b.note)}</p>
          <pre className="val hint-code">{b.snippet}</pre>
          <CopyBtn text={b.snippet} />
        </>
      )}
    </article>
  )
}

export function HintTab({ attemptId, code, stage, hints, loaded, visible, onRetry, onHints, onSettings }: {
  attemptId: number; code: string; stage: Stage; hints: Hint[]; loaded: 'loading' | 'ok' | 'fail'; visible: boolean; onRetry: () => void; onHints: (f: (h: Hint[]) => Hint[]) => void; onSettings: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ msg: string; setup: boolean } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const grew = useRef(hints.length)
  const pending = useRef(false) // 가려진 동안 도착한 힌트: 다시 보일 때 맨 아래로
  useEffect(() => {
    if (hints.length > grew.current) { if (visible) end.current?.scrollIntoView({ block: 'end' }); else pending.current = true }
    grew.current = hints.length
  }, [hints.length, visible])
  useEffect(() => { if (visible && pending.current) { pending.current = false; end.current?.scrollIntoView({ block: 'end' }) } }, [visible])
  const next = nextLevel(hints)
  const l0 = hints[0]?.body
  const needAnswer = next === 1 && l0?.kind === 'stage' && l0.answer === null
  const needSelf = next !== null && next >= 3
  const self = text.trim()
  const disabled = loaded !== 'ok' || busy || next === null || needAnswer || (needSelf && self.length < 5)
  const answer = (h: Hint, s: Stage): void => {
    window.api.tutor.answerStage(h.id, s)
      .then(() => onHints(l => l.map(x => x.id === h.id && x.body.kind === 'stage' ? { ...x, body: { ...x.body, answer: s } } : x)))
      .catch(e => setErr({ msg: e instanceof Error ? e.message : String(e), setup: false }))
  }
  const go = (): void => {
    setBusy(true); setErr(null)
    window.api.tutor.nextHint(attemptId, code, stage, needSelf ? self : null)
      .then(r => {
        if ('gate' in r) setErr({ msg: r.gate, setup: false })
        else if ('code' in r) setErr({ msg: (r as AiError).message, setup: SETUP.has((r as AiError).code) })
        else { setText(''); return window.api.tutor.hints(attemptId).then(fresh => onHints(() => fresh)) }
      })
      .catch(e => setErr({ msg: e instanceof Error ? e.message : String(e), setup: false }))
      .finally(() => setBusy(false))
  }
  return (
    <div className="hints">
      {loaded === 'fail' && <p className="err" role="alert">{t('힌트를 불러오지 못했습니다')} <button type="button" className="btn" onClick={onRetry}>{t('다시 불러오기')}</button></p>}
      {hints.length === 0 && loaded !== 'fail' && (
        <p className="muted hint-intro">{t('힌트는 한 단계씩 조금만 열립니다 — 지금 어디쯤인지 묻기 → 문제 다시 보기 → 질문 하나 → 쓸 개념 → 뼈대 → 순서 맞추기 → 핵심 코드. 3단계부터는 직전 힌트가 왜 필요했는지 한 줄을 적어야 다음으로 넘어갑니다. 힌트를 써도 점수가 깎이지 않습니다.')}</p>
      )}
      {hints.map(h => <Card key={h.id} h={h} onAnswer={s => answer(h, s)} />)}
      {needSelf && <label className="hint-self">{t('직전 힌트가 왜 필요했는지 한 줄로 적어 주세요 — 5자 이상 쓰면 다음 힌트 단추가 켜집니다')}
        <textarea className="field" rows={2} maxLength={500} value={text} disabled={busy} onChange={e => setText(e.target.value)} /></label>}
      {err && <p className="err" role="alert">{err.msg} {err.setup && <button type="button" className="btn" onClick={onSettings}>{t('환경설정')}</button>}</p>}
      <button type="button" className="btn btn-primary hint-next" disabled={disabled} onClick={go}>
        {busy ? <><LoaderCircle size={14} className="spin" aria-hidden /> {t('힌트를 만드는 중…')}</>
          : next === null ? t('힌트를 모두 받았습니다')
            : needAnswer ? t('먼저 위 질문에 답해 주세요')
              : t('다음 힌트 (L{n} · {label})', { n: next, label: t(HINT_LABEL[next]) })}
      </button>
      <div ref={end} />
    </div>
  )
}
