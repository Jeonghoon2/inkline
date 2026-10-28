// 대본 검사기 시험 — node --test shorts.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateScript } from './shorts.mjs'

export const SAMPLE = {
  title: '종료 코드 137',
  question: '그럼 SIGTERM을 받았다면 무엇이 달랐을까요?',
  beats: [
    { role: 'problem', say: '정산 작업이 로그 한 줄 없이 꺼졌어요.', band: { tone: 'bad', text: '오류 로그 0줄' }, draw: [{ type: 'big', id: 'code', text: 'exit 137', tone: 'bad' }] },
    { role: 'idea', say: '137은 128 더하기 신호 번호 9예요.', band: { tone: 'key', text: '137 = 128 + 9' }, draw: [{ type: 'big', id: 'code', text: '128 + 9', sub: '9번 = SIGKILL', tone: 'key' }] },
    { role: 'idea', say: 'SIGKILL은 막을 수 없는 강제 종료예요.', speak: '시그킬은 막을 수 없는 강제 종료예요.', band: { tone: 'key', text: '가로챌 수 없음' }, draw: [{ type: 'big', id: 'code', text: 'SIGKILL', sub: '정리·로그 없이 즉시 끝', tone: 'key' }] },
    { role: 'example', say: '이 작업에 준 메모리는 1GB였어요.', band: { tone: 'key', text: '한계 1GB' }, draw: [{ type: 'gauge', id: 'mem', label: '메모리', value: 0.3, max: 1.2, limit: 1, unit: 'GB', tone: 'c1' }] },
    { role: 'example', say: '하루치 32만 줄을 한꺼번에 올렸어요.', band: { tone: 'bad', text: '32만 줄 한꺼번에' }, draw: [{ type: 'gauge', id: 'mem', label: '메모리', value: 1.05, max: 1.2, limit: 1, unit: 'GB', tone: 'c1' }] },
    { role: 'example', say: '한계를 넘자 운영체제가 바로 껐어요.', band: { tone: 'bad', text: '넘으면 SIGKILL' }, draw: [{ type: 'flow', id: 'kill', nodes: [{ label: '1GB 넘음', tone: 'bad' }, { label: 'OOM Killer', tone: 'key' }, { label: 'exit 137', tone: 'bad' }], arrows: ['커널', '신호 9'] }] },
    { role: 'twist', say: '다만 137이 늘 메모리 탓은 아니에요.', band: { tone: 'bad', text: '137 ≠ 늘 메모리' }, draw: [{ type: 'list', id: 'why', items: [{ text: '메모리 한계 초과', tone: 'bad' }, { text: '누가 kill -9', tone: 'c3' }, { text: '멈춤 대기 초과', tone: 'c4' }] }] },
    { role: 'result', say: '5천 줄씩 나눠 읽자 메모리가 4분의 1이 됐어요.', band: { tone: 'good', text: '나눠 읽기로 해결' }, draw: [{ type: 'compare', id: 'res', before: { label: '고치기 전', value: '540MB' }, after: { label: '고친 뒤', value: '135MB' } }] },
    { role: 'outro', say: '그럼 SIGTERM을 받았다면 무엇이 달랐을까요?', speak: '그럼 시그텀을 받았다면 무엇이 달랐을까요?', band: { tone: 'key', text: '면접 꼬리 질문' }, draw: [{ type: 'big', id: 'q', text: 'SIGTERM?', sub: '15번 · 종료 코드 143', tone: 'key' }] }
  ]
}

const clone = () => structuredClone(SAMPLE)

test('정상 대본은 통과한다', () => assert.deepEqual(validateScript(SAMPLE), []))

test('박자 순서가 거꾸로면 걸린다', () => {
  const s = clone(); [s.beats[0], s.beats[1]] = [s.beats[1], s.beats[0]]
  assert.match(validateScript(s).join(), /순서/)
})

test('마지막이 outro 가 아니면 걸린다', () => {
  const s = clone(); s.beats.pop()
  assert.match(validateScript(s).join(), /outro/)
})

test('대사가 길면 걸린다', () => {
  const s = clone(); s.beats[3].say = '가'.repeat(49)
  assert.match(validateScript(s).join(), /say/)
})

test('없는 부품·칸 밖 강조·없는 글자 강조는 걸린다', () => {
  const s = clone()
  s.beats[3].draw = [{ type: 'chart', id: 'x' }]
  s.beats[4].draw = [{ type: 'cells', id: 'c', items: [{ v: '1' }, { v: '2' }], focus: [0, 5] }]
  s.beats[5].draw = [{ type: 'code', id: 'k', lines: ['a = 1'], mark: [{ line: 0, text: 'zzz' }] }]
  const e = validateScript(s).join()
  assert.match(e, /없는 부품/); assert.match(e, /focus/); assert.match(e, /mark/)
})

test('새로 쓴 대본은 분량·큰 글자만 있는 박자까지 본다(예전 대본 다시 렌더는 안 본다)', () => {
  assert.deepEqual(validateScript(SAMPLE), [])
  const e = validateScript(SAMPLE, { fresh: true }).join()
  assert.match(e, /대사 합/); assert.match(e, /큰 글자만/)
})

// 후속 영상 — 대본의 follow 모양, 사전 항목 붙이기(쓴 그대로 다시 읽히는지)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { conceptBlock, parseConcepts } from './concepts.mjs'
test('follow 는 0~2개, name·kind(선행|심화)·why', () => {
  assert.deepEqual(validateScript({ ...SAMPLE, follow: [{ name: 'Java 클래스와 객체', kind: '선행', why: 'Spring 빈은 Java 객체다' }] }), [])
  assert.ok(validateScript({ ...SAMPLE, follow: [{ name: 'Java', kind: '다음', why: 'x' }] }).some(e => e.includes('follow')))
  assert.ok(validateScript({ ...SAMPLE, follow: [1, 2, 3].map(i => ({ name: `개념${i}`, kind: '선행', why: 'x' })) }).some(e => e.includes('follow')))
})
test('후속으로 쓴 사전 항목은 원리·질문·출처(from)가 그대로 다시 읽힌다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'concept-'))
  try {
    const entry = { why: 'Java 는 클래스로 틀을 정하고 객체로 찍어 낸다.', qs: [{ q: '클래스와 객체는?', a: '틀과 찍어 낸 것.' }, { q: '왜 나누나?', a: '같은 틀을 여러 번 쓴다.' }, { q: 'Spring 빈과는?', a: '빈도 객체다.' }] }
    writeFileSync(join(dir, 'concepts.md'), `# 개념 사전\n\n## Spring 빈\n원리.\n\n${conceptBlock('Java 클래스와 객체', entry, { kind: '선행', name: 'Spring 빈', why: '빈은 Java 객체다' })}`)
    const c = parseConcepts(dir)['Java 클래스와 객체']
    assert.equal(c.why, entry.why)
    assert.deepEqual(c.qs, entry.qs)
    assert.deepEqual(c.from, { kind: '선행', name: 'Spring 빈', why: '빈은 Java 객체다' })
    assert.equal(parseConcepts(dir)['Spring 빈'].from, undefined)
  } finally { rmSync(dir, { recursive: true }) }
})
