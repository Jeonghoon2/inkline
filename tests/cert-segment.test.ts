import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validate } from '../src/main/ai/schema.ts'
import { SEGMENT_SCHEMA, bookText, chunkPlan, cutBodies, locate, pageAt, segmentChunk, segmentPrompt, suspiciousPages } from '../src/main/cert/segment.ts'
import type { Ask } from '../src/main/ai/run.ts'

const pages = ['표지 글', '1과목\n폭포수 모형\n폭포수 모형은 이전 단계로\n돌아갈 수 없다.\n나선형 모형\n나선형 모형은 위험 분석을 더한 모형이다.', '2과목\n화이트박스 테스트\n화이트박스 테스트는 원시 코드를 연다.']

test('가짜 응답은 스키마를 지킨다', async () => {
  assert.equal(validate(JSON.parse(await readFile('tests/fixtures/ai/cert-segment.json', 'utf8')), SEGMENT_SCHEMA), null)
})

test('묶음 계획 — 6쪽씩, 앞 묶음과 1쪽 겹침', () => {
  assert.deepEqual(chunkPlan(3), [{ chunk: 0, from: 1, to: 3 }])
  assert.deepEqual(chunkPlan(13), [{ chunk: 0, from: 1, to: 6 }, { chunk: 1, from: 6, to: 11 }, { chunk: 2, from: 11, to: 13 }])
})

test('시작 문장 찾기 — 띄어쓰기 · 줄바꿈이 달라도, 그 쪽 범위 안에서만', () => {
  const t = bookText(pages)
  const pos = locate(t, '폭포수모형은 이전 단계로 돌아갈', 2, 2)!
  assert.equal(t.full.slice(pos, pos + 6), '폭포수 모형')
  assert.equal(pageAt(t, pos), 2)
  assert.equal(locate(t, '폭포수 모형은 이전', 3, 3), null)
  assert.equal(locate(t, '없는 문장입니다', 1, 3), null)
})

test('본문 자르기 — 시작 문장부터 다음 항목 앞까지, 마지막은 end 까지 · 긴 본문 표시 · 빠뜨림 의심 쪽', () => {
  const t = bookText(pages)
  const a = [{ id: 1, title: '폭포수 모형', pos: locate(t, '폭포수 모형은', 2, 2)! }, { id: 2, title: '나선형 모형', pos: locate(t, '나선형 모형은', 2, 2)! }, { id: 3, title: '화이트박스 테스트', pos: locate(t, '화이트박스 테스트는', 3, 3)! }]
  const cuts = cutBodies(t, a, t.full.length)
  assert.equal(cuts[0]!.body, '폭포수 모형은 이전 단계로\n돌아갈 수 없다.')
  assert.deepEqual(cuts.map(c => [c.ord, c.pageFrom, c.pageTo]), [[0, 2, 2], [1, 2, 3], [2, 3, 3]])
  const longCut = { ...cuts[0]!, pageTo: 4, long: true }
  assert.deepEqual(suspiciousPages([longCut, { ...cuts[1]!, pageFrom: 5, pageTo: 5 }], new Set([2, 3, 4, 5])), [3, 4])
})

test('본문 자르기 — 다음 제목이 앞쪽 머리글에도 · 본문 속 언급으로도 나오지만 제목 줄에서만 자른다', () => {
  const body = '폭포수 모형은 이전 단계로\n돌아갈 수 없다. 나선형 모형과 다르다.\n나선형 모형\n나선형 모형은 위험 분석을 더한다.'
  const cut = (pg: string[]) => { const t = bookText(pg); return cutBodies(t, [{ id: 1, title: '폭포수 모형', pos: locate(t, '폭포수 모형은', 1, pg.length)! }, { id: 2, title: '나선형 모형', pos: locate(t, '나선형 모형은 위험', 1, pg.length)! }], t.full.length)[0]!.body }
  const want = '폭포수 모형은 이전 단계로\n돌아갈 수 없다. 나선형 모형과 다르다.'
  assert.equal(cut([body]), want)
  assert.equal(cut(['나선형 모형\n' + body]), want) // 머리글에 같은 제목
})

test('묶음 하나 — 찾은 것만 남기고, 못 찾은 시작 문장은 버린 수로, 모르는 과목은 앞 항목 과목', async () => {
  const t = bookText(pages)
  const ask: Ask = (async () => ({ ok: true, value: { items: [
    { subject: '소프트웨어 설계', title: '폭포수 모형', freq: 2, freqNote: '24.7, 23.2', page: 2, anchor: '폭포수 모형은 이전 단계로' },
    { subject: '설계?', title: '나선형 모형', freq: 0, freqNote: '', page: 9, anchor: '나선형 모형은 위험 분석' },
    { subject: '소프트웨어 설계', title: '지어낸 항목', freq: 0, freqNote: '', page: 2, anchor: '이런 문장은 교재에 없다' }
  ] } })) as Ask
  const r = await segmentChunk(ask, ['소프트웨어 설계', '소프트웨어 개발'], t, pages, { chunk: 0, from: 1, to: 3 })
  assert.ok(r.ok)
  assert.deepEqual(r.found.map(f => [f.title, f.subject, f.freq]), [['폭포수 모형', '소프트웨어 설계', 2], ['나선형 모형', '소프트웨어 설계', 0]])
  assert.equal(r.dropped, 1)
  assert.match(segmentPrompt(['A'], [{ page: 2, text: 'x' }], [2]), /놓친 항목이 있을 수 있다: p\.2/)
})
