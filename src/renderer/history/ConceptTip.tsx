import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Concept } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

// 감싼 영역 안의 mark.cc 에 마우스 · 포커스가 오면 원리 말풍선. 상세 창(dialog)은 맨 위 층이라 창 안에 한 번 더 둔다
export function ConceptTip({ concepts, children }: { concepts: Record<string, Concept>; children: ReactNode }) {
  const id = useId()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const tip = useRef<HTMLDivElement>(null)
  const key = target?.dataset.c ?? ''
  const c = target && Object.hasOwn(concepts, key) ? concepts[key]! : null

  const show = (e: { target: EventTarget }): void => {
    const m = (e.target as Element).closest?.<HTMLElement>('mark.cc')
    if (m) setTarget(m)
  }
  const hide = (): void => setTarget(null)

  // 창 안에 들어오게 놓는다 — 참고 구현 showTip 과 같은 계산
  useLayoutEffect(() => {
    const t = tip.current
    if (!target || !t) return
    const r = target.getBoundingClientRect()
    t.style.left = Math.max(8, Math.min(r.left, innerWidth - t.offsetWidth - 8)) + 'px'
    t.style.top = (r.bottom + t.offsetHeight + 12 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - t.offsetHeight - 6)) + 'px'
  }, [target, c])
  useEffect(() => {
    if (target && !target.isConnected) setTarget(null) // 데이터가 바뀌어 대상이 사라졌으면 숨긴다
  }, [target, children, concepts])
  useEffect(() => {
    if (!target || !c) return
    target.setAttribute('aria-describedby', id)
    addEventListener('scroll', hide, true)
    return () => {
      target.removeAttribute('aria-describedby')
      removeEventListener('scroll', hide, true)
    }
  }, [target, c, id])

  return (
    <div
      className="ctip"
      onMouseOver={show}
      onFocus={show}
      onMouseOut={e => (e.target as Element).closest?.('mark.cc') && hide()}
      onBlur={hide}
    >
      {children}
      {c && (
        <div className="tip" role="tooltip" id={id} ref={tip}>
          <b>{key}</b>
          {c.why.split('\n').map((p, i) => <p key={i}>{p}</p>)}
          {c.qs.length > 0 && <small>{t('면접 꼬리 질문 {n}개 — 상세 창 맨 아래', { n: c.qs.length })}</small>}
        </div>
      )}
    </div>
  )
}
