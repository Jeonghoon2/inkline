import { useLayoutEffect, useRef, useState } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { t } from '../../shared/i18n.ts'

// 모듈 진행 타임라인 — 이력서 최신화 · 점검과 이론 장면 만들기가 같이 쓴다. 상태는 main 이 보낸 단계 알림만 따른다
// user: 사람이 할 차례(확인 카드 등) — 진행 중이어도 초 · 물결 대신 안내 글만
export type StageNode = { icon: LucideIcon; title: string; sub: string; ai: boolean; user?: boolean }
export type FlowState = Partial<Record<string, { state: 'on' | 'done'; note?: string; at: number; progress?: [number, number] }>> // progress: [끝난 수, 전체] — 있으면 물결 대신 채움 막대
type St = 'done' | 'on' | 'wait'

// 세로 타임라인 — 층(layer)마다 한 줄, 같은 층의 모듈(동시에 도는 것)은 한 줄에 나란히. 왼쪽 점 · 선이 진행을, 오른쪽이 결과 한 줄 · 경과 시간을 보인다.
// 폭 · 모듈 수와 상관없이 칸이 찌그러지지 않는다(좁으면 결과 글만 아래로 내려간다)
// focus(기본 켬 — 이력서 최신화 · 점검, 이론 장면, 자격증 교재 넣기 모두): 높이를 고정한 창에서 지금 하는 단계만 가운데에 또렷하게, 위아래는 흐리게 — 단계가 끝날 때마다 목록이 미끄러져 다음 단계가 가운데로 온다.
// 모두 끝나면 결과를 읽게 전체를 펼친다
export function StageFlow({ nodes, layers, flow, now, label, focus = true }: { nodes: Record<string, StageNode>; layers: string[][]; flow: FlowState; now: number; label: string; focus?: boolean }) {
  const NODE = nodes
  const st = (id: string): St => (flow[id]?.state === 'done' ? 'done' : flow[id]?.state === 'on' ? 'on' : 'wait')
  const row = (layer: string[]): St => (layer.every(id => st(id) === 'done') ? 'done' : layer.some(id => st(id) !== 'wait') ? 'on' : 'wait')
  const sub = (id: string): string => {
    const f = flow[id]
    if (f?.state !== 'on') return f?.note || NODE[id].sub
    if (NODE[id].user) return f.note || NODE[id].sub
    const secs = t('{n}초', { n: Math.max(0, Math.round((now - f.at) / 1000)) })
    return f.note ? `${f.note} · ${secs}` : secs // 진행 중 글(쪽 진행 등)이 있으면 초와 함께
  }
  const fi = focus ? layers.findIndex(l => row(l) !== 'done') : -1 // 가운데에 둘 단계(없으면 다 끝남)
  const box = useRef<HTMLDivElement>(null), list = useRef<HTMLOListElement>(null)
  const [shift, setShift] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (fi < 0) { setShift(null); return }
    const center = (): void => {
      const b = box.current, el = list.current?.children[fi] as HTMLElement | undefined
      if (b && el) setShift(b.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2))
    }
    center()
    const ro = new ResizeObserver(center) // 폭이 바뀌어 글이 접히면 줄 높이가 달라진다
    if (box.current) ro.observe(box.current)
    if (list.current) ro.observe(list.current)
    return () => ro.disconnect()
  }, [fi, layers.length])
  const ol = (
    <ol ref={list} className={`tl${focus ? ' tl-bare' : ''}${fi >= 0 ? ' tl-slide' : ''}`} aria-label={label} style={fi >= 0 && shift !== null ? { transform: `translateY(${shift}px)` } : undefined}>
      {layers.map((layer, li) => {
        const r = row(layer), next = layers[li + 1]
        return (
          <li key={layer.join()} className={`tl-row is-${r}${fi < 0 ? '' : li === fi ? ' is-focus' : ' is-dim'}`} aria-current={r === 'on' ? 'step' : undefined}>
            <span className="tl-rail" aria-hidden>
              <span className="tl-dot">{r === 'done' && <Check size={11} strokeWidth={3} />}</span>
              {next && <span className={`tl-line is-${r === 'done' ? (row(next) === 'on' ? 'flow' : 'done') : 'wait'}`} />}
            </span>
            <div className={`tl-items${layer.length > 1 ? ' is-pair' : ''}`}>
              {layer.map(id => {
                const N = NODE[id], s = st(id)
                return (
                  <div key={id} className={`tl-item is-${s}`}>
                    <span className="tl-head">
                      {layer.length > 1 && <span className="tl-mini" aria-hidden>{s === 'done' ? <Check size={10} strokeWidth={3} /> : null}</span>}
                      <N.icon size={14} aria-hidden className="tl-ic" />
                      <b>{N.title}</b>
                      {li > 0 && <i className="tl-kind">{N.user ? t('확인') : N.ai ? 'AI' : t('규칙')}</i>}
                    </span>
                    <span className={`tl-note${s === 'on' ? ' num' : ''}`}>{sub(id)}</span>
                    {s === 'on' && !N.user && (flow[id]?.progress ? <Bar p={flow[id]!.progress!} /> : <span className="tl-wave" aria-hidden />)}
                  </div>
                )
              })}
            </div>
          </li>
        )
      })}
    </ol>
  )
  return fi >= 0 ? <div className="tl-focus"><div ref={box} className={`tl-view${shift === null ? '' : ' is-ready'}`}>{ol}</div></div> : ol
}

// 채움 막대 — 끝난 수 / 전체(쪽 진행 등). 화면 읽기 프로그램에는 진행률로 알린다
function Bar({ p: [done, total] }: { p: [number, number] }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return <span className="tl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} / ${total}`}><i style={{ width: `${pct}%` }} /></span>
}
