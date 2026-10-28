// 이론 장면을 모듈로 — 한 모듈 한 가지 일, 상태 값은 실행으로 확인하고, 꼴은 앱이 조립한다.
// 개념 이론: ① 설계(AI: 용어 · 예시 · 진행 장면 종류 · 상태를 출력하는 Python) → ② 실행 검산(격리 실행 · 상태 꼴 확인)
//           → ③ 장면 쓰기(AI: 고정된 상태에 자막 · 질문만) → ④ 품질 검사(규칙, 어기면 쓰기 한 번 더) → ⑤ 학습 점검(AI: 자막 · 질문만 고침)
// 문제 연결: (한 번에 쓰기) → ④ → ⑤ — 정답 코드가 새면 안 되니 실행 검산은 없다
import { arr, obj, str } from '../ai/schema.ts'
import type { Ask, AskResult } from '../ai/run.ts'
import type { AiError, ConceptRef, SceneSet, TheoryStage } from '../../shared/types.ts'
import { checkProps, checkState, normalizeScenes, type PredictQ, type RawScene, type Scene } from '../../shared/scene.ts'
import type { PyResult } from './sandbox.ts'
import { t } from '../../shared/i18n.ts'

export type RunPy = (code: string, prelude?: string) => Promise<PyResult>
type Stage = (s: TheoryStage) => void
export type TheoryOut = { ok: true; set: SceneSet; notes: string[] } | { ok: false; error: AiError }

const PREDICT = obj({ question: str(200), choices: arr(str(80), 0, 3), answer: { type: 'integer', minimum: 0, maximum: 2 }, why: str(160), notes: arr(str(100), 0, 3) })
const NO_Q = { question: '', choices: [], answer: 0, why: '', notes: [] }

// 진행 장면 — 상태를 실행으로 만들 수 있는 것만(CodeTrace 는 줄 번호 · 변수라 빼고, ArrayView · 표 · 그래프 · 스택/큐 · 상자)
export const PROGRESS = ['ArrayView', 'GridTable', 'GraphView', 'StackQueue', 'StateBoxes'] as const
export const MIN_STEPS = 5, MAX_STEPS = 12

// ── ① 설계
export const DESIGN_SCHEMA = obj({
  goal: str(160),
  terms: arr(obj({ term: str(40), text: str(160) }), 3, 5),
  component: { type: 'string', enum: [...PROGRESS] },
  title: str(60),
  props: str(1500),
  code: str(3000),
  flow: arr(str(40), 3, 5)
})
interface Design { goal: string; terms: { term: string; text: string }[]; component: (typeof PROGRESS)[number]; title: string; props: string; code: string; flow: string[] }
const SHAPES = `진행 장면 component 와 props(JSON 글) · 상태(코드가 한 줄에 하나씩 출력할 JSON 객체):
- ArrayView: props {} 또는 {"label":"30자 이하"} / 상태 {"values":[…12개 이하, 각 8자 이하 글 또는 숫자],"pointers":{"이름":칸 번호(0~values 개수)} 4개 이하,"marks":[지금 보는 칸 번호]}
- GridTable: props {"rows":["행"] 1~8개,"cols":["열"] 1~10개, 각 12자 이하} / 상태 {"cells":[[칸 글 8자 이하]] 정확히 rows×cols,"focus":[행,열] 또는 null}
- GraphView: props {"nodes":["A",…] 2~10개,"edges":[["A","B"] 또는 ["A","B","가중치"]] 16개 이하,"directed":false} / 상태 {"current":"노드" 또는 null,"visited":["노드"],"labels":{"노드":"거리 등 8자 이하"}(거리 · 차수처럼 노드마다 바뀌는 값이 있을 때만)}
- StackQueue: props {"kind":"stack"|"queue"|"deque"|"heap"} / 상태 {"items":["원소" 글자로, 12자 이하] 0~10개,"op":"push 3" 30자 이하}
- StateBoxes: props {"boxes":["상자 이름"] 1~4개} / 상태 {"contents":[["칸 글"],…] 상자마다 0~8개}`
export function designPrompt(c: ConceptRef, fix = ''): string {
  const algo = c.nature === 'algorithm'
  return [
    `개념: ${c.name.replace(/[^\p{L}\p{N} ·]/gu, '').slice(0, 40)} (key ${c.key}, ${algo ? '알고리즘' : '자료구조'})`,
    '할 일: 이 개념을 처음 배우는 사람에게 보여 줄 이론 장면을 설계한다. 자막은 쓰지 않는다.',
    '- goal: 이 장면들을 보고 나서 할 수 있게 될 것 한 문장. terms: 용어 3~5개(term · 쉬운 설명 text)',
    `- component · title · props: 크기 4~6 의 작은 예시 입력으로 한 단계씩 진행하는 장면. ${algo ? '알고리즘이니 시간축 진행 — ArrayView · GridTable · GraphView 중 맞는 것' : '자료구조이니 연산별 불변식 — StackQueue · StateBoxes · GraphView 중 맞는 것, 연산 하나에 한 단계'}`,
    `- code: 이 개념의 알고리즘을 그대로 쓴 짧은 Python 코드(학습자가 그림 옆에서 읽는다, show 줄을 빼고 22줄 이하). 상태가 바뀐 문장 바로 다음 줄에 show(상태) 를 한 줄로 부른다 — show 는 앱이 넣어 주는 함수라 정의 · import 하지 않는다. show 를 ${MIN_STEPS}~${MAX_STEPS} 번, 처음 상태(초기화 직후)부터 끝 상태까지 실제로 계산해서 부른다(값을 손으로 적지 않는다). 그림용 변환(str() 등)은 show 인자 안에서만 하고 그림용 보조 함수 · print 는 두지 않는다. 주석은 학습자가 코드를 읽는 데 도움이 될 때만 짧게 — 생략 · 한계 · 검증 여부 같은 작업 메모는 쓰지 않는다. 변수 이름은 뜻이 보이게(lo · hi · dist 등). import 는 collections · heapq · math · itertools · functools · bisect 만, 파일 · 입력 · 시스템 접근 · 밑줄 두 개 이름(__name__ 등) 금지, 변수 이름으로 input · open · vars 를 쓰지 않는다. 잘 알려진 코딩 테스트 문제를 그대로 쓰지 않는다`,
    '- flow: 하위목표 골격 3~5단계(초기화 → 반복 조건 → 상태 갱신 → 종료 · 반환 같은), 각 40자 이하',
    SHAPES,
    fix && `직전 설계가 실행 검산에서 실패했다 — 고쳐서 다시 낸다:\n${fix}`
  ].filter(Boolean).join('\n\n')
}

// 상태 꼴이 틀린 까닭 — 다시 설계할 때 AI 가 고칠 수 있게 어느 규칙인지 말한다(scene.ts 의 STATE 규칙과 같은 한도)
const len = (v: unknown): number => (Array.isArray(v) ? v.length : -1)
export function stateProblems(comp: (typeof PROGRESS)[number], s: unknown, props: Record<string, unknown>): string[] {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return ['상태가 JSON 객체가 아니다']
  const o = s as Record<string, unknown>, out: string[] = []
  const long = (xs: unknown, max: number, what: string): void => { if (Array.isArray(xs)) for (const x of xs) if (String(x).length > max) out.push(`${what} '${String(x).slice(0, 20)}' 가 ${max}자를 넘는다`) }
  if (comp === 'ArrayView') {
    if (len(o.values) < 0 || len(o.values) > 12) out.push('values 는 12개 이하 배열')
    if (Array.isArray(o.values) && o.values.some(x => typeof x !== 'string' && typeof x !== 'number')) out.push('values 값은 숫자나 글자')
    long(o.values, 8, 'values 값')
    const ptr = (o.pointers ?? {}) as Record<string, unknown>
    if (Object.keys(ptr).length > 4) out.push(`pointers 가 ${Object.keys(ptr).length}개 — 4개 이하`)
    for (const [k, v] of Object.entries(ptr)) { if (k.length > 8) out.push(`포인터 이름 '${k}' 가 8자를 넘는다`); if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > Math.max(0, len(o.values))) out.push(`포인터 ${k}=${String(v)} 는 0~values 개수 사이 정수여야 한다`) }
    for (const m of (Array.isArray(o.marks) ? o.marks : [])) if (!Number.isInteger(m) || m < 0 || m >= len(o.values)) out.push(`marks ${String(m)} 는 0~values 개수-1 사이`)
  }
  if (comp === 'StackQueue') {
    if (len(o.items) < 0 || len(o.items) > 10) out.push('items 는 0~10개 배열')
    long(o.items, 12, 'items 원소')
    if (Array.isArray(o.items) && o.items.some(x => typeof x !== 'string')) out.push('items 원소는 글자여야 한다(숫자는 str() 로)')
    if (o.op !== undefined && (typeof o.op !== 'string' || o.op.length > 30)) out.push(`op '${String(o.op).slice(0, 30)}…' 는 30자 이하 글`)
  }
  if (comp === 'GridTable') {
    const r = len(props.rows), c = len(props.cols)
    if (len(o.cells) !== r || !(o.cells as unknown[]).every(row => len(row) === c)) out.push(`cells 는 정확히 ${r}행 × ${c}열`)
    if (Array.isArray(o.cells)) for (const row of o.cells) { long(row, 8, '칸 글'); if (Array.isArray(row) && row.some(x => typeof x !== 'string')) out.push('cells 칸은 글자여야 한다(숫자는 str() 로)') }
    if (o.focus !== null && o.focus !== undefined && !(Array.isArray(o.focus) && o.focus.length === 2)) out.push('focus 는 [행, 열] 또는 null')
  }
  if (comp === 'GraphView') {
    const nodes = props.nodes as string[]
    if (o.current !== null && o.current !== undefined && !nodes.includes(o.current as string)) out.push(`current '${String(o.current)}' 는 nodes 에 있는 이름`)
    for (const v of (Array.isArray(o.visited) ? o.visited : [])) if (!nodes.includes(v)) out.push(`visited '${String(v)}' 는 nodes 에 있는 이름`)
    if (!Array.isArray(o.visited)) out.push('visited 는 노드 이름 배열')
    const lb = o.labels
    if (lb !== undefined && (typeof lb !== 'object' || lb === null || Array.isArray(lb))) out.push('labels 는 {"노드":"글"} 객체')
    else if (lb) for (const [k, v] of Object.entries(lb)) { if (!nodes.includes(k)) out.push(`labels 키 '${k}' 는 nodes 에 있는 이름`); if (String(v).length > 8) out.push(`labels 값 '${String(v).slice(0, 12)}' 는 8자 이하(무한은 'inf')`) }
  }
  if (comp === 'StateBoxes') {
    if (len(o.contents) !== len(props.boxes)) out.push(`contents 는 상자 수(${len(props.boxes)})만큼`)
    if (Array.isArray(o.contents)) for (const c of o.contents) { if (len(c) > 8) out.push('상자마다 8칸 이하'); long(c, 30, '칸 글'); if (Array.isArray(c) && c.some(x => typeof x !== 'string')) out.push('contents 칸은 글자여야 한다(숫자는 str() 로)') }
  }
  return out.length ? out : ['꼴이 규칙에 맞지 않는다(키 이름 · 자료형을 확인)']
}

// ── ② 실행 검산 — 설계의 코드를 돌려 상태들을 얻고 꼴을 확인한다
// show(상태) — 부른 줄 번호를 함께 찍는다. 앱이 쓴 코드라 검사 없이 앞에 붙는다(AI 코드는 밑줄 두 개 이름 · _getframe 을 못 쓴다)
export const PRELUDE = 'def show(state, _d=__import__("json").dumps, _f=__import__("sys")._getframe):\n    print(_d({"_line": _f(1).f_lineno - 2, "state": state}))'
// 그림 옆에 보일 코드 — show 줄을 빼고 줄 번호를 다시 매긴다. 박자가 짚는 줄은 show 바로 위의 실제 문장(같은 줄에 붙은 show 면 그 줄)
export const MAX_CODE_LINES = 22
export function viewCode(code: string, called: number[]): { code: string; lines: number[] } | null {
  const src = code.replace(/\s+$/, '').split('\n')
  const isShow = (l: string): boolean => /^\s*show\(/.test(l)
  const at: number[] = [], keep: string[] = []
  for (const l of src) {
    if (isShow(l)) {
      if ((l.match(/\(/g) ?? []).length !== (l.match(/\)/g) ?? []).length) return null // 여러 줄 show 는 숨길 수 없다
      at.push(-1)
      continue
    }
    if (!l.trim() && !keep.at(-1)?.trim()) { at.push(-1); continue } // 빈 줄이 겹치면 하나만
    keep.push(l); at.push(keep.length)
  }
  while (keep.length && (!keep.at(-1)!.trim() || /^\s*#/.test(keep.at(-1)!))) keep.pop() // 끝의 빈 줄 · 메모 주석('# 생략: …')은 뗀다
  if (!keep.length || keep.length > MAX_CODE_LINES) return null
  const lines: number[] = []
  for (const n of called) {
    const i = n - 1
    if (i < 0 || i >= src.length) return null
    if (!isShow(src[i]!)) { lines.push(at[i]!); continue }
    // 위로 올라가며 실제 문장을 찾되, show 보다 깊이 들여 쓴 줄(안쪽 블록 — 이번에 안 돌았을 수 있다)은 건너뛴다
    const ind = (l: string): number => l.length - l.trimStart().length, me = ind(src[i]!)
    let j = i - 1
    while (j >= 0 && (at[j]! < 0 || !src[j]!.trim() || /^\s*#/.test(src[j]!) || ind(src[j]!) > me)) j--
    if (j < 0) return null
    lines.push(at[j]!)
  }
  return { code: keep.join('\n'), lines }
}
export type Exec = { ok: true; props: Record<string, unknown>; states: Record<string, unknown>[]; view: { code: string; lines: number[] } | null } | { ok: false; why: string; aborted?: true }
export async function execDesign(d: Design, runPy: RunPy): Promise<Exec> {
  let raw: unknown
  try { raw = JSON.parse(d.props || '{}') } catch { return { ok: false, why: 'props 가 JSON 이 아닙니다' } }
  const props = checkProps(d.component, raw)
  if (!props) return { ok: false, why: `${d.component} props 꼴이 틀렸습니다: ${d.props.slice(0, 200)}` }
  const r = await runPy(d.code, PRELUDE)
  if (!r.ok) return { ok: false, why: `실행 실패: ${r.error}`, ...(r.aborted && { aborted: true as const }) }
  if (r.lines.length < MIN_STEPS || r.lines.length > MAX_STEPS) return { ok: false, why: `단계가 ${r.lines.length}개입니다(${MIN_STEPS}~${MAX_STEPS}개여야 한다)` }
  const states: Record<string, unknown>[] = [], called: number[] = []
  for (const [i, l] of r.lines.entries()) {
    let s: unknown
    try { s = JSON.parse(l) } catch { return { ok: false, why: `${i + 1}번째 출력이 JSON 이 아닙니다: ${l.slice(0, 120)}` } }
    const tag = s as { _line?: unknown; state?: unknown } | null
    if (tag && typeof tag === 'object' && Number.isInteger(tag._line) && 'state' in tag) { called.push(tag._line as number); s = tag.state } // show() 로 찍은 줄
    const ok = checkState(d.component, s, props)
    if (!ok) return { ok: false, why: `${i + 1}번째 상태 꼴이 ${d.component} 에 맞지 않습니다 — ${stateProblems(d.component, s, props).slice(0, 4).join(' · ')}: ${l.slice(0, 120)}` }
    states.push(ok)
  }
  if (states.every(s => JSON.stringify(s) === JSON.stringify(states[0]))) return { ok: false, why: '모든 단계의 상태가 같습니다 — 진행이 보이지 않는다' }
  return { ok: true, props, states, view: called.length === states.length ? viewCode(d.code, called) : null }
}

// 박자 사이에 바뀐 것 — AI 는 JSON 두 덩어리를 견주는 데 자주 틀린다(union-find 에서 자막 · 정답이 한 박자 어긋났다). 앱이 직접 계산해 준다
const flat = (v: unknown, path: string, out: Map<string, string>): void => {
  if (Array.isArray(v)) v.forEach((x, i) => flat(x, `${path}[${i}]`, out))
  else if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) flat(x, path ? `${path}.${k}` : k, out)
  else out.set(path, v === null ? 'null' : String(v))
}
// 상자 · 표 칸은 이름으로 — contents[0][2] → '부모(0~4)'[2], cells[1][3] → '최소비용'·'발판3'
function nameOf(path: string, props: Record<string, unknown>): string {
  const boxes = props.boxes as string[] | undefined, rows = props.rows as string[] | undefined, cols = props.cols as string[] | undefined
  return path
    .replace(/^contents\[(\d+)\]/, (m, i) => (boxes?.[+i] ? `'${boxes[+i]}'` : m))
    .replace(/^cells\[(\d+)\]\[(\d+)\]$/, (m, r, c) => (rows?.[+r] && cols?.[+c] ? `'${rows[+r]}'·'${cols[+c]}'` : m))
}
export function stateDiff(prev: Record<string, unknown> | undefined, cur: Record<string, unknown>, props: Record<string, unknown>): string {
  if (!prev) return '처음 상태'
  const a = new Map<string, string>(), b = new Map<string, string>()
  flat(prev, '', a); flat(cur, '', b)
  const out: string[] = []
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k), y = b.get(k)
    if (x !== y) out.push(`${nameOf(k, props)}: ${x ?? '(없음)'} → ${y ?? '(없음)'}`)
  }
  return out.length ? out.slice(0, 12).join(', ') + (out.length > 12 ? ` 외 ${out.length - 12}곳` : '') : '바뀐 것 없음'
}

// ── ③ 장면 쓰기 — 상태 · 꼴은 고정, 자막 · 강조 · 질문만
export const WRITE_SCHEMA = obj({
  summary: arr(str(120), 3, 5),
  card: arr(obj({ caption: str(200), highlight: arr(str(40), 0, 5) }), 3, 5),
  progress: arr(obj({ caption: str(200), highlight: arr(str(40), 0, 5), predict: PREDICT }), MIN_STEPS, MAX_STEPS),
  flow: arr(obj({ caption: str(200), highlight: arr(str(40), 0, 5) }), 3, 5)
})
interface Line { caption: string; highlight: string[] }
interface Written { summary: string[]; card: Line[]; progress: (Line & { predict: PredictQ })[]; flow: Line[] }
export function writePrompt(c: ConceptRef, d: Design, states: Record<string, unknown>[], issues: string[] = [], props: Record<string, unknown> = {}, view: { code: string; lines: number[] } | null = null): string {
  const codeLines = view?.code.split('\n') ?? []
  const ran = (i: number): string => (view ? `\n   실행한 줄: ${view.lines[i]} \`${codeLines[view.lines[i]! - 1]?.trim() ?? ''}\`` : '')
  return [
    `개념: ${c.name} · 목표: ${d.goal}`,
    `용어 카드(박자마다 하나씩 보인다):\n${d.terms.map((t, i) => `${i + 1}. ${t.term} — ${t.text}`).join('\n')}`,
    `진행 장면 '${d.title}' (${d.component}) — 상태는 실행으로 확인한 것이라 바꿀 수 없다. 박자 i 는 상태 i, '바뀐 것' 은 앱이 직전 상태와 견준 결과(믿어도 된다):\n${states.map((s, i) => `${i + 1}. ${JSON.stringify(s)}\n   바뀐 것: ${stateDiff(states[i - 1], s, props)}${ran(i)}`).join('\n')}`,
    view && `그림 옆에 이 코드가 보이고, 박자마다 '실행한 줄' 이 짚힌다:\n${codeLines.map((l, i) => `${String(i + 1).padStart(2)} ${l}`).join('\n')}\n- progress 자막은 그림의 변화와 그 변화를 만든 코드를 이어 말한다. 실행한 줄은 코드 칸에서 짚어 주니 자막에 코드를 통째로 옮기지 않는다 — 처음 나오는 줄만 변수 이름으로 짧게 잇고(예: 'lo 를 mid 다음 칸으로 옮겨 왼쪽 절반을 버려요'), 같은 줄이 되풀이되면 무엇이 달라졌는지만 말한다. 줄 번호는 자막에 쓰지 않는다`,
    `골격 흐름: ${d.flow.map((f, i) => `${i + 1}. ${f}`).join(' → ')}`,
    `할 일: 장면마다 박자 수에 꼭 맞게 자막을 쓴다 — card ${d.terms.length}개, progress ${states.length}개, flow ${d.flow.length}개. caption 은 그 박자의 '바뀐 것' 을 무엇이 왜 바뀌었는지 사람 말로 한두 문장(200자 이하) — 바뀐 것에 없는 변화를 지어내지 않는다, highlight 는 강조할 낱말 0~5개.`,
    '- progress 는 2~3 박자마다 predict 질문 하나(첫 박자 제외, 마지막 박자 제외). 질문이 있는 박자 i 는 \'바뀌기 직전\' — 그 박자 자막은 지금 상황만 말하고 답을 말하지 않는다. 정답은 박자 i+1 의 \'바뀐 것\' 에서 보여야 한다 — 다음 박자에서 바뀔 것을 묻고, 지금 화면에 이미 보이는 것(지금 맨 위 값 · 지금 포인터 위치)을 묻지 않는다. question 은 언제의 무엇을 묻는지 혼자 읽어도 알게 한 문장, choices 정확히 3개(같은 꼴, 헷갈리지 않게), answer 는 0부터 센 번호, why 는 정답인 이유 한 문장, notes 는 보기마다 한 줄 3개. 질문이 없는 박자는 {"question":"","choices":[],"answer":0,"why":"","notes":[]}',
    '- 자막에 위 상태 JSON 을 옮겨 쓰지 않는다 — 화면에 그림으로 보이니 자막은 사람 말로만',
    '- 포인터 · 표시가 처음 나오는 박자 자막에서 그 뜻을 짧게 말한다(예: end 는 창 끝 바로 다음 칸)',
    '- summary 는 이 개념을 다시 볼 때 보여 줄 요약 3~5줄. 특정 문제의 풀이는 쓰지 않는다',
    issues.length > 0 && `직전 결과의 고칠 점:\n${issues.map(x => `- ${x}`).join('\n')}`
  ].filter(Boolean).join('\n\n')
}
// 자막 속 JSON 조각 — AI 가 프롬프트의 상태 목록을 자막 앞에 옮겨 적는 일이 있었다. '{"' 로 시작해 짝이 맞고 JSON 으로 읽히는 덩어리
export function jsonBits(t: string): string[] {
  const out: string[] = []
  for (let i = t.indexOf('{"'); i >= 0; i = t.indexOf('{"', i + 1)) {
    let depth = 0
    for (let j = i; j < t.length; j++) {
      if (t[j] === '{') depth++
      else if (t[j] === '}' && --depth === 0) { const bit = t.slice(i, j + 1); try { JSON.parse(bit); out.push(bit) } catch { /* JSON 아님 */ } break }
    }
  }
  return out
}
const stripJson = (t: string): string => jsonBits(t).reduce((s, b) => s.replace(b, ''), t).replace(/\s{2,}/g, ' ').trim()

// 앱이 장면을 조립한다 — 용어 카드 · 진행 장면 · 골격 흐름(꼴은 normalizeScenes 가 한 번 더 확인)
export function assemble(d: Design, props: Record<string, unknown>, states: Record<string, unknown>[], w: Written, view: { code: string; lines: number[] } | null = null): Scene[] {
  const beat = (l: Line, state: unknown, predict: PredictQ = NO_Q) => ({ caption: stripJson(l.caption), highlight: l.highlight, state: JSON.stringify(state), predict })
  const raw: RawScene[] = [
    { component: 'ConceptCard', title: t('용어'), props: JSON.stringify({ items: d.terms }), beats: d.terms.map((_, i) => beat(w.card[i] ?? { caption: '', highlight: [] }, { reveal: i + 1 })) },
    { component: d.component, title: d.title || t('한 단계씩'), props: JSON.stringify(props), ...(view ? { code: view.code } : {}), beats: states.map((s, i) => { const l = w.progress[i] ?? { caption: '', highlight: [], predict: NO_Q }; return { ...beat(l, s, l.predict), ...(view ? { line: view.lines[i] } : {}) } }) },
    { component: 'Flow', title: t('골격'), props: JSON.stringify({ nodes: d.flow }), beats: d.flow.map((_, i) => beat(w.flow[i] ?? { caption: '', highlight: [] }, { at: i })) }
  ]
  return normalizeScenes(raw, { allowCode: true })
}

// ── ④ 품질 검사(규칙) — 고칠 점 목록, 없으면 빈 배열
const norm = (t: string): string => t.replace(/\s+/g, '').toLowerCase()
export function qualityIssues(scenes: Scene[], o: { progressAt?: number; minScenes?: number } = {}): string[] {
  const out: string[] = []
  if (scenes.length < (o.minScenes ?? 3)) out.push(`장면이 ${scenes.length}개뿐이다`)
  const fallback = scenes.filter((s, i) => s.component === 'Caption' && i === o.progressAt).length
  if (fallback) out.push('진행 장면이 꼴을 어겨 자막만 남았다')
  scenes.forEach((s, si) => s.beats.forEach((b, bi) => {
    if (!b.caption.trim()) out.push(`장면 ${si + 1} 박자 ${bi + 1} 자막이 비었다`)
    if (jsonBits(b.caption).length) out.push(`장면 ${si + 1} 박자 ${bi + 1}: 자막에 상태 JSON 을 옮겨 적었다`)
  }))
  if (o.progressAt !== undefined) {
    const p = scenes[o.progressAt]
    if (p) {
      const n = p.beats.length, qs = p.beats.map(b => !!b.predict)
      const need = Math.max(1, Math.floor((n - 1) / 3))
      if (qs.filter(Boolean).length < need) out.push(`진행 장면 예측 질문이 ${qs.filter(Boolean).length}개다 — 2~3 박자마다 하나, ${need}개 이상`)
      let gap = 0
      for (const q of qs.slice(1)) { gap = q ? 0 : gap + 1; if (gap >= 4) { out.push('진행 장면에 예측 질문 없이 4 박자 넘게 이어지는 곳이 있다'); break } }
      if (qs[n - 1]) out.push('마지막 박자에 질문이 있다 — 답을 보여 줄 다음 박자가 없다')
    }
  }
  // 질문 박자 자막이 정답을 미리 말하면 안 된다
  scenes.forEach((s, si) => s.beats.forEach((b, bi) => {
    const q = b.predict
    if (!q) return
    const ans = q.choices[q.answer] ?? ''
    if (norm(ans).length >= 2 && norm(b.caption).includes(norm(ans))) out.push(`장면 ${si + 1} 박자 ${bi + 1}: 질문 박자 자막이 정답 '${ans}' 을 미리 말한다`)
    if (new Set(q.choices.map(norm)).size !== q.choices.length) out.push(`장면 ${si + 1} 박자 ${bi + 1}: 보기가 겹친다`)
  }))
  return out
}

// ── ⑤ 학습 점검 — 처음 배우는 사람 눈으로, 자막 · 질문만 고친다(상태 · 꼴은 그대로)
export const CHECK_SCHEMA = obj({ items: arr(obj({ id: str(12), problem: str(160), caption: str(200), predict: PREDICT }), 0, 30) })
const beatId = (si: number, bi: number): string => `s${si + 1}b${bi + 1}`
export function checkPrompt(c: ConceptRef, scenes: Scene[]): string {
  const lines = scenes.flatMap((s, si) => [`## 장면 ${si + 1} ${s.component} '${s.title}'`, ...s.beats.map((b, bi) => `${beatId(si, bi)} 상태 ${JSON.stringify(b.state).slice(0, 220)}${PROGRESS.includes(s.component as never) ? `\n  바뀐 것(앱 계산): ${stateDiff(s.beats[bi - 1]?.state as Record<string, unknown> | undefined, b.state as Record<string, unknown>, s.props as Record<string, unknown>)}` : ''}${s.code && b.line ? `\n  실행한 줄: \`${s.code.split('\n')[b.line - 1]?.trim() ?? ''}\`` : ''}\n  자막: ${b.caption}${b.predict ? `\n  질문: ${b.predict.question} / 보기: ${b.predict.choices.map((x, i) => `${i}) ${x}`).join(' ')} / 정답 ${b.predict.answer}` : ''}`)])
  return [
    `개념: ${c.name}`,
    lines.join('\n'),
    '할 일: 이 개념을 처음 배우는 사람 눈으로 박자를 하나씩 본다. 걸리는 박자만 items 에 낸다(없으면 빈 배열): 자막이 상태와 맞지 않음, 질문이 모호함(언제의 무엇인지 모름), 질문 박자 자막이 답을 미리 말함, 지금 화면에 이미 보이는 답을 묻는 질문(생각할 거리가 없음), 정답이 다음 박자의 \'바뀐 것\' 과 맞지 않음(질문 박자마다 꼭 대조한다), 자막이 그 박자의 \'바뀐 것\' 에 없는 변화를 말함, 포인터 · 표시의 뜻을 말하지 않아 헷갈림, 오개념을 부르는 설명. id 는 박자 이름(예 s2b3), problem 은 무엇이 걸리는지 한 문장, caption 은 고친 자막(그대로 둘 거면 빈 글), predict 는 고친 질문(질문을 고치지 않으면 question 빈 글). 상태는 바꿀 수 없다 — 자막 · 질문을 상태에 맞춘다'
  ].join('\n\n')
}
export function applyCheck(scenes: Scene[], items: { id: string; problem: string; caption: string; predict: PredictQ }[], o: { progressAt?: number; codeLike?: (t: string) => boolean }): { scenes: Scene[]; applied: number; rejected: number } {
  let cur = scenes, applied = 0, rejected = 0
  for (const it of items) {
    const m = it.id.match(/^s(\d+)b(\d+)$/)
    const si = m ? +m[1]! - 1 : -1, bi = m ? +m[2]! - 1 : -1
    const beat = cur[si]?.beats[bi]
    if (!beat) { rejected++; continue }
    // 문제 연결은 정답 코드가 새면 안 된다 — 코드처럼 보이는 고침은 받지 않는다
    if (o.codeLike && [it.caption, it.predict.question, ...it.predict.choices].some(t => t && o.codeLike!(t))) { rejected++; continue }
    it.predict.choices = it.predict.choices.map(x => x.replace(/^\s*\d\)\s*/, '')) // 점검 지시의 '0) 보기' 꼴을 그대로 옮겨 오는 일이 있었다
    const q = it.predict.question.trim() && it.predict.choices.length === 3 && it.predict.answer >= 0 && it.predict.answer < 3 ? it.predict : null
    const next = cur.map((s, i) => (i !== si ? s : { ...s, beats: s.beats.map((b, j) => (j !== bi ? b : { ...b, caption: it.caption.trim() || b.caption, ...(q ? { predict: { question: q.question, choices: q.choices, answer: q.answer, ...(q.why ? { why: q.why } : {}), ...(q.notes?.length === 3 ? { notes: q.notes } : {}) } } : {}) })) })) as Scene[]
    // 고친 것이 규칙을 새로 어기면 받지 않는다
    if (qualityIssues(next, o).length > qualityIssues(cur, o).length) { rejected++; continue }
    cur = next
    applied++
  }
  return { scenes: cur, applied, rejected }
}

// ── 개념 이론
export async function runTheory(c: ConceptRef, ask: Ask, runPy: RunPy, stage: Stage): Promise<TheoryOut> {
  const on = (id: TheoryStage['stage']): void => stage({ stage: id, state: 'on' }), done = (id: TheoryStage['stage'], note: string): void => stage({ stage: id, state: 'done', note })
  let d: Design | null = null, ex: Awaited<ReturnType<typeof execDesign>> | null = null, fix = ''
  for (let round = 1; round <= 2; round++) { // 실행 검산이 실패하면 까닭을 주고 설계를 한 번 더
    on('design')
    const r = await ask<Design>('theory-design', designPrompt(c, fix), DESIGN_SCHEMA)
    if (!r.ok) return r
    d = r.value
    done('design', `${t('용어 {n}개', { n: d.terms.length })} · ${d.component}${round > 1 ? ` · ${t('다시 설계')}` : ''}`)
    on('exec')
    ex = await execDesign(d, runPy)
    if (!ex.ok && ex.aborted) return { ok: false, error: { code: 'aborted', message: t('취소했습니다') } } // 취소는 실패가 아니다 — 다시 설계하지 않는다
    if (ex.ok) { done('exec', t('상태 {n}단계 확인', { n: ex.states.length })); break }
    done('exec', t('실패 — {why}', { why: ex.why.slice(0, 60) }))
    fix = ex.why
  }
  if (!d || !ex?.ok) return { ok: false, error: { code: 'bad-output', message: t('진행 상태를 실행으로 확인하지 못했습니다({why}) — 다시 시도해 주세요', { why: ex && !ex.ok ? ex.why : '' }) } }
  const notes: string[] = []
  let scenes: Scene[] = [], summary: string[] = [], issues: string[] = []
  for (let round = 1; round <= 2; round++) { // 품질 검사를 어기면 고칠 점을 주고 한 번 더
    on('write')
    const w = await ask<Written>('theory-write', writePrompt(c, d, ex.states, issues, ex.props, ex.view), WRITE_SCHEMA)
    if (!w.ok) return w
    const next = assemble(d, ex.props, ex.states, w.value, ex.view), nextIssues = qualityIssues(next, { progressAt: 1 })
    if (round === 1 || nextIssues.length < issues.length) { scenes = next; summary = w.value.summary; issues = nextIssues }
    done('write', t('장면 {n}개 · 질문 {q}개', { n: scenes.length, q: scenes.reduce((n, x) => n + x.beats.filter(b => b.predict).length, 0) }))
    on('quality')
    done('quality', issues.length ? `${t('고칠 점 {n}개', { n: issues.length })}${round < 2 ? ` — ${t('다시 쓰기')}` : ''}` : t('통과'))
    if (!issues.length) break
  }
  notes.push(...issues)
  on('check')
  const k = await ask<{ items: { id: string; problem: string; caption: string; predict: PredictQ }[] }>('theory-check', checkPrompt(c, scenes), CHECK_SCHEMA)
  if (!k.ok) return k
  const fixed = applyCheck(scenes, k.value.items, { progressAt: 1 })
  done('check', `${t('걸린 박자 {n}개 · 고침 {m}', { n: k.value.items.length, m: fixed.applied })}${fixed.rejected ? ` · ${t('거절 {n}', { n: fixed.rejected })}` : ''}`)
  return { ok: true, set: { summary, scenes: fixed.scenes }, notes }
}

// ── 문제 연결 — 한 번에 쓴 장면을 품질 검사 · 학습 점검(정답 코드가 새지 않게 실행 검산은 없다)
// 단서 대조 — 문제 연결의 인용(Caption quote)은 문제 글 그대로여야 한다. 대소문자 · 띄어쓰기만 다르면 원문으로 바꾸고, 원문에 없으면 인용을 뗀다
export function fixQuotes(scenes: Scene[], source: string): { scenes: Scene[]; fixed: number; dropped: number } {
  const src = source.replace(/\s+/g, ' '), low = src.toLowerCase()
  let fixed = 0, dropped = 0
  const out = scenes.map(s => {
    const q = s.component === 'Caption' ? (s.props as { quote?: string }).quote : undefined
    if (!q) return s
    const t = q.replace(/\s+/g, ' ').trim()
    if (src.includes(t)) return s
    const at = low.indexOf(t.toLowerCase())
    if (at >= 0) { fixed++; return { ...s, props: { quote: src.slice(at, at + t.length) } } }
    dropped++
    return { ...s, props: {} }
  }) as Scene[]
  return { scenes: out, fixed, dropped }
}

export async function runMapping(c: ConceptRef, write: () => Promise<AskResult<SceneSet | null>>, ask: Ask, stage: Stage, codeLike: (t: string) => boolean, source = ''): Promise<TheoryOut> {
  stage({ stage: 'write', state: 'on' })
  const w = await write()
  if (!w.ok) return w
  if (!w.value) return { ok: false, error: { code: 'bad-output', message: t('장면을 만들지 못했습니다 — 다시 시도해 주세요') } }
  const clean = w.value.scenes.map(s => ({ ...s, beats: s.beats.map(b => ({ ...b, caption: stripJson(b.caption) })) })) as Scene[] // 자막 속 JSON 조각은 걷어 낸다
  const qs = source ? fixQuotes(clean, source) : { scenes: clean, fixed: 0, dropped: 0 }
  w.value.scenes = qs.scenes
  stage({ stage: 'write', state: 'done', note: `${t('장면 {n}개', { n: w.value.scenes.length })}${qs.fixed + qs.dropped ? ` · ${t('인용 고침 {a} · 뗌 {b}', { a: qs.fixed, b: qs.dropped })}` : ''}` })
  stage({ stage: 'quality', state: 'on' })
  const issues = qualityIssues(w.value.scenes)
  stage({ stage: 'quality', state: 'done', note: issues.length ? t('고칠 점 {n}개', { n: issues.length }) : t('통과') })
  stage({ stage: 'check', state: 'on' })
  const k = await ask<{ items: { id: string; problem: string; caption: string; predict: PredictQ }[] }>('theory-check', checkPrompt(c, w.value.scenes), CHECK_SCHEMA)
  if (!k.ok) return k
  const fixed = applyCheck(w.value.scenes, k.value.items, { codeLike })
  stage({ stage: 'check', state: 'done', note: t('걸린 박자 {n}개 · 고침 {m}', { n: k.value.items.length, m: fixed.applied }) })
  return { ok: true, set: { summary: w.value.summary, scenes: fixed.scenes }, notes: issues }
}

