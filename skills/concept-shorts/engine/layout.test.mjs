// 그림 한계 시험 — node --test layout.test.mjs (Chrome 이 있어야 한다, 몇 초)
// schema.json 이 허용하는 가장 긴 글자(띄어쓰기 없는 한글·끊을 수 없는 영어)로 부품마다 그려 넘침·겹침 0곳인지 본다
// 실제 대본은 이보다 짧다 — 여기서 통과하면 규칙 안의 어떤 대본도 칸 밖으로 나가거나 겹치지 않는다
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { layoutCheck } from './shorts-qa.mjs'
import { chromePath } from './platform.mjs'

const K = n => '가나다라마바사아자차카타파하'.repeat(3).slice(0, n) // 띄어쓰기 없는 한글 n자 — 가장 넓다
const E = n => 'WMWMWMWMWMWMWMWMWMWMWMWMWMWMWM'.slice(0, n) // 끊을 수 없는 넓은 영어 n자
const node = (label, sub, tone = 'key') => ({ label, sub, tone })
const DRAWS = [
  [{ type: 'flow', id: 'f', nodes: [node(K(8), K(12)), node(E(8), E(12)), node(K(8), K(12))], arrows: [K(8), E(8)] }],
  [{ type: 'flow', id: 'f', nodes: [node(K(8), K(12)), node(E(8), E(12))], arrows: [`${K(4)} ${K(3)}`] }],
  [{ type: 'flow', id: 'f', dir: 'col', nodes: [node(K(8), K(12)), node(E(8), E(12)), node(K(8), K(12)), node(E(8), E(12))], arrows: [K(8), E(8), K(8)] }],
  [{ type: 'gauge', id: 'g', label: K(12), value: 1.1, max: 1.2, limit: 1, limitLabel: K(10), unit: E(6), tone: 'c1' },
    { type: 'flow', id: 'f', nodes: [node(K(8), K(12)), node(E(8), E(12)), node(K(8), K(12))], arrows: [K(8), K(8)] }],
  [{ type: 'cells', id: 'c', label: K(20), items: Array.from({ length: 12 }, (_, i) => ({ v: i % 2 ? K(5) : E(5), tone: 'key' })), focus: [2, 4] }],
  [{ type: 'cells', id: 'c', items: Array.from({ length: 12 }, () => ({ v: K(2), tone: 'bad' })), focus: [0, 11] }], // 두 줄에 걸친 강조
  [{ type: 'compare', id: 'm', before: { label: K(10), value: E(10) }, after: { label: K(10), value: K(10) } }],
  [{ type: 'code', id: 'k', lines: Array.from({ length: 6 }, () => E(30)), mark: [{ line: 0, text: E(8) }] }],
  [{ type: 'list', id: 'l', items: Array.from({ length: 5 }, (_, i) => ({ text: i % 2 ? E(20) : K(20), tone: 'key' })) }],
  [{ type: 'big', id: 'b', text: K(14), sub: K(22), tone: 'key' }],
  [{ type: 'big', id: 'b', text: E(14), sub: E(22), tone: 'key' }]
]
export const script = {
  title: K(14), question: '?',
  beats: DRAWS.map((draw, i) => ({ role: 'idea', say: K(20), band: { tone: 'key', text: i % 2 ? E(24) : K(24) }, draw: draw.map(d => ({ ...d, id: `${d.id}${i}` })) }))
}
export const meta = { starts: script.beats.map((_, i) => i * 3), durs: script.beats.map(() => 2.5), total: script.beats.length * 3 + 2 }

test('규칙 안 가장 긴 글자로도 그림이 넘치거나 겹치지 않는다', { skip: !existsSync(chromePath() ?? '') && 'Chrome 없음' }, async () => {
  const found = await layoutCheck(script, meta)
  assert.deepEqual(found, [], found.map(f => `${f} — ${JSON.stringify(DRAWS[+f.match(/박자 (\d+)/)[1] - 1].map(d => d.type))}`).join('\n'))
})
