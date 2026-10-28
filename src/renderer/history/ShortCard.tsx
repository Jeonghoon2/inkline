import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Maximize2, Play, RotateCcw } from 'lucide-react'
import type { Concept, ShortJob } from '../../shared/types.ts'
import { shortUrl } from './render.ts'
import { t } from '../../shared/i18n.ts'

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// 상세 창의 쇼츠 — 세로 영상과 그 개념 설명을 한 카드에 나란히. 영상 칸만 검은 면이고 둘레는 테마 색이다.
// 누르기 전에는 제목이 뜬 1.5초 화면을 보여 준다(0초는 제목이 들어오기 전이라 빈 화면에 띠 글자만 보였다)
export function ShortCard({ name, concept }: { name: string; concept?: Concept }) {
  const v = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [len, setLen] = useState<number | null>(null)
  const play = (): void => {
    const el = v.current
    if (!el) return
    el.currentTime = 0
    setStarted(true)
    void el.play().catch(() => {})
  }
  return (
    <section className="d-short" aria-label={t('{name} — 60초 쇼츠', { name })}>
      <div className="d-short-v">
        <video ref={v} src={`${shortUrl(name)}#t=1.5`} preload="metadata" playsInline controls={started}
          aria-label={t('{name} 쇼츠 영상', { name })} onLoadedMetadata={ev => setLen(ev.currentTarget.duration)} />
        {!started && (
          <button className="d-short-play" type="button" aria-label={t('{name} 쇼츠 재생', { name })} onClick={play}>
            <span><Play size={22} fill="currentColor" aria-hidden /></span>
          </button>
        )}
      </div>
      <div className="d-short-t">
        <p className="d-short-k">{t('60초 쇼츠')}{len ? <> · <span className="num">{clock(len)}</span></> : null}</p>
        <h3>{name}</h3>
        {concept && <p className="d-short-why">{concept.why.split('\n')[0]}</p>}
        <div className="d-short-act">
          <button className="btn" type="button" onClick={play}>
            {started ? <RotateCcw size={14} aria-hidden /> : <Play size={14} fill="currentColor" aria-hidden />}{started ? t('처음부터') : t('재생')}
          </button>
          <button className="btn" type="button" onClick={() => void v.current?.requestFullscreen().catch(() => {})}>
            <Maximize2 size={14} aria-hidden />{t('크게 보기')}
          </button>
        </div>
      </div>
    </section>
  )
}

// 만드는 중인 쇼츠 — 상세 창 하나가 구독한다. 다 된 영상은 기록 폴더 감시로 shorts 에 들어와 ShortCard 로 바뀐다
export function useShortJobs(): Record<string, ShortJob> {
  const [jobs, setJobs] = useState<Record<string, ShortJob>>({})
  useEffect(() => {
    const load = (): void => void window.api.shorts.jobs().then(setJobs).catch(() => {})
    load()
    return window.api.shorts.onChanged(load)
  }, [])
  return jobs
}

// 쇼츠가 없는 개념 — 면접 꼬리 질문 카드 머리에 둔다(기록 사이트와 같은 자리)
export function MakeShort({ name, job }: { name: string; job?: ShortJob }) {
  const [err, setErr] = useState('')
  const make = (): void => { setErr(''); window.api.shorts.make(name).catch((e: Error) => setErr(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))) }
  const busy = job?.state === 'queued' || job?.state === 'running'
  const state = job?.state === 'queued' ? t('앞 편이 끝나기를 기다리는 중') : job?.state === 'running' ? job.step : job?.state === 'done' ? t('다 만들었어요 — 곧 위에 나와요') : ''
  const fail = err || (job?.state === 'failed' ? t('만들지 못했어요: {error}', { error: job.error }) : '')
  return (
    <div className="mk-short">
      <span className={fail ? 'mk-short-s is-fail' : 'mk-short-s'} role="status">{busy && <i className="mk-dot" aria-hidden />}{fail || state}</span>
      {!busy && job?.state !== 'done' && (
        <button className="btn" type="button" onClick={make} title={t('대본 · 음성 · 영상을 만들어요(몇 분, Claude 사용량이 조금 들어요)')}>
          <Clapperboard size={14} aria-hidden />{fail ? t('다시 만들기') : t('60초 쇼츠 만들기')}
        </button>
      )}
    </div>
  )
}
