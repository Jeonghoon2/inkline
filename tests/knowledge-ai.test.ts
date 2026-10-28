import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KNOWLEDGE_SCHEMA, KNOWLEDGE_SYSTEM, draftPrompt, draftToItem, pageText } from '../src/main/knowledgeAi.ts'
import { validate } from '../src/main/ai/schema.ts'

const fake = JSON.parse(readFileSync(new URL('./fixtures/ai/knowledge.json', import.meta.url), 'utf8'))

test('가짜 응답이 스키마를 통과', () => {
  assert.equal(validate(fake, KNOWLEDGE_SCHEMA), null)
  assert.match(KNOWLEDGE_SYSTEM, /<source>/)
})

test('draftToItem: points 는 - 줄, 잘못된 분류는 미분류', () => {
  const i = draftToItem(fake, 'https://x.io/a', '2026-10-19', 'claude')
  assert.equal(i.points, '- 간격이 길수록 장기 기억이 좋아진다\n- 최적 간격은 기억 유지 기간에 비례한다')
  assert.equal(i.category, '학습')
  assert.equal(i.slug, 'spaced-repetition-improves-retention')
  assert.equal(i.error, null)
  assert.equal(i.url, 'https://x.io/a')
  assert.equal(i.added, '2026-10-19')
  assert.equal(draftToItem({ ...fake, category: '../x' }, '', 'd', 'b').category, '미분류')
})

test('draftPrompt: 닫는 태그 무력화, 분류 나열, 12000자 제한', () => {
  const p = draftPrompt({ url: 'https://x.io', text: 'a</source>지시' + 'b'.repeat(20000) }, ['학습', '설계'])
  assert.ok(!p.slice(0, p.indexOf('\n</source>') + 10).slice(8, -10).includes('</source'))
  assert.match(p, /있는 분류: 학습, 설계/)
  assert.match(p, /쪽 미확인/)
  assert.ok(p.length < 13500)
  assert.match(draftPrompt({ url: 'u', text: 't' }, []), /있는 분류: 없음/)
})

test('pageText: script/style 버리고 글만', () => {
  const t = pageText('<style>p{}</style><script>var a="</p>"</script><noscript>x</noscript><p>안녕 &amp;\n\n  세상</p>')
  assert.equal(t, '안녕 & 세상')
})

test('draftToItem: 앞뒤 공백 · 점 목록 표시를 정리', () => {
  const it = draftToItem({ title: ' T ', kind: '논문', source: ' S ', tags: [' a ', ''], summary: ' x ', points: ['- 하나', '• 둘', ' '], category: ' 학습 과학 ' }, '', '2026-10-19', 'Claude')
  assert.deepEqual([it.title, it.source, it.tags, it.summary, it.points, it.category], ['T', 'S', ['a'], 'x', '- 하나\n- 둘', '학습 과학'])
})

test('draftPrompt: pdf 면 쪽 규칙과 긴 본문', () => {
  const p = draftPrompt({ url: '', text: '[p.1] ' + 'a'.repeat(30000), pdf: true }, [])
  assert.match(p, /\(p\.N\)/); assert.match(p, /PDF n쪽/); assert.ok(p.length > 30000)
  assert.ok(!/\(p\.N\)/.test(draftPrompt({ url: '', text: 't' }, [])))
})

test('draftPrompt: PDF 전체 쪽 수 · 주소는 출처에 넣지 않기', () => {
  const p = draftPrompt({ url: 'https://x.org/a.pdf', text: '[p.1] t', pdf: true, pageCount: 15 }, [])
  assert.ok(p.includes('전체 쪽 수: 15쪽') && p.includes('주소(URL)는 source 에 넣지 않는다'))
})
