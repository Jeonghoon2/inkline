import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeScenes, flatBeats, sceneKey, CONCEPT_KEY_RE, type RawScene } from '../src/shared/scene.ts'

const beat = (state: unknown, extra: Partial<{ caption: string; highlight: string[]; predict: { question: string; choices: string[]; answer: number } }> = {}) => ({
  caption: extra.caption ?? '자막', highlight: extra.highlight ?? [], state: JSON.stringify(state), predict: extra.predict ?? { question: '', choices: [], answer: 0 }
})
const raw = (component: string, props: unknown, beats: ReturnType<typeof beat>[]): RawScene => ({ component, title: '제목', props: JSON.stringify(props), beats })

test('올바른 ArrayView 는 그대로 파싱된다', () => {
  const [s] = normalizeScenes([raw('ArrayView', {}, [beat({ values: [1, 2, 3], pointers: { i: 0, j: 2 }, marks: [] })])], { allowCode: true })
  assert.equal(s.component, 'ArrayView')
  assert.deepEqual(s.beats[0].state, { values: [1, 2, 3], pointers: { i: 0, j: 2 }, marks: [] })
})

test('포인터가 배열 밖이면 Caption 으로 바뀐다', () => {
  const [s] = normalizeScenes([raw('ArrayView', {}, [beat({ values: [1], pointers: { i: 5 }, marks: [] })])], { allowCode: true })
  assert.equal(s.component, 'Caption')
  assert.equal(s.beats[0].caption, '자막')
})

test('모르는 컴포넌트 · 깨진 JSON 은 Caption', () => {
  const out = normalizeScenes([
    raw('Hologram', {}, [beat({})]),
    { component: 'Flow', title: 't', props: '{nodes:', beats: [beat({ at: 0 })] }
  ], { allowCode: true })
  assert.deepEqual(out.map(s => s.component), ['Caption', 'Caption'])
})

test('ConceptCard reveal 범위', () => {
  const ok = normalizeScenes([raw('ConceptCard', { items: [{ term: '포인터', text: '위치' }] }, [beat({ reveal: 1 })])], { allowCode: true })
  const bad = normalizeScenes([raw('ConceptCard', { items: [{ term: '포인터', text: '위치' }] }, [beat({ reveal: 2 })])], { allowCode: true })
  assert.equal(ok[0].component, 'ConceptCard')
  assert.equal(bad[0].component, 'Caption')
})

test('GridTable 은 rows×cols 칸이어야 한다', () => {
  const props = { rows: ['0', '1'], cols: ['a', 'b'] }
  const ok = normalizeScenes([raw('GridTable', props, [beat({ cells: [['1', ''], ['', '2']], focus: [1, 1] })])], { allowCode: true })
  const bad = normalizeScenes([raw('GridTable', props, [beat({ cells: [['1']], focus: null })])], { allowCode: true })
  assert.equal(ok[0].component, 'GridTable')
  assert.equal(bad[0].component, 'Caption')
})

test('GraphView current 는 노드 이름이어야 한다', () => {
  const props = { nodes: ['A', 'B'], edges: [['A', 'B']], directed: false }
  assert.equal(normalizeScenes([raw('GraphView', props, [beat({ current: 'A', visited: ['A'] })])], { allowCode: true })[0].component, 'GraphView')
  assert.equal(normalizeScenes([raw('GraphView', props, [beat({ current: 'Z', visited: [] })])], { allowCode: true })[0].component, 'Caption')
  assert.equal(normalizeScenes([raw('GraphView', { ...props, edges: [['A', 'Q']] }, [beat({ current: null, visited: [] })])], { allowCode: true })[0].component, 'Caption')
})

test('predict 는 모양이 맞을 때만 붙는다', () => {
  const [s] = normalizeScenes([raw('Caption', {}, [
    beat({}, { predict: { question: '다음 칸은?', choices: ['1', '2'], answer: 1 } }),
    beat({}, { predict: { question: '다음 칸은?', choices: ['1'], answer: 0 } }),
    beat({}, { predict: { question: '', choices: ['1', '2'], answer: 0 } })
  ])], { allowCode: true })
  assert.deepEqual(s.beats.map(b => !!b.predict), [true, false, false])
})

test('Predict 장면은 모든 박자에 predict 가 있어야 한다', () => {
  const [s] = normalizeScenes([raw('Predict', {}, [beat({})])], { allowCode: true })
  assert.equal(s.component, 'Caption')
})

test('allowCode=false: CodeTrace 금지, 코드 같은 자막 제거, 빈 장면 제거', () => {
  const codeLike = (t: string) => /return /.test(t)
  const out = normalizeScenes([
    raw('CodeTrace', { language: 'python', code: 'x = 1' }, [beat({ line: 1, vars: {} })]),
    raw('Caption', {}, [beat({}, { caption: 'return x' })]),
    raw('Caption', {}, [beat({}, { caption: '단서를 보자' }), beat({}, { caption: 'return y' })])
  ], { allowCode: false, codeLike })
  assert.equal(out.length, 2)
  assert.equal(out[0].component, 'Caption')
  assert.deepEqual(out[1].beats.map(b => b.caption), ['단서를 보자'])
})

test('장면 · 박자 · 자막 · highlight 는 잘린다', () => {
  const many = Array.from({ length: 15 }, () => raw('Caption', {}, [beat({}, { caption: 'x'.repeat(300), highlight: ['a', 'b', 'c', 'd', 'e', 'f'] })]))
  const out = normalizeScenes(many, { allowCode: true })
  assert.equal(out.length, 12)
  assert.equal(out[0].beats[0].caption.length, 200)
  assert.equal(out[0].beats[0].highlight.length, 5)
})

test('flatBeats · sceneKey · CONCEPT_KEY_RE', () => {
  const out = normalizeScenes([raw('Caption', {}, [beat({}), beat({})]), raw('Caption', {}, [beat({})])], { allowCode: true })
  assert.deepEqual(flatBeats(out), [{ scene: 0, beat: 0 }, { scene: 0, beat: 1 }, { scene: 1, beat: 0 }])
  assert.equal(sceneKey.concept('two-pointers'), 'concept:two-pointers')
  assert.equal(sceneKey.map(7, 'two-pointers'), 'map:7:two-pointers')
  assert.ok(CONCEPT_KEY_RE.test('sliding-window'))
  assert.ok(!CONCEPT_KEY_RE.test('Sliding Window'))
  assert.ok(!CONCEPT_KEY_RE.test('a-'))
})

test('가짜 AI 장면 파일은 대체 없이 모두 통과한다', () => {
  for (const f of ['theory', 'mapping']) {
    const j = JSON.parse(readFileSync(new URL(`./fixtures/ai/${f}.json`, import.meta.url), 'utf8'))
    const out = normalizeScenes(j.scenes, { allowCode: f === 'theory' })
    assert.equal(out.length, j.scenes.length, f)
    out.forEach((s, i) => assert.equal(s.component, j.scenes[i].component, `${f} ${i}`))
  }
})

const cl = (s: string) => /\breturn\b|\bdef\b|;\s*$/.test(s)
const noCode = { allowCode: false, codeLike: cl }

test('코드처럼 보이는 제목 · props · predict 는 allowCode:false 에서 걸러진다', () => {
  const t = normalizeScenes([{ ...raw('Flow', { nodes: ['a', 'b'] }, [beat({ at: 0 })]), title: 'def twoSum(nums, target):' }], noCode)[0]
  assert.equal(t.component, 'Caption'); assert.equal(t.title, '')
  const c = normalizeScenes([raw('CompareCard', { left: { label: 'L', points: ['if target - x in seen: return [seen[target-x], i]'] }, right: { label: 'R', points: ['p'] }, summary: 's' }, [beat({ focus: 'left' })])], noCode)[0]
  assert.equal(c.component, 'Caption'); assert.equal(c.title, '')
  const p = normalizeScenes([raw('Flow', { nodes: ['a', 'b'] }, [beat({ at: 0 }, { predict: { question: '다음은?', choices: ['return [i, j];', '끝'], answer: 1 } })])], noCode)[0]
  assert.equal(p.component, 'Flow'); assert.equal(p.beats[0].predict, undefined)
  const s = normalizeScenes([raw('StackQueue', { kind: 'stack' }, [beat({ items: ['return x'] })])], noCode)[0]
  assert.equal(s.component, 'Caption')
  const q = normalizeScenes([raw('Caption', { quote: 'return the indices' }, [beat({})])], noCode)[0]
  assert.deepEqual(q.props, { quote: 'return the indices' })
})

test('범위 · 모양이 틀린 장면은 Caption 이 된다', () => {
  const bad: [string, unknown, unknown][] = [
    ['CodeTrace', { language: 'python3', code: 'a\nb' }, { line: 3, vars: {} }],
    ['Flow', { nodes: ['a', 'b'] }, { at: 2 }],
    ['StateBoxes', { boxes: ['a', 'b'] }, { contents: [[]] }],
    ['StackQueue', { kind: 'tree' }, { items: [] }],
    ['CompareCard', { left: { label: 'L', points: ['1'] }, right: { label: 'R', points: ['1', '2', '3', '4', '5'] }, summary: 's' }, { focus: 'left' }],
    ['Caption', { quote: 'x'.repeat(301) }, {}]
  ]
  for (const [c, props, state] of bad) assert.equal(normalizeScenes([raw(c, props, [beat(state)])], { allowCode: true })[0].component, 'Caption', c)
})

test('predict 의 why · notes 를 받고, 길이가 다른 notes 는 버린다', () => {
  const pr = (extra: object) => ({ question: '다음은?', choices: ['a', 'b', 'c'], answer: 1, ...extra })
  const s = normalizeScenes([raw('Caption', {}, [
    beat({}, { predict: pr({ why: '이유', notes: ['x', 'y', 'z'] }) as never }),
    beat({}, { predict: pr({ why: '이유', notes: ['x', 'y'] }) as never }),
    beat({}, { predict: pr({}) as never })
  ])], { allowCode: true })[0]
  assert.deepEqual(s.beats[0].predict?.notes, ['x', 'y', 'z']); assert.equal(s.beats[0].predict?.why, '이유')
  assert.equal(s.beats[1].predict?.notes, undefined); assert.equal(s.beats[1].predict?.why, '이유')
  assert.equal(s.beats[2].predict?.why, undefined)
})

test('GraphView — 숫자 가중치는 글로 받고, labels 는 노드 이름 · 8자 이하만', () => {
  const props = JSON.stringify({ nodes: ['A', 'B'], edges: [['A', 'B', 4]], directed: false })
  const sc = (state: object): RawScene[] => [{ component: 'GraphView', title: 'g', props, beats: [{ caption: 'c', highlight: [], state: JSON.stringify(state), predict: { question: '', choices: [], answer: 0, why: '', notes: [] } }] } as unknown as RawScene]
  const ok = normalizeScenes(sc({ current: 'A', visited: [], labels: { A: 0, B: 'inf' } }), { allowCode: true })[0]!
  assert.equal(ok.component, 'GraphView')
  assert.deepEqual((ok.props as { edges: unknown }).edges, [['A', 'B', '4']])
  assert.deepEqual((ok.beats[0]!.state as { labels: unknown }).labels, { A: '0', B: 'inf' })
  assert.notEqual(normalizeScenes(sc({ current: 'A', visited: [], labels: { Z: '1' } }), { allowCode: true })[0]!.component, 'GraphView')
})
