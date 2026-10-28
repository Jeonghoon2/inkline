import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronRight, Play, X } from 'lucide-react'
import type { Concept, Entry } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'
import { esc, hl, krefs, md, toDay, weekday } from './render.ts'
import { MakeShort, ShortCard, useShortJobs } from './ShortCard.tsx'
import { Badge } from './Badge.tsx'
import { ConceptTip } from './ConceptTip.tsx'

const SECTIONS = ['수행 일지', '고민한 흔적', '성능 비교/평가/측정'] // i18n-ok — 기록의 '#### 섹션' 이름. 제목은 t() 로 보인다
const TROUBLE_SECTIONS = ['상황', '문제', '해결 과정', '고민한 흔적', '성능 비교/평가/측정'] // i18n-ok 트러블슈팅은 상황 → 문제 → 해결 순

interface Props {
  entries: Entry[]
  concepts: Record<string, Concept>
  keysOf: string[][] // 기록마다 칠한 개념
  shown: number[] // 지금 거르기 순서의 기록 번호
  shorts: Set<string>
  index: number | null
  onOpen: (i: number) => void
  onPick: (kind: 'cat' | 'tag', value: string) => void // 분류 · 프로젝트로 거르고 닫는다
  onClose: () => void
  onKnowledge: (key: string) => void // 글 속 (지식사전: …) 를 누르면 지식사전 탭의 그 항목
}

// 기록 상세 — 기사형 본문(라벨 · 제목 · 요약 · 섹션 · 면접 꼬리 질문) + 오른쪽 칸(날짜 · 프로젝트 · 개념 · 같은 날 기록 · 이전/다음)
export function Detail({ entries, concepts, keysOf, shown, shorts, index, onOpen, onPick, onClose, onKnowledge }: Props) {
  const dlg = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const jobs = useShortJobs()
  const e = index === null ? undefined : entries[index]

  const id = e ? `${e.date}|${e.category}|${e.title}` : null
  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (!e) { if (d.open) d.close(); return }
    if (!d.open) d.showModal()
    if (body.current) body.current.scrollTop = 0
    d.querySelector<HTMLElement>('.close')?.focus()
  }, [id]) // 기록이 바뀔 때만 — 데이터를 다시 읽어도 맨 위로 돌아가지 않는다

  const step = (dir: -1 | 1): number | undefined => {
    const at = index === null ? -1 : shown.indexOf(index)
    return at < 0 ? undefined : shown[at + dir] // 거르기에서 빠진 기록이면 이전/다음 없음
  }
  const onKey = (ev: KeyboardEvent): void => {
    if ((ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') || (ev.target as Element).closest('input, video, textarea') || ev.altKey || ev.metaKey) return
    const to = step(ev.key === 'ArrowLeft' ? -1 : 1)
    if (to !== undefined) { ev.preventDefault(); onOpen(to) }
  }
  const onClick = (ev: MouseEvent): void => {
    if (ev.target === dlg.current) return onClose() // 배경 클릭
    const k = (ev.target as Element).closest<HTMLElement>('.kref')?.dataset.k
    if (k) { ev.preventDefault(); onKnowledge(k) }
  }

  const content = (() => {
    if (!e || index === null) return null
    const keys = keysOf[index] ?? []
    const sameDay = entries.map((x, j) => [x, j] as const).filter(([x, j]) => j !== index && x.date === e.date)
    const base = e.type === '트러블슈팅' ? TROUBLE_SECTIONS : SECTIONS // i18n-ok — 기록의 종류 값
    const order = [...base, ...Object.keys(e.sections).filter(k => !base.includes(k))]
    const at = shown.indexOf(index)
    const prev = shown[at - 1], next = shown[at + 1]
    const d = toDay(e.date)
    return (
      <>
        <div className="d-progress" aria-hidden="true" />
        <button className="close" type="button" aria-label={t('닫기')} onClick={onClose}><X size={20} aria-hidden /></button>
        <div className="detail-body" ref={body}>
          <article className="d-main">
            <div className="d-badges">
              <Badge type={e.type} />
              {e.tags.map(tg => {
                const v = tg.minor ? `${tg.major} - ${tg.minor}` : tg.major
                return <button key={v} type="button" className="d-tag" title={t('이 분류로 거르기')} onClick={() => onPick('tag', v)}>{tg.major}{tg.minor && ` · ${tg.minor}`}</button>
              })}
            </div>
            <h2>{e.title}</h2>
            {e.body && <p className="d-lede" dangerouslySetInnerHTML={{ __html: krefs(hl(esc(e.body))) }} />}
            {keys.filter(k => shorts.has(k)).map(k => <ShortCard key={k} name={k} concept={concepts[k]} />)}
            {order.filter(k => e.sections[k]?.trim()).map(k => (
              <section className="d-sec" key={k}><h3>{t(k)}</h3><div dangerouslySetInnerHTML={{ __html: krefs(md(e.sections[k]!)) }} /></section>
            ))}
            {keys.length > 0 && (
              <section className="d-quiz">
                <div className="d-quiz-h"><h3>{t('면접 꼬리 질문')}</h3><span>{t('개념 {n}개 · 질문을 누르면 답이 펼쳐진다', { n: keys.length })}</span></div>
                {keys.map(k => (
                  <div className="quiz" key={k}>
                    <div className="quiz-h"><h4><mark className="cc-h">{k}</mark></h4>{!shorts.has(k) && <MakeShort name={k} job={jobs[k]} />}</div>
                    {concepts[k]!.why.split('\n').map((p, i) => <p className="quiz-why" key={i}>{p}</p>)}
                    <ol>
                      {concepts[k]!.qs.map((q, i) => (
                        <li key={i}><details><summary><ChevronRight size={14} aria-hidden />{q.q}</summary><p>{q.a}</p></details></li>
                      ))}
                    </ol>
                  </div>
                ))}
              </section>
            )}
          </article>
          <aside className="d-rail">
            <dl className="d-meta">
              <dt>{t('날짜')}</dt><dd className="num">{e.date.replaceAll('-', '.')} {weekday(d, 'long')}</dd>
              <dt>{t('프로젝트')}</dt><dd><button type="button" className="d-link" onClick={() => onPick('cat', e.category)}>{e.category}</button></dd>
            </dl>
            {keys.length > 0 && (
              <div className="d-rail-sec">
                <h3>{t('이 기록의 개념')}</h3>
                <ul className="d-concepts">
                  {keys.map(k => (
                    <li key={k}>
                      <mark className="cc" tabIndex={0} data-c={k}>{k}</mark>
                      {shorts.has(k) && <span role="img" aria-label={t('쇼츠 있음')}><Play size={11} fill="currentColor" aria-hidden /></span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sameDay.length > 0 && (
              <div className="d-rail-sec">
                <h3>{t('같은 날 다른 기록')}</h3>
                <ul className="d-same">
                  {sameDay.map(([x, j]) => <li key={j}><Badge type={x.type} /><button type="button" onClick={() => onOpen(j)}>{x.title}</button></li>)}
                </ul>
              </div>
            )}
            {at >= 0 && shown.length > 1 && (
              <nav className="d-steps" aria-label={t('더 최근 · 더 오래된 기록')}>
                {prev !== undefined ? <button type="button" className="d-step" title={t('더 최근 기록 (← 키)')} onClick={() => onOpen(prev)}><span>{t('← 더 최근')}</span></button> : <span />}
                {next !== undefined ? <button type="button" className="d-step" title={t('더 오래된 기록 (→ 키)')} onClick={() => onOpen(next)}><span>{t('더 오래된 →')}</span></button> : <span />}
              </nav>
            )}
          </aside>
        </div>
      </>
    )
  })()

  return (
    <dialog className="detail" ref={dlg} onClose={onClose} onClick={onClick} onKeyDown={onKey} aria-label={e?.title}>
      <ConceptTip concepts={concepts}>{content}</ConceptTip>
    </dialog>
  )
}
