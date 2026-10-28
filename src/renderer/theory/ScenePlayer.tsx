import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Player } from '@remotion/player'
import { flatBeats, type Scene } from '../../shared/scene.ts'
import { SceneView, marked } from './scenes.tsx'
import { t } from '../../shared/i18n.ts'

const typing = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || !!el.closest('.monaco-editor'))

// 그림 옆 코드 — 박자마다 실행한 줄을 짚는다. 짚은 줄이 칸 밖이면 칸 안에서만 굴린다(쪽 전체는 굴리지 않는다)
function CodePane({ code, line }: { code: string; line: number }): React.ReactElement {
  const box = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const b = box.current, el = b?.querySelector<HTMLElement>('.on')
    if (!b || !el) return
    if (el.offsetTop < b.scrollTop || el.offsetTop + el.offsetHeight > b.scrollTop + b.clientHeight) b.scrollTop = el.offsetTop - b.clientHeight / 3
  }, [line])
  return (
    <pre className="theory-code" ref={box} aria-label={t('코드 — {n}번째 줄 실행', { n: line })}>
      {code.split('\n').map((l, i) => (
        <span key={i} className={i + 1 === line ? 'on' : undefined}><i aria-hidden>{i + 1}</i>{l || ' '}</span>
      ))}
    </pre>
  )
}

export function ScenePlayer({ scenes, onDone }: { scenes: Scene[]; onDone: () => void }): React.ReactElement | null {
  const flat = useMemo(() => flatBeats(scenes), [scenes])
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState<Record<number, number>>({})
  const root = useRef<HTMLDivElement>(null)
  const justPicked = useRef(false)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const cur = flat[at]
  const scene = scenes[cur?.scene]
  const beat = scene?.beats[cur?.beat]
  const inputProps = useMemo(() => ({ scene, beat: cur?.beat ?? 0 }), [scene, cur?.beat])

  useEffect(() => { setAt(0); setPicked({}) }, [scenes])
  useEffect(() => {
    if (justPicked.current && picked[at] !== undefined) { justPicked.current = false; nextBtn.current?.focus() }
  }, [picked, at])
  const blocked = !!beat?.predict && picked[at] === undefined
  const last = at === flat.length - 1

  const next = useCallback(() => {
    if (blocked) return
    if (last) onDone()
    else setAt(a => a + 1)
  }, [blocked, last, onDone])
  const prev = useCallback(() => setAt(a => Math.max(0, a - 1)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      if (e.metaKey || e.ctrlKey || e.altKey || !root.current || root.current.offsetParent === null || typing(e.target)) return
      e.preventDefault()
      if (e.key === 'ArrowLeft') prev()
      else next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  if (!cur || !scene || !beat) return null
  const p = beat.predict
  const choice = picked[at]
  return (
    <div className="theory" ref={root}>
      <div className={`theory-show${scene.code && beat.line ? ' has-code' : ''}`}>
      <div className="theory-stage">
        <Player
          key={`${cur.scene}-${cur.beat}`}
          component={SceneView}
          inputProps={inputProps}
          durationInFrames={24}
          fps={30}
          compositionWidth={960}
          compositionHeight={540}
          autoPlay
          controls={false}
          clickToPlay={false}
          loop={false}
          moveToBeginningWhenEnded={false} // 기본값은 끝나면 첫 프레임으로 되감아 새로 나타난 것이 다시 사라진다 — 끝 프레임에 멈춘다
          spaceKeyToPlayOrPause={false}
          numberOfSharedAudioTags={0} // 장면에 소리가 없다 — 박자마다 플레이어를 새로 만들어 오디오 스트림이 50개 한도를 넘던 것을 막는다
          acknowledgeRemotionLicense // 경고 문구만 끈다 — Remotion 라이선스 조건은 README '라이선스' 참고(큰 회사는 유료)
          style={{ width: '100%', aspectRatio: '16 / 9' }}
        />
      </div>
      {scene.code && beat.line && <CodePane code={scene.code} line={beat.line} />}
      </div>
      <p className="theory-caption">{marked(beat.caption, beat.highlight)}</p>
      {p && (
        <div className="theory-choices" role="group" aria-label={p.question}>
          <p className="theory-q"><span aria-hidden>Q.</span> {p.question}</p>
          {p.choices.map((c, i) => (
            <button key={i} type="button" className={`btn${choice === i ? ' picked' : ''}`} disabled={choice !== undefined} onClick={() => { justPicked.current = true; setPicked(s => ({ ...s, [at]: i })) }}>{c}</button>
          ))}
          {choice !== undefined && (
            <p className={`theory-result ${choice === p.answer ? 'ok' : 'bad'}`} role="status">
              {choice === p.answer ? t('맞아요.') : t('아쉬워요. 정답은 "{answer}" 입니다.', { answer: p.choices[p.answer] })}
            </p>
          )}
          {choice !== undefined && p.why && <p className="theory-why">{p.why}</p>}
          {choice !== undefined && choice !== p.answer && p.notes?.[choice] && <p className="theory-why">{p.notes[choice]}</p>}
        </div>
      )}
      <div className="theory-nav">
        <button type="button" className="btn" onClick={prev} disabled={at === 0}>{t('이전')}</button>
        <span className="theory-progress">{at + 1} / {flat.length}</span>
        <button ref={nextBtn} type="button" className="btn btn-primary" onClick={next} disabled={blocked}>{last ? t('계속') : t('다음')}</button>
      </div>
    </div>
  )
}
