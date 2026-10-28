// 계약을 바꾸면 scenes 캐시를 비우는 마이그레이션을 함께 넣는다 (옛 장면은 다시 검사하지 않는다)
// 이론 장면 계약 — AI 는 props · state 를 JSON 글로 주고, 여기서 컴포넌트별 모양을 확인한다.
// 틀린 장면은 Caption(자막만)으로 바꿔 그린다
export const SCENE_COMPONENTS = ['Caption', 'ConceptCard', 'CompareCard', 'Flow', 'StateBoxes', 'CodeTrace', 'ArrayView', 'GridTable', 'GraphView', 'StackQueue', 'Predict'] as const
export type SceneComponent = (typeof SCENE_COMPONENTS)[number]

export interface PredictQ { question: string; choices: string[]; answer: number; why?: string; notes?: string[] }
export interface Beat<S = Record<string, never>> { caption: string; highlight: string[]; state: S; predict?: PredictQ; line?: number }
// code · line: 진행 장면 옆에 보일 코드와 박자마다 짚을 줄(개념 이론만 — 문제 연결은 정답이 새므로 받지 않는다)
type S<C extends SceneComponent, P, St> = { component: C; title: string; props: P; code?: string; beats: Beat<St>[] }
export interface Side { label: string; points: string[] }
export type Scene =
  | S<'Caption', { quote?: string }, Record<string, never>>
  | S<'ConceptCard', { items: { term: string; text: string }[] }, { reveal: number }>
  | S<'CompareCard', { left: Side; right: Side; summary: string }, { focus: 'left' | 'right' | 'summary' }>
  | S<'Flow', { nodes: string[] }, { at: number }>
  | S<'StateBoxes', { boxes: string[] }, { contents: string[][] }>
  | S<'CodeTrace', { language: string; code: string }, { line: number; vars: Record<string, string> }>
  | S<'ArrayView', { label?: string }, { values: (string | number)[]; pointers: Record<string, number>; marks: number[] }>
  | S<'GridTable', { rows: string[]; cols: string[] }, { cells: string[][]; focus: [number, number] | null }>
  | S<'GraphView', { nodes: string[]; edges: [string, string, string?][]; directed: boolean }, { current: string | null; visited: string[]; labels?: Record<string, string> }>
  | S<'StackQueue', { kind: 'stack' | 'queue' | 'deque' | 'heap' }, { items: string[]; op?: string }>
  | S<'Predict', Record<string, never>, Record<string, never>>

export interface RawBeat { caption: string; highlight: string[]; state: string; predict: PredictQ; line?: number }
export interface RawScene { component: string; title: string; props: string; code?: string; beats: RawBeat[] }

export const CONCEPT_KEY_RE = /^(?=.{2,40}$)[a-z0-9]+(-[a-z0-9]+)*$/
export const sceneKey = {
  concept: (key: string): string => `concept:${key}`,
  map: (problemId: number, key: string): string => `map:${problemId}:${key}`
}

const MAX_SCENES = 12, MAX_BEATS = 12, CAP = 200
type O = Record<string, unknown>
const isObj = (v: unknown): v is O => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max
const strArr = (v: unknown, min: number, max: number, each = 200): v is string[] =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every(x => isStr(x, each))
const int = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
const parse = (s: string): unknown => { if (!s.trim()) return {}; try { return JSON.parse(s) } catch { return undefined } }

// props 검사 → 정리한 props, 아니면 undefined
const PROPS: Record<SceneComponent, (p: O) => O | undefined> = {
  Caption: p => (p.quote === undefined || isStr(p.quote, 300) ? (p.quote ? { quote: p.quote } : {}) : undefined),
  ConceptCard: p => (Array.isArray(p.items) && p.items.length >= 1 && p.items.length <= 6 && p.items.every(i => isObj(i) && isStr(i.term, 40) && isStr(i.text, 160))
    ? { items: (p.items as O[]).map(i => ({ term: i.term, text: i.text })) } : undefined),
  CompareCard: p => {
    const side = (x: unknown): x is Side => isObj(x) && isStr(x.label, 40) && strArr(x.points, 1, 4, 120)
    return side(p.left) && side(p.right) && isStr(p.summary, 160)
      ? { left: { label: p.left.label, points: p.left.points }, right: { label: p.right.label, points: p.right.points }, summary: p.summary } : undefined
  },
  Flow: p => (strArr(p.nodes, 2, 6, 40) ? { nodes: p.nodes } : undefined),
  StateBoxes: p => (strArr(p.boxes, 1, 4, 30) ? { boxes: p.boxes } : undefined),
  CodeTrace: p => (isStr(p.language, 20) && isStr(p.code, 1500) && p.code.trim() && p.code.split('\n').length <= 30 ? { language: p.language, code: p.code } : undefined),
  ArrayView: p => (p.label === undefined || isStr(p.label, 30) ? (p.label ? { label: p.label } : {}) : undefined),
  GridTable: p => (strArr(p.rows, 1, 8, 12) && strArr(p.cols, 1, 10, 12) ? { rows: p.rows, cols: p.cols } : undefined),
  GraphView: p => {
    if (!strArr(p.nodes, 2, 10, 12) || new Set(p.nodes).size !== p.nodes.length || typeof p.directed !== 'boolean') return undefined
    const nodes = p.nodes
    if (!Array.isArray(p.edges) || p.edges.length > 16) return undefined
    // 가중치는 숫자로 와도 글로 바꿔 받는다(AI 가 ["A","B",4] 로 자주 쓴다)
    const edges = p.edges.map(e => (Array.isArray(e) && typeof e[2] === 'number' ? [e[0], e[1], String(e[2])] : e))
    const ok = edges.every(e => Array.isArray(e) && (e.length === 2 || e.length === 3) && nodes.includes(e[0]) && nodes.includes(e[1]) && (e.length === 2 || isStr(e[2], 12)))
    return ok ? { nodes, edges, directed: p.directed } : undefined
  },
  StackQueue: p => (['stack', 'queue', 'deque', 'heap'].includes(p.kind as string) ? { kind: p.kind } : undefined),
  Predict: () => ({})
}

// 박자 state 검사 — props 를 보고 범위를 확인한다
const STATE: Record<SceneComponent, (s: O, p: O) => O | undefined> = {
  Caption: () => ({}),
  ConceptCard: (s, p) => (int(s.reveal, 1, (p.items as unknown[]).length) ? { reveal: s.reveal } : undefined),
  CompareCard: s => (['left', 'right', 'summary'].includes(s.focus as string) ? { focus: s.focus } : undefined),
  Flow: (s, p) => (int(s.at, 0, (p.nodes as unknown[]).length - 1) ? { at: s.at } : undefined),
  StateBoxes: (s, p) => (Array.isArray(s.contents) && s.contents.length === (p.boxes as unknown[]).length && s.contents.every(c => strArr(c, 0, 8, 30)) ? { contents: s.contents } : undefined),
  CodeTrace: (s, p) => {
    const lines = (p.code as string).split('\n').length
    const vars = s.vars
    return int(s.line, 1, lines) && isObj(vars) && Object.keys(vars).length <= 8 && Object.values(vars).every(v => isStr(v, 40)) ? { line: s.line, vars } : undefined
  },
  ArrayView: s => {
    const v = s.values
    if (!Array.isArray(v) || v.length > 12 || !v.every(x => isStr(x, 8) || (typeof x === 'number' && Number.isFinite(x)))) return undefined
    const ptr = s.pointers ?? {}, marks = s.marks ?? []
    if (!isObj(ptr) || Object.keys(ptr).length > 4 || !Object.entries(ptr).every(([k, i]) => k.length <= 8 && int(i, 0, Math.max(0, v.length)))) return undefined
    if (!Array.isArray(marks) || !marks.every(i => int(i, 0, v.length - 1))) return undefined
    return { values: v, pointers: ptr, marks }
  },
  GridTable: (s, p) => {
    const r = (p.rows as string[]).length, c = (p.cols as string[]).length
    const cells = s.cells
    if (!Array.isArray(cells) || cells.length !== r || !cells.every(row => strArr(row, c, c, 8))) return undefined
    const f = s.focus
    if (f !== null && f !== undefined && !(Array.isArray(f) && f.length === 2 && int(f[0], 0, r - 1) && int(f[1], 0, c - 1))) return undefined
    return { cells, focus: f ?? null }
  },
  GraphView: (s, p) => {
    const nodes = p.nodes as string[]
    const cur = s.current ?? null
    if (cur !== null && !nodes.includes(cur as string)) return undefined
    if (!Array.isArray(s.visited) || !s.visited.every(x => nodes.includes(x))) return undefined
    // labels: 노드 아래 작은 글(거리 · 차수 등) — 숫자는 글로 바꿔 받는다
    if (s.labels === undefined) return { current: cur, visited: s.visited }
    if (!isObj(s.labels)) return undefined
    const labels: Record<string, string> = {}
    for (const [k, v] of Object.entries(s.labels)) { const t = typeof v === 'number' ? String(v) : v; if (!nodes.includes(k) || !isStr(t, 8)) return undefined; labels[k] = t }
    return { current: cur, visited: s.visited, labels }
  },
  StackQueue: s => (strArr(s.items, 0, 10, 12) && (s.op === undefined || isStr(s.op, 30)) ? { items: s.items, ...(s.op ? { op: s.op } : {}) } : undefined),
  Predict: () => ({})
}

function predictOf(p: unknown): PredictQ | undefined {
  if (!isObj(p) || !isStr(p.question, 200) || !p.question.trim()) return undefined
  if (!strArr(p.choices, 2, 4, 80) || !int(p.answer, 0, p.choices.length - 1)) return undefined
  const why = isStr(p.why, 160) && p.why.trim() ? p.why : undefined
  const notes = strArr(p.notes, p.choices.length, p.choices.length, 100) ? p.notes : undefined // 길이가 다르면 notes 만 버린다
  return { question: p.question, choices: p.choices, answer: p.answer, ...(why ? { why } : {}), ...(notes ? { notes } : {}) }
}

const strs = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strs) : isObj(v) ? Object.values(v).flatMap(strs) : [])

export function normalizeScenes(raw: RawScene[], opts: { allowCode: boolean; codeLike?: (s: string) => boolean }): Scene[] {
  const out: Scene[] = []
  for (const r of raw.slice(0, MAX_SCENES)) {
    const title = typeof r.title === 'string' ? r.title.slice(0, 60) : ''
    let beats = (Array.isArray(r.beats) ? r.beats : []).slice(0, MAX_BEATS).map(b => ({
      caption: typeof b?.caption === 'string' ? b.caption.slice(0, CAP) : '',
      highlight: Array.isArray(b?.highlight) ? b.highlight.filter((h): h is string => typeof h === 'string' && !!h.trim()).slice(0, 5).map(h => h.slice(0, 40)) : [],
      rawState: typeof b?.state === 'string' ? b.state : '',
      predict: predictOf(b?.predict),
      line: b?.line
    }))
    const cl = !opts.allowCode ? opts.codeLike : undefined
    if (cl) beats = beats.map(b => (cl(b.caption) ? { ...b, caption: '' } : b)).filter(b => b.caption.trim())
      .map(b => (b.predict && [b.predict.question, ...b.predict.choices].some(cl) ? { ...b, predict: undefined } : b))
    if (!beats.length) continue
    // 정답 코드가 제목 · props · state 로 새지 않게 — Caption.quote 는 문제 글이라 제외
    const leaks = (v: unknown): boolean => !!cl && strs(v).some(cl)
    let dirty = leaks(title)
    const fallback = (): Scene => ({ component: 'Caption', title: dirty ? '' : title, props: {}, beats: beats.map(b => ({ caption: b.caption, highlight: b.highlight, state: {}, ...(b.predict ? { predict: b.predict } : {}) })) })
    const comp = r.component as SceneComponent
    const pRaw = parse(typeof r.props === 'string' ? r.props : '')
    if (!SCENE_COMPONENTS.includes(comp) || (!opts.allowCode && comp === 'CodeTrace') || !isObj(pRaw)) { out.push(fallback()); continue }
    const props = PROPS[comp](pRaw)
    if (!props) { out.push(fallback()); continue }
    const states = beats.map(b => { const s = parse(b.rawState); return isObj(s) ? STATE[comp](s, props) : undefined })
    dirty ||= leaks(comp === 'Caption' ? { ...props, quote: undefined } : props) || states.some(leaks)
    if (dirty || states.some(s => !s) || (comp === 'Predict' && beats.some(b => !b.predict))) { out.push(fallback()); continue }
    // 옆 코드는 코드를 허락한 곳(개념 이론)의 그림 장면만, 박자마다 짚을 줄이 다 맞을 때만
    const n = typeof r.code === 'string' && r.code.length <= 2000 ? r.code.split('\n').length : 0
    const code = opts.allowCode && comp !== 'Caption' && comp !== 'CodeTrace' && n >= 1 && n <= 24 && beats.every(b => int(b.line, 1, n)) ? r.code : undefined
    out.push({ component: comp, title, props, ...(code ? { code } : {}), beats: beats.map((b, i) => ({ caption: b.caption, highlight: b.highlight, state: states[i]!, ...(b.predict ? { predict: b.predict } : {}), ...(code ? { line: b.line } : {}) })) } as Scene)
  }
  return out
}

export const flatBeats = (scenes: Scene[]): { scene: number; beat: number }[] =>
  scenes.flatMap((s, scene) => s.beats.map((_, beat) => ({ scene, beat })))

// 컴포넌트 꼴 · 박자 상태를 하나씩 확인 — 이론 설계 모듈이 실행 검산 결과를 바로 거르는 데 쓴다
export const checkProps = (comp: SceneComponent, p: unknown): Record<string, unknown> | undefined => (isObj(p) ? PROPS[comp](p) : undefined)
export const checkState = (comp: SceneComponent, s: unknown, props: Record<string, unknown>): Record<string, unknown> | undefined => (isObj(s) ? STATE[comp](s, props) : undefined)
