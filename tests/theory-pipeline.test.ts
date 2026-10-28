import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validate } from '../src/main/ai/schema.ts'
import { CHECK_SCHEMA, DESIGN_SCHEMA, WRITE_SCHEMA, applyCheck, assemble, execDesign, qualityIssues, runMapping, runTheory, stateProblems, stateDiff, fixQuotes, viewCode, jsonBits, type RunPy } from '../src/main/theory/pipeline.ts'
import { canSandbox, runPy } from '../src/main/theory/sandbox.ts'
import { cleanScenes } from '../src/main/theory/prompts.ts'
import type { ConceptRef, TheoryStage } from '../src/shared/types.ts'
import type { Ask } from '../src/main/ai/run.ts'

const C: ConceptRef = { key: 'two-pointers', name: '투 포인터', nature: 'algorithm', tag: '' }
const fx = async (n: string) => JSON.parse(await readFile(`tests/fixtures/ai/${n}.json`, 'utf8'))
const state = (l: number, r: number) => JSON.stringify({ values: [1, 3, 4, 6, 8], pointers: { l, r }, marks: [l, r] })
const fakePy = (lines: string[]): RunPy => async () => ({ ok: true, lines })
const fake = (answers: Record<string, unknown[]>, calls: string[] = []): Ask => (async (task: string) => { calls.push(task); const a = answers[task]; const v = a?.shift(); return v === undefined ? { ok: false, error: { code: 'cli-error', message: `없음 ${task}` } } : { ok: true, value: v } }) as Ask
const log = (): { l: string[]; on: (s: TheoryStage) => void } => { const l: string[] = []; return { l, on: s => l.push(`${s.stage}:${s.state}${s.note ? ` ${s.note}` : ''}`) } }

test('가짜 AI 응답 파일은 모듈 형식을 지킨다', async () => {
  assert.equal(validate(await fx('theory-design'), DESIGN_SCHEMA), null)
  assert.equal(validate(await fx('theory-write'), WRITE_SCHEMA), null)
  assert.equal(validate(await fx('theory-check'), CHECK_SCHEMA), null)
})

test('실행 검산 — 꼴 · 단계 수 · 같은 상태만 · 실행 실패를 까닭과 함께', async () => {
  const d = await fx('theory-design')
  const ok = await execDesign(d, fakePy([state(0, 4), state(1, 4), state(1, 3), state(2, 3), state(2, 3)]))
  assert.ok(ok.ok && ok.states.length === 5 && (ok.states[1] as { pointers: { l: number } }).pointers.l === 1)
  assert.match((await execDesign(d, fakePy([state(0, 4), state(1, 4)])) as { why: string }).why, /단계가 2개/)
  assert.match((await execDesign(d, fakePy(Array(5).fill(state(0, 4)))) as { why: string }).why, /모든 단계의 상태가 같습니다/)
  assert.match((await execDesign(d, fakePy([state(0, 4), '{"values":[1],"pointers":{"l":9}}', state(1, 3), state(2, 3), state(2, 3)])) as { why: string }).why, /2번째 상태 꼴/)
  assert.match((await execDesign({ ...d, props: '{"label":' }, fakePy([])) as { why: string }).why, /props 가 JSON/)
  assert.match(((await execDesign(d, async () => ({ ok: false, error: 'NameError' }))) as { why: string }).why, /실행 실패: NameError/)
})

test('실제 실행 — 가짜 설계 코드가 격리 실행에서 상태 5단계를 낸다', { skip: !canSandbox() }, async () => {
  const r = await execDesign(await fx('theory-design'), (code, prelude) => runPy(code, { prelude }))
  assert.ok(r.ok && r.states.length === 5)
  // show() 가 부른 줄 → 화면 코드(show 줄 뺀 11줄)의 짚을 줄: 초기화 · l += 1 · r -= 1 · l += 1 · if s == t
  assert.deepEqual(r.view?.lines, [3, 9, 11, 9, 6])
  assert.equal(r.view?.code.split('\n').length, 11)
  assert.ok(!r.view?.code.includes('show('))
})

test('그림 옆 코드 — show 줄을 빼고 번호를 다시 매기며, 짚을 줄은 show 위의 실제 문장', () => {
  const code = 'x = 0\n\nfor i in range(3):\n    x += i\n    show({"x": x})\n# 끝\nshow({"x": x})\n'
  // 부른 줄: 5(루프 안) · 7(루프 뒤 — 안쪽 블록은 건너뛰고 for 줄)
  assert.deepEqual(viewCode(code, [5, 7]), { code: 'x = 0\n\nfor i in range(3):\n    x += i', lines: [4, 3] })
  assert.deepEqual(viewCode('x = 1; show({"x": x})', [1])?.lines, [1]) // 같은 줄에 붙은 show 는 그 줄
  assert.equal(viewCode('x = 1\nshow({\n "x": x})', [2]), null) // 여러 줄 show 는 숨길 수 없다
  assert.equal(viewCode(Array.from({ length: 23 }, (_, i) => `v${i} = ${i}`).join('\n') + '\nshow({})', [24]), null) // 22줄 넘음
  assert.equal(viewCode('show({})', [1]), null) // 짚을 문장이 없다
  assert.equal(viewCode('x = 1\nshow({})\n# 생략: 경로 복원\n# 앱 렌더링은 미검증', [2])?.code, 'x = 1') // 끝의 작업 메모 주석은 뗀다
})

test('조립과 품질 — 앱이 꼴을 만들고, 질문 간격 · 답 새기 · 마지막 박자 질문을 잡는다', async () => {
  const d = await fx('theory-design'), w = await fx('theory-write')
  const ex = await execDesign(d, fakePy([state(0, 4), state(1, 4), state(1, 3), state(2, 3), state(2, 3)]))
  assert.ok(ex.ok)
  if (!ex.ok) return
  const sc = assemble(d, ex.props, ex.states, w)
  assert.deepEqual(sc.map(s => s.component), ['ConceptCard', 'ArrayView', 'Flow'])
  assert.deepEqual(sc[1]!.beats.map(b => (b.state as unknown as { pointers: { l: number } }).pointers.l), [0, 1, 1, 2, 2]) // 상태는 실행 결과 그대로
  assert.deepEqual(qualityIssues(sc, { progressAt: 1 }), [])
  const noQ = assemble(d, ex.props, ex.states, { ...w, progress: w.progress.map((p: { predict: unknown }) => ({ ...p, predict: { question: '', choices: [], answer: 0, why: '', notes: [] } })) })
  assert.match(qualityIssues(noQ, { progressAt: 1 }).join(), /예측 질문이 0개/)
  const leak = assemble(d, ex.props, ex.states, { ...w, progress: w.progress.map((p: { caption: string }, i: number) => (i === 1 ? { ...p, caption: '이번엔 r 을 왼쪽으로 옮긴다.' } : p)) })
  assert.match(qualityIssues(leak, { progressAt: 1 }).join(), /정답 'r 을 왼쪽으로' 을 미리 말한다/)
})

test('학습 점검 적용 — 자막 · 질문만, 규칙을 새로 어기는 고침과 없는 박자는 거절, 코드 고침도 거절(문제 연결)', async () => {
  const d = await fx('theory-design'), w = await fx('theory-write')
  const ex = await execDesign(d, fakePy([state(0, 4), state(1, 4), state(1, 3), state(2, 3), state(2, 3)]))
  if (!ex.ok) return assert.fail()
  const sc = assemble(d, ex.props, ex.states, w)
  const NQ = { question: '', choices: [], answer: 0, why: '', notes: [] }
  const r = applyCheck(sc, [
    { id: 's2b3', problem: '자막이 짧다', caption: 'r 이 6 으로 왔고 합은 9 다.', predict: NQ },
    { id: 's2b2', problem: '답을 말하게 됨', caption: 'r 을 왼쪽으로 옮겨야 한다.', predict: NQ },
    { id: 's9b1', problem: '없는 박자', caption: 'x', predict: NQ }
  ], { progressAt: 1 })
  assert.deepEqual([r.applied, r.rejected], [1, 2])
  assert.equal(r.scenes[1]!.beats[2]!.caption, 'r 이 6 으로 왔고 합은 9 다.')
  assert.equal(JSON.stringify(r.scenes[1]!.beats[2]!.state), JSON.stringify(sc[1]!.beats[2]!.state)) // 상태는 그대로
  const code = applyCheck(sc, [{ id: 's2b3', problem: 'p', caption: 'for i in range(n): l += 1', predict: NQ }], { progressAt: 1, codeLike: t => /for .* in /.test(t) })
  assert.equal(code.rejected, 1)
  const numbered = applyCheck(sc, [{ id: 's2b2', problem: 'p', caption: '', predict: { question: '다음 박자에 r 은?', choices: ['0) 왼쪽', '1) 오른쪽', '2) 그대로'], answer: 0, why: '', notes: [] } }], { progressAt: 1 })
  assert.deepEqual(numbered.scenes[1]!.beats[1]!.predict!.choices, ['왼쪽', '오른쪽', '그대로']) // 점검 지시의 '0) ' 꼴은 떼어 낸다
})

test('바뀐 것 — 앱이 직전 상태와 견줘 상자 · 표 칸은 이름으로 알려 준다', () => {
  const boxes = { boxes: ['부모', '크기'] }
  assert.equal(stateDiff(undefined, { contents: [['0']] }, boxes), '처음 상태')
  assert.equal(stateDiff({ contents: [['0', '1', '2'], ['2', '1', '1']] }, { contents: [['0', '0', '0'], ['3', '1', '1']] }, boxes), "'부모'[1]: 1 → 0, '부모'[2]: 2 → 0, '크기'[0]: 2 → 3")
  assert.equal(stateDiff({ cells: [['-', '-']], focus: [0, 0] }, { cells: [['2', '-']], focus: [0, 1] }, { rows: ['비용'], cols: ['출발', '발판1'] }), "'비용'·'출발': - → 2, focus[1]: 0 → 1")
  assert.equal(stateDiff({ items: ['a'] }, { items: ['a', 'b'] }, {}), 'items[1]: (없음) → b')
  assert.equal(stateDiff({ items: ['a'] }, { items: ['a'] }, {}), '바뀐 것 없음')
})

test('개념 이론 흐름 — 실행이 실패하면 까닭을 주고 다시 설계, 품질을 어기면 다시 쓰기', async () => {
  const d = await fx('theory-design'), w = await fx('theory-write')
  const calls: string[] = [], s = log()
  let n = 0
  const py: RunPy = async () => (++n === 1 ? { ok: false, error: 'NameError: x' } : { ok: true, lines: [state(0, 4), state(1, 4), state(1, 3), state(2, 3), state(2, 3)] })
  const noQ = { ...w, progress: w.progress.map((p: object) => ({ ...p, predict: { question: '', choices: [], answer: 0, why: '', notes: [] } })) }
  const r = await runTheory(C, fake({ 'theory-design': [d, d], 'theory-write': [noQ, w], 'theory-check': [{ items: [] }] }, calls), py, s.on)
  assert.ok(r.ok)
  assert.deepEqual(calls, ['theory-design', 'theory-design', 'theory-write', 'theory-write', 'theory-check'])
  assert.ok(s.l.includes('exec:done 실패 — 실행 실패: NameError: x'))
  assert.ok(s.l.includes('quality:done 통과'))
  assert.ok(r.ok && r.set.scenes.length === 3 && r.notes.length === 0)
})

test('개념 이론 흐름 — 두 번 다 실행 실패면 만들지 않는다', async () => {
  const d = await fx('theory-design')
  const r = await runTheory(C, fake({ 'theory-design': [d, d] }), async () => ({ ok: false, error: 'boom' }), () => {})
  assert.ok(!r.ok && /실행으로 확인하지 못했습니다/.test(r.error.message))
})

test('개념 이론 흐름 — 실행 검산 중 취소는 실패가 아니다: 다시 설계하지 않고 aborted', async () => {
  const d = await fx('theory-design')
  const calls: string[] = []
  const r = await runTheory(C, fake({ 'theory-design': [d, d] }, calls), async () => ({ ok: false, error: '취소했습니다', aborted: true }), () => {})
  assert.ok(!r.ok && r.error.code === 'aborted')
  assert.deepEqual(calls, ['theory-design'])
})

test('문제 연결 흐름 — 한 번 쓰기 → 품질 → 점검(AI 는 점검만 더 부른다), 장면이 없으면 만들지 않는다', async () => {
  const m = await fx('mapping')
  const set = cleanScenes(m, 'map')!
  const calls: string[] = [], s = log()
  const r = await runMapping(C, async () => ({ ok: true, value: set }), fake({ 'theory-check': [{ items: [] }] }, calls), s.on, () => false)
  assert.ok(r.ok && r.set.scenes.length === set.scenes.length)
  assert.deepEqual(calls, ['theory-check'])
  assert.deepEqual(s.l.map(x => x.split(' ')[0]), ['write:on', 'write:done', 'quality:on', 'quality:done', 'check:on', 'check:done'])
  const none = await runMapping(C, async () => ({ ok: true, value: null }), fake({}), () => {}, () => false)
  assert.ok(!none.ok && /장면을 만들지 못했습니다/.test(none.error.message))
})

test('상태 꼴이 틀린 까닭을 구체적으로 — 다시 설계할 때 고칠 수 있게', async () => {
  const d = await fx('theory-design')
  const bad = JSON.stringify({ values: [4, 1, 3], pointers: { left: 0, bestStart: 1 }, marks: [0] })
  const why = ((await execDesign(d, fakePy([bad, state(0, 4), state(1, 4), state(1, 3), state(2, 3)]))) as { why: string }).why
  assert.match(why, /1번째 상태 꼴이 ArrayView 에 맞지 않습니다 — 포인터 이름 'bestStart' 가 8자를 넘는다/)
})

test('상태 까닭 — 글자여야 하는 칸에 숫자를 넣으면 그렇게 말한다', () => {
  assert.match(stateProblems('StackQueue', { items: [3, 'a'], op: 'push 3' }, { kind: 'stack' }).join(), /items 원소는 글자여야 한다/)
  assert.match(stateProblems('GridTable', { cells: [[1, '2']], focus: null }, { rows: ['r'], cols: ['a', 'b'] }).join(), /cells 칸은 글자여야 한다/)
})

test('자막 속 상태 JSON — 품질 검사가 잡고, 조립 때 걷어 낸다', async () => {
  assert.deepEqual(jsonBits('{"items":["A","B"],"op":"enqueue C"} C를 뒤에 넣는다'), ['{"items":["A","B"],"op":"enqueue C"}'])
  assert.deepEqual(jsonBits('집합 {a, b} 는 JSON 이 아니다'), [])
  const d = await fx('theory-design'), w = await fx('theory-write')
  const ex = await execDesign(d, fakePy([state(0, 4), state(1, 4), state(1, 3), state(2, 3), state(2, 3)]))
  if (!ex.ok) return assert.fail()
  const dirty = { ...w, progress: w.progress.map((p: { caption: string }, i: number) => (i === 0 ? { ...p, caption: `${state(0, 4)} 양 끝에서 시작한다.` } : p)) }
  const sc = assemble(d, ex.props, ex.states, dirty)
  assert.equal(sc[1]!.beats[0]!.caption, '양 끝에서 시작한다.')
  assert.match(qualityIssues([{ ...sc[0]!, beats: [{ ...sc[0]!.beats[0]!, caption: '{"reveal":1} 용어' }] } as never, sc[1]!, sc[2]!], { progressAt: 1 }).join(), /자막에 상태 JSON 을 옮겨 적었다/)
})

test('단서 대조 — 인용은 문제 글 그대로, 대소문자만 다르면 원문으로, 없는 문장은 뗀다', () => {
  const cap = (quote: string) => ({ component: 'Caption', title: 't', props: { quote }, beats: [] }) as never
  const r = fixQuotes([cap('You may not use the same element twice.'), cap('2 <= n <= 10^4'), cap('지어낸 문장')], '제목: Two Sum\n... and you may not use the same element twice. 2 <= n <=  10^4')
  assert.deepEqual([r.fixed, r.dropped], [1, 1])
  assert.deepEqual(r.scenes.map(s => (s.props as { quote?: string }).quote), ['you may not use the same element twice.', '2 <= n <= 10^4', undefined])
})

test('조립 — 코드와 짚을 줄이 진행 장면에 붙는다', async () => {
  const d = await fx('theory-design'), w = await fx('theory-write')
  const ex = await execDesign(d, fakePy([state(0, 4), state(1, 4), state(1, 3), state(2, 3), state(2, 3)]))
  if (!ex.ok) return assert.fail()
  assert.equal(ex.view, null) // 줄 번호 없이 찍은 출력(옛 꼴)은 코드 없이
  const sc = assemble(d, ex.props, ex.states, w, { code: 'a\nb\nc', lines: [1, 2, 3, 2, 1] })
  assert.equal(sc[1]!.code, 'a\nb\nc')
  assert.deepEqual(sc[1]!.beats.map(b => b.line), [1, 2, 3, 2, 1])
  assert.equal(sc[0]!.code, undefined)
  assert.equal(assemble(d, ex.props, ex.states, w, { code: 'a', lines: [1, 2, 3, 2, 1] })[1]!.code, undefined) // 줄이 코드 밖이면 뗀다
})
