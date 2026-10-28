import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { Scene } from '../../shared/scene.ts'
import { t } from '../../shared/i18n.ts'

type Of<C extends Scene['component']> = Extract<Scene, { component: C }>
type P = { beat: number }

// 박자 시작 18프레임 동안 0 → 1
const useT = (): number => interpolate(useCurrentFrame(), [0, 18], [0, 1], { extrapolateRight: 'clamp' })
const mix = (a: number, b: number, t: number): number => a + (b - a) * t
const hlBg = (t: number): string => `color-mix(in srgb, var(--hl-soft) ${Math.round(t * 100)}%, transparent)`

// 자막을 highlight 낱말로 쪼개 React 요소로 만든다 (innerHTML 아님)
export function marked(text: string, words: string[], markStyle?: (w: string) => CSSProperties): ReactNode[] {
  const ws = words.filter(w => w.trim()).sort((a, b) => b.length - a.length)
  if (!ws.length) return [text]
  const re = new RegExp(`(${ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} style={markStyle?.(part)}>{part}</mark> : part))
}

function Frame({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <AbsoluteFill style={{ background: 'var(--main)', color: 'var(--fg)', fontFamily: 'var(--sans)', padding: 48, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
      <div style={{ fontSize: 20, color: 'var(--muted)', marginBottom: 16 }}>{title}</div>
      <Fit>{children}</Fit>
    </AbsoluteFill>
  )
}

// 내용이 칸보다 크면 줄여서 맞춘다 — 가운데 맞춤만 하면 위(제목)와 아래로 똑같이 넘쳐 겹친다.
// 크기는 변형 전 크기로 재므로 줄인 뒤 다시 재도 같은 값이 나온다(되먹임 없음)
function Fit({ children }: { children: ReactNode }): ReactNode {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current
    if (!o || !i || !i.offsetHeight) return
    const next = Math.min(1, o.clientHeight / i.offsetHeight)
    if (Math.abs(next - k) > 0.005) setK(next)
  })
  return (
    <div ref={outer} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
      <div ref={inner} style={{ flex: 'none', display: 'flex', flexDirection: 'column', transform: k < 1 ? `scale(${k})` : undefined, transformOrigin: 'center' }}>{children}</div>
    </div>
  )
}

const box: CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px', fontSize: 24 }

function Caption({ scene, beat }: { scene: Of<'Caption'> } & P): ReactNode {
  const t = useT()
  const b = scene.beats[beat]
  const prevHl = scene.beats[beat - 1]?.highlight ?? []
  const quote = scene.props.quote
  return (
    <Frame title={scene.title}>
      {quote ? (
        <div style={{ background: 'var(--side)', color: 'var(--fg)', borderLeft: '6px solid var(--line)', borderRadius: 8, padding: '20px 24px', fontSize: 26, lineHeight: 1.6 }}>
          {marked(quote, b.highlight, w => ({ background: hlBg(prevHl.includes(w) ? 1 : t), color: 'var(--fg)', padding: '0 2px' }))}
        </div>
      ) : (
        <div style={{ fontSize: 32, lineHeight: 1.6, textAlign: 'center', fontWeight: 600 }}>{b.caption}</div>
      )}
    </Frame>
  )
}

function ConceptCard({ scene, beat }: { scene: Of<'ConceptCard'> } & P): ReactNode {
  const t = useT()
  const reveal = scene.beats[beat].state.reveal
  const prev = scene.beats[beat - 1]?.state.reveal ?? 0
  // 카드가 4개 이상이면 글자 · 여백을 줄여 Fit 이 덜 줄이게(작은 창에서도 읽히게)
  const dense = scene.props.items.length >= 4 ? { fontSize: 18, padding: '10px 16px', gap: 8 } : { fontSize: 22, gap: 12 }
  return (
    <Frame title={scene.title}>
      <div style={{ display: 'grid', gap: dense.gap }}>
        {scene.props.items.map((it, i) => {
          // 아직 안 나온 카드도 자리는 미리 잡는다 — 카드가 늘 때 전체가 밀리거나 크기가 바뀌지 않게
          const shown = i < reveal
          const isNew = i >= prev
          return (
            <div key={i} aria-hidden={!shown || undefined} style={{ ...box, ...dense, borderColor: i === reveal - 1 ? 'var(--fg)' : 'var(--line)', visibility: shown ? 'visible' : 'hidden', opacity: shown && isNew ? t : 1, transform: `translateY(${shown && isNew ? (1 - t) * 12 : 0}px)` }}>
              <b>{it.term}</b> <span style={{ color: 'var(--sub)' }}>{it.text}</span>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}

function CompareCard({ scene, beat }: { scene: Of<'CompareCard'> } & P): ReactNode {
  const t = useT()
  const focus = scene.beats[beat].state.focus
  const prev = scene.beats[beat - 1]?.state.focus ?? focus
  const op = (k: string): number => mix(prev === k ? 1 : 0.4, focus === k ? 1 : 0.4, t)
  const side = (k: 'left' | 'right'): ReactNode => (
    <div style={{ ...box, flex: 1, opacity: op(k), borderColor: focus === k ? 'var(--fg)' : 'var(--line)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{scene.props[k].label}</div>
      {scene.props[k].points.map((p, i) => <div key={i} style={{ fontSize: 22, color: 'var(--sub)', marginTop: 4 }}>- {p}</div>)}
    </div>
  )
  return (
    <Frame title={scene.title}>
      <div style={{ display: 'flex', gap: 16 }}>{side('left')}{side('right')}</div>
      <div style={{ ...box, marginTop: 16, opacity: op('summary'), borderColor: focus === 'summary' ? 'var(--fg)' : 'var(--line)' }}>{scene.props.summary}</div>
    </Frame>
  )
}

function Flow({ scene, beat }: { scene: Of<'Flow'> } & P): ReactNode {
  const t = useT()
  const at = scene.beats[beat].state.at
  const prev = scene.beats[beat - 1]?.state.at ?? at
  const n = scene.props.nodes.length
  const pos = mix(prev, at, t)
  // 노드 칸 폭과 화살표 칸을 % 로 나눠 측정 없이 강조 상자를 미끄러뜨린다
  const slot = 100 / n
  return (
    <Frame title={scene.title}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos * slot}%`, width: `${slot}%`, boxSizing: 'border-box', border: '3px solid var(--fg)', borderRadius: 12 }} />
        {scene.props.nodes.map((nd, i) => (
          <div key={i} style={{ width: `${slot}%`, boxSizing: 'border-box', padding: '22px 6px', textAlign: 'center', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ flex: 1, opacity: i === at ? 1 : 0.6 }}>{nd}</span>
            {i < n - 1 && <span style={{ color: 'var(--muted)' }}>→</span>}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function StateBoxes({ scene, beat }: { scene: Of<'StateBoxes'> } & P): ReactNode {
  const t = useT()
  const cur = scene.beats[beat].state.contents
  const prev = scene.beats[beat - 1]?.state.contents
  return (
    <Frame title={scene.title}>
      <div style={{ display: 'flex', gap: 16 }}>
        {scene.props.boxes.map((name, i) => (
          <div key={i} style={{ ...box, flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{name}</div>
            {(cur[i] ?? []).map((line, j) => (
              <div key={j} style={{ fontSize: 22, padding: '2px 6px', borderRadius: 6, overflowWrap: 'anywhere', background: prev && !prev[i]?.includes(line) ? hlBg(t) : 'transparent' }}>{line}</div>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function CodeTrace({ scene, beat }: { scene: Of<'CodeTrace'> } & P): ReactNode {
  const t = useT()
  const { line, vars } = scene.beats[beat].state
  const prevS = scene.beats[beat - 1]?.state
  const prevLine = prevS?.line ?? line
  const lines = scene.props.code.split('\n')
  const LH = 30
  return (
    <Frame title={scene.title}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, fontFamily: 'var(--mono)', fontSize: 20, lineHeight: `${LH}px`, border: '1px solid var(--line)', borderRadius: 12, padding: 8, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 8, right: 8, top: 8 + mix(prevLine - 1, line - 1, t) * LH, height: LH, background: 'var(--hl-soft)', borderRadius: 4 }} />
          {lines.map((l, i) => (
            <div key={i} style={{ position: 'relative', whiteSpace: 'pre', display: 'flex' }}>
              <span style={{ width: 32, color: 'var(--muted)', flex: 'none' }}>{i + 1}</span>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div style={{ ...box, width: 240, flex: 'none', fontFamily: 'var(--mono)', fontSize: 20 }}>
          {Object.entries(vars).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 6px', borderRadius: 6, background: prevS && prevS.vars[k] !== v ? hlBg(t) : 'transparent' }}>
              <span style={{ color: 'var(--muted)' }}>{k}</span><b>{v}</b>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  )
}

function ArrayView({ scene, beat }: { scene: Of<'ArrayView'> } & P): ReactNode {
  const t = useT()
  const { values, pointers, marks } = scene.beats[beat].state
  const prev = scene.beats[beat - 1]?.state
  const W = 64, STEP = 72
  const seen: Record<number, number> = {}
  return (
    <Frame title={scene.props.label ? `${scene.title} · ${scene.props.label}` : scene.title}>
      <div style={{ position: 'relative', height: 160, width: (values.length + 1) * STEP, margin: '0 auto' }}>
        {values.map((v, i) => (
          <div key={i} style={{ position: 'absolute', left: i * STEP, top: 0, width: W, height: W, boxSizing: 'border-box', border: '2px solid var(--fg)', borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 24, fontFamily: 'var(--mono)', background: marks.includes(i) ? 'var(--hl-soft)' : undefined, opacity: marks.length && !marks.includes(i) ? 0.4 : 1 }}>{v}</div>
        ))}
        {Object.entries(pointers).map(([name, idx]) => {
          const x = mix((prev?.pointers[name] ?? idx) * STEP, idx * STEP, t)
          const row = (seen[idx] = (seen[idx] ?? -1) + 1)
          return (
            <div key={name} style={{ position: 'absolute', left: x, top: W + 8 + row * 32, width: W, textAlign: 'center', fontSize: 22, fontFamily: 'var(--mono)' }}>
              <div style={{ lineHeight: '14px', fontSize: 14, color: 'var(--muted)' }}>▲</div>{name}
            </div>
          )
        })}
      </div>
    </Frame>
  )
}

function GridTable({ scene, beat }: { scene: Of<'GridTable'> } & P): ReactNode {
  const t = useT()
  const { cells, focus } = scene.beats[beat].state
  const prev = scene.beats[beat - 1]?.state
  const cell: CSSProperties = { border: '1px solid var(--line)', padding: '8px 12px', textAlign: 'center', fontSize: 22, fontFamily: 'var(--mono)' }
  return (
    <Frame title={scene.title}>
      <table style={{ borderCollapse: 'collapse', margin: '0 auto' }}>
        <thead>
          <tr><th style={cell} />{scene.props.cols.map((c, j) => <th key={j} style={{ ...cell, color: 'var(--muted)' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {scene.props.rows.map((r, i) => (
            <tr key={i}>
              <th style={{ ...cell, color: 'var(--muted)' }}>{r}</th>
              {cells[i].map((v, j) => {
                const f = focus?.[0] === i && focus[1] === j
                return <td key={j} style={{ ...cell, outline: f ? '3px solid var(--fg)' : 'none', outlineOffset: -3, background: prev && prev.cells[i]?.[j] !== v ? hlBg(t) : 'transparent' }}>{v}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  )
}

function GraphView({ scene, beat }: { scene: Of<'GraphView'> } & P): ReactNode {
  const t = useT()
  const { current, visited, labels } = scene.beats[beat].state
  const prevCur = scene.beats[beat - 1]?.state.current
  const { nodes, edges, directed } = scene.props
  const W = 864, H = labels ? 380 : 340, R = 26, rad = 130
  const pt = (nm: string): [number, number] => {
    const a = (nodes.indexOf(nm) / nodes.length) * 2 * Math.PI - Math.PI / 2
    return [W / 2 + rad * 1.5 * Math.cos(a), H / 2 + rad * Math.sin(a)]
  }
  return (
    <Frame title={scene.title}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: H }}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style={{ fill: 'var(--muted)' }} /></marker>
        </defs>
        {edges.map(([a, b, w], i) => {
          const [x1, y1] = pt(a), [x2, y2] = pt(b)
          const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d
          return (
            <g key={i}>
              <line x1={x1 + ux * R} y1={y1 + uy * R} x2={x2 - ux * (R + 2)} y2={y2 - uy * (R + 2)} style={{ stroke: 'var(--muted)', strokeWidth: 2 }} markerEnd={directed ? 'url(#arr)' : undefined} />
              {w && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize={18} style={{ fill: 'var(--sub)' }}>{w}</text>}
            </g>
          )
        })}
        {nodes.map(nm => {
          const [x, y] = pt(nm)
          const isCur = nm === current
          const grow = isCur && prevCur !== nm ? t : 1
          return (
            <g key={nm}>
              <circle cx={x} cy={y} r={R + (isCur ? 4 * grow : 0)} style={{ fill: visited.includes(nm) ? 'var(--hl-soft)' : 'var(--main)', stroke: 'var(--fg)', strokeWidth: isCur ? 2 + 4 * grow : 2 }} />
              <text x={x} y={y + 7} textAnchor="middle" fontSize={22} style={{ fill: 'var(--fg)' }}>{nm}</text>
              {labels?.[nm] && <text x={x} y={y + R + 22} textAnchor="middle" fontSize={17} style={{ fill: 'var(--sub)', fontFamily: 'var(--mono)' }}>{labels[nm]}</text>}
            </g>
          )
        })}
      </svg>
    </Frame>
  )
}

function StackQueue({ scene, beat }: { scene: Of<'StackQueue'> } & P): ReactNode {
  const tw = useT()
  const { items, op } = scene.beats[beat].state
  const prevN = scene.beats[beat - 1]?.state.items.length ?? items.length
  const { kind } = scene.props
  const vertical = kind === 'stack'
  const slide = (i: number): CSSProperties => (i >= prevN ? { opacity: tw, transform: vertical ? `translateY(${(tw - 1) * 24}px)` : `translateX(${(1 - tw) * 40}px)` } : {})
  const cellS: CSSProperties = { border: '2px solid var(--fg)', borderRadius: 8, minWidth: 72, padding: '10px 14px', textAlign: 'center', fontSize: 24, fontFamily: 'var(--mono)', boxSizing: 'border-box' }
  const order = vertical ? items.map((_, i) => i).reverse() : items.map((_, i) => i)
  const label: CSSProperties = { color: 'var(--muted)', fontSize: 16, lineHeight: 1.3, textAlign: 'center', fontFamily: 'var(--mono)' }
  const wall = '2px solid var(--line)'
  const container: Record<typeof kind, CSSProperties> = {
    queue: { borderTop: wall, borderBottom: wall, minWidth: 420, minHeight: 76 },
    deque: { borderTop: wall, borderBottom: wall, minWidth: 420, minHeight: 76 },
    stack: { borderLeft: wall, borderRight: wall, borderBottom: wall, borderRadius: '0 0 10px 10px', minWidth: 140, minHeight: 220 },
    heap: { border: wall, borderRadius: 10, minWidth: 320, minHeight: 76 }
  }
  return (
    <Frame title={`${scene.title} · ${kind}`}>
      {/* 연산 이름 자리는 늘 잡아 둔다 — 나타날 때 아래 통이 밀리지 않게 */}
      <div style={{ alignSelf: 'center', marginBottom: 12, padding: '4px 14px', border: '1px solid var(--line)', borderRadius: 999, fontSize: 20, color: 'var(--sub)', visibility: op ? 'visible' : 'hidden' }}>{op || '·'}</div>
      {/* 통은 비어 있어도 그린다 — 큐 · 덱은 양 끝이 열린 관(front 쪽으로 나가고 rear 쪽으로 들어온다), 스택은 위가 열린 통 */}
      <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {vertical ? <div style={label}>top ↕</div> : kind !== 'heap' && <div style={label}>{kind === 'deque' ? '⇄' : t('← 나감')}<br />front</div>}
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: vertical ? 'flex-end' : 'flex-start', gap: kind === 'heap' ? 4 : 8, boxSizing: 'border-box', padding: 12, ...container[kind] }}>
          {!items.length && <div style={{ margin: 'auto', color: 'var(--muted)', fontSize: 18 }}>{t('비어 있음')}</div>}
          {order.map(i => <div key={i} style={{ ...cellS, ...slide(i) }}>{items[i]}</div>)}
        </div>
        {!vertical && kind !== 'heap' && <div style={label}>{kind === 'deque' ? '⇄' : t('← 들어옴')}<br />rear</div>}
      </div>
    </Frame>
  )
}

function Predict({ scene, beat }: { scene: Of<'Predict'> } & P): ReactNode {
  const q = scene.beats[beat]
  return (
    <Frame title={scene.title}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 96, lineHeight: 1, fontWeight: 700 }}>?</div>
        <div style={{ fontSize: 28, lineHeight: 1.5, marginTop: 16 }}>{q.predict?.question ?? q.caption}</div>
      </div>
    </Frame>
  )
}

export function SceneView({ scene, beat }: { scene: Scene; beat: number }): ReactNode {
  switch (scene.component) {
    case 'ConceptCard': return <ConceptCard scene={scene} beat={beat} />
    case 'CompareCard': return <CompareCard scene={scene} beat={beat} />
    case 'Flow': return <Flow scene={scene} beat={beat} />
    case 'StateBoxes': return <StateBoxes scene={scene} beat={beat} />
    case 'CodeTrace': return <CodeTrace scene={scene} beat={beat} />
    case 'ArrayView': return <ArrayView scene={scene} beat={beat} />
    case 'GridTable': return <GridTable scene={scene} beat={beat} />
    case 'GraphView': return <GraphView scene={scene} beat={beat} />
    case 'StackQueue': return <StackQueue scene={scene} beat={beat} />
    case 'Predict': return <Predict scene={scene} beat={beat} />
    default: return <Caption scene={scene} beat={beat} />
  }
}
