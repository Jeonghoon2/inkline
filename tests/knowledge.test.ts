import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knowledgeRefs, parseItem, serializeItem, slugify, uniqueSlug, validName, findDuplicate, buildIndex } from '../src/shared/knowledge.ts'
import type { KItem } from '../src/shared/knowledge.ts'

const SPEC = `# 사전 시험 효과 (Pretesting Effect)
- 종류: 논문
- 출처: Richland · 2009 · Journal of Experimental Psychology · p.243
- 주소: https://x.org/p
- 태그: 학습, 시험
- 요약: 배우기 전에 먼저 묻으면 기억이 좋아진다.
- 추가: 2026-10-19 · Claude

## 핵심 내용
- 틀려도 먼저 묻는 편이 낫다 (p.243)

## 우리 작업에 쓴 곳
- 2026-10-19 Inkline — 복습 설계 (a/b.md#2026-10-19)

## 메모
- 자유
`

test('parse spec example and round trip', () => {
  const i = parseItem('학습 과학', 'pretesting-effect', SPEC)
  assert.equal(i.title, '사전 시험 효과 (Pretesting Effect)')
  assert.equal(i.kind, '논문')
  assert.equal(i.source, 'Richland · 2009 · Journal of Experimental Psychology · p.243')
  assert.equal(i.url, 'https://x.org/p')
  assert.deepEqual(i.tags, ['학습', '시험'])
  assert.equal(i.summary, '배우기 전에 먼저 묻으면 기억이 좋아진다.')
  assert.equal(i.added, '2026-10-19')
  assert.equal(i.by, 'Claude')
  assert.equal(i.points, '- 틀려도 먼저 묻는 편이 낫다 (p.243)')
  assert.equal(i.uses, '- 2026-10-19 Inkline — 복습 설계 (a/b.md#2026-10-19)')
  assert.equal(i.memo, '- 자유')
  assert.equal(i.error, null)
  assert.equal(serializeItem(i), SPEC)
  assert.deepEqual(parseItem('학습 과학', 'pretesting-effect', serializeItem(i)), i)
})

test('empty fields and sections are omitted', () => {
  const i = parseItem('c', 's', '# T\n- 종류: 책\n- 출처: S\n- 요약: R\n')
  const out = serializeItem(i)
  assert.ok(!out.includes('- 주소:') && !out.includes('- 태그:') && !out.includes('- 추가:'))
  assert.ok(!out.includes('## '))
  assert.equal(out, '# T\n- 종류: 책\n- 출처: S\n- 요약: R\n')
})

test('unknown sections kept after memo; tolerant parsing', () => {
  const t = '# T  \n\n- 종류:책 \n\n- 출처: S\n- 요약: R  \n\n## 메모\nm\n\n## 원문 메모\nraw\n'
  const i = parseItem('c', 's', t)
  assert.equal(i.kind, '책')
  assert.equal(i.summary, 'R')
  assert.equal(i.memo, 'm\n\n## 원문 메모\nraw')
  assert.equal(i.error, null)
  assert.equal(parseItem('c', 's', serializeItem(i)).memo, i.memo)
})

test('format errors', () => {
  assert.match(parseItem('c', 's', '- 종류: 책\n- 출처: S\n- 요약: R').error!, /제목 없음/)
  const b = parseItem('c', 's', '# T\n- 종류: 블로그\n- 출처: S\n- 요약: R')
  assert.equal(b.kind, '')
  assert.match(b.error!, /종류 없음/)
  assert.match(parseItem('c', 's', '# T\n- 종류: 책\n- 요약: R').error!, /출처 없음/)
  assert.match(parseItem('c', 's', '# T\n- 종류: 책\n- 출처: S').error!, /요약 없음/)
})

test('slugify', () => {
  assert.equal(slugify('Pretesting Effect: 2009!'), 'pretesting-effect-2009')
  assert.equal(slugify('먼저 묻기 효과'), '먼저-묻기-효과')
  assert.equal(slugify('!!!'), 'item')
  assert.equal(slugify('a'.repeat(70)).length, 60)
})

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('a', new Set(['a', 'a-2'])), 'a-3')
  assert.equal(uniqueSlug('b', new Set(['a'])), 'b')
})

test('validName', () => {
  for (const n of ['학습 과학', 'LLM · 프롬프트']) assert.ok(validName(n), n)
  for (const n of ['', ' a', 'a ', '../x', 'a/b', 'a\\b', 'a:b', '.x', 'a\u0001', 'a'.repeat(81), 3]) assert.ok(!validName(n), String(n))
})

const mk = (o: Partial<KItem>): KItem => ({
  category: 'c', slug: 's', title: 'T', kind: '논문', source: 'S', url: '', tags: [], summary: 'R',
  added: '', by: '', points: '', uses: '', memo: '', error: null, ...o,
})

test('findDuplicate', () => {
  const a = mk({ url: 'https://x.org/p', title: 'Pretesting Effect' })
  assert.equal(findDuplicate([a], { url: 'https://x.org/p/?utm_source=a#s' }), a)
  assert.equal(findDuplicate([a], { title: 'pretesting  effect' }), a)
  assert.equal(findDuplicate([a], { url: 'https://x.org/p', title: 'zzz' }, 'c/s'), null)
  assert.equal(findDuplicate([a], { url: 'https://x.org/q', title: 'zzz' }), null)
  assert.equal(findDuplicate([a], { url: '' }), null)
})

test('buildIndex', () => {
  const items = [
    mk({ category: '학습', slug: 'b', title: 'B', kind: '책', tags: ['x', 'y'], summary: 'a|b\nc' }),
    mk({ category: '가', slug: 'z', title: 'Z', kind: '', error: '종류 없음' }),
    mk({ category: '학습', slug: 'a', title: 'A', summary: 'ok' }),
  ]
  assert.equal(buildIndex(items), `# 지식사전 목차

이 파일은 자동으로 만든다 — 항목 파일을 고치고 \`node ~/.claude/skills/knowledge/index.mjs\` 를 돌린다 (앱은 저장할 때 다시 만든다).

전체 3개 · 가 1 · 학습 2

## 가
| 제목 | 종류 | 태그 | 요약 | 파일 |
| --- | --- | --- | --- | --- |
| Z | 형식 오류 |  | R | 가/z.md |

## 학습
| 제목 | 종류 | 태그 | 요약 | 파일 |
| --- | --- | --- | --- | --- |
| A | 논문 |  | ok | 학습/a.md |
| B | 책 | x, y | a\\|b c | 학습/b.md |
`)
})

test('fix round 1', () => {
  const base = '# T\n- 종류: 책\n- 출처: S\n- 요약: R\n'
  // 1 url case
  const a = mk({ url: 'https://YouTube.com/watch?v=AbC' })
  assert.equal(findDuplicate([a], { url: 'https://youtube.com/watch?v=AbC' }), a)
  assert.equal(findDuplicate([a], { url: 'https://youtube.com/watch?v=abc' }), null)
  // 2 duplicate sections
  assert.equal(parseItem('c', 's', base + '## 메모\nx\n## 메모\ny\n').memo, 'x\n\ny')
  // 3 BOM
  assert.equal(parseItem('c', 's', '﻿' + base).error, null)
  // 4 by-only
  const b = parseItem('c', 's', base + '- 추가: · Claude\n')
  assert.deepEqual([b.added, b.by], ['', 'Claude'])
  assert.deepEqual(parseItem('c', 's', serializeItem(b)), b)
  assert.equal(parseItem('c', 's', base + '- 추가: 2026-10-19\n').added, '2026-10-19')
  // 5 unknown header lines kept
  const h = parseItem('c', 's', base + '- 신뢰도: 높음\n')
  assert.equal(h.memo, '- 신뢰도: 높음')
  assert.deepEqual(parseItem('c', 's', serializeItem(h)), h)
  // 6 NFC
  assert.equal(slugify('한'), '한')
  // 7 cell
  const idx = buildIndex([mk({ summary: 'a\r b\\' })])
  assert.ok(idx.includes('| a b\\\\ |'))
})

test('knowledgeRefs — 여러 개 · 공백 분류 · 없는 것', () => {
  assert.deepEqual(knowledgeRefs('앞 (지식사전: 학습 과학/pretesting-effect) 뒤 (지식사전: a·b/c/d-e)'), [
    { category: '학습 과학', slug: 'pretesting-effect' }, { category: 'a·b/c', slug: 'd-e' }
  ])
  assert.deepEqual(knowledgeRefs('없음 (지식사전: 슬래시없음) (참고: a/b)'), [])
})

test('머리말 값의 줄바꿈은 한 줄로 — 추가가 살아남는다', () => {
  const i = parseItem('c', 's', '# t\n- 종류: 논문\n- 출처: s\n- 요약: x\n- 추가: 2026-10-19 · 나\n')
  const back = parseItem('c', 's', serializeItem({ ...i, summary: 'line1\nline2\n## boom' }))
  assert.equal(back.summary, 'line1 line2 ## boom'); assert.equal(back.added, '2026-10-19')
})

test('모르는 종류는 memo 에 남는다', () => {
  const i = parseItem('c', 's', '# t\n- 종류: 영상\n- 출처: s\n- 요약: x\n')
  assert.equal(i.kind, ''); assert.match(i.memo, /종류: 영상/)
})

test('knowledgeRefs — 한 괄호에 쉼표로 여럿 · 분류 이름의 쉼표는 그대로', () => {
  assert.deepEqual(knowledgeRefs('(지식사전: 평가 · 진단/a-b, 평가 · 진단/c, 학습 과학/d)'), [
    { category: '평가 · 진단', slug: 'a-b' }, { category: '평가 · 진단', slug: 'c' }, { category: '학습 과학', slug: 'd' }
  ])
  assert.deepEqual(knowledgeRefs('(지식사전: x/y, 가, 나/z)'), [{ category: 'x', slug: 'y' }, { category: '가, 나', slug: 'z' }])
})

test('knowledgeRefs — 줄을 넘지 않는다', () => {
  assert.deepEqual(knowledgeRefs('(지식사전: a/\nb)'), [])
})

test('원문 PDF 머리줄 왕복 · 없으면 줄도 없다', () => {
  const base = { category: 'c', slug: 's', title: 't', kind: '논문' as const, source: 'x', url: 'https://a.io', tags: [], summary: 'y', added: '2026-10-19', by: '', points: '', uses: '', memo: '', error: null }
  const t = serializeItem({ ...base, file: 's.pdf' })
  assert.match(t, /- 주소: https:\/\/a\.io\n- 원문: s\.pdf\n/)
  assert.equal(parseItem('c', 's', t).file, 's.pdf')
  assert.ok(!serializeItem(base).includes('원문'))
  assert.equal(parseItem('c', 's', serializeItem(base)).file, undefined)
})

test('validHttpUrl — 호스트 없는 주소 · 다른 스킴은 안 된다', async () => {
  const { validHttpUrl } = await import('../src/shared/knowledge.ts')
  assert.equal(validHttpUrl('https://a.io/p?q=1'), true)
  assert.equal(validHttpUrl('http://'), false)
  assert.equal(validHttpUrl('ftp://a.io'), false)
  assert.equal(validHttpUrl('javascript:alert(1)'), false)
})
