import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validate } from '../src/main/ai/schema.ts'
import { CLASSIFY_SCHEMA, classifyPages, classifyPrompt, cleanClassify, unverifiedSubjects } from '../src/main/cert/classify.ts'

test('가짜 응답은 판별 스키마를 지킨다', async () => {
  assert.equal(validate(JSON.parse(await readFile('tests/fixtures/ai/cert-classify.json', 'utf8')), CLASSIFY_SCHEMA), null)
})

test('판별에 줄 쪽 — 앞 6쪽 + 20쪽 안의 목차처럼 보이는 쪽 2개까지', () => {
  const pages = Array.from({ length: 30 }, (_, i) => (i === 9 ? '목 차 …' : i === 12 ? '3과목 데이터베이스' : i === 25 ? '목차' : `p${i + 1}`))
  assert.deepEqual(classifyPages(pages), [1, 2, 3, 4, 5, 6, 10, 13])
  assert.match(classifyPrompt(pages), /\[p\.10\]/)
  assert.doesNotMatch(classifyPrompt(pages), /\[p\.26\]/)
})

test('정리 — 앞뒤 공백 · 겹치는 과목 · 빈 과목, 과목이 없으면 전체', () => {
  const v = cleanClassify({ name: ' 정보처리기사 ', kind: '필기', subjects: [' 소프트웨어 설계', '소프트웨어 설계', ''], rules: { perSubject: 20, minSubject: 40, minAvg: 60, minutes: 150 }, evidence: 'p.1' })
  assert.deepEqual([v.name, v.subjects], ['정보처리기사', ['소프트웨어 설계']])
  assert.deepEqual(cleanClassify({ ...v, subjects: [] }).subjects, ['전체'])
})

test('과목 원문 대조 — 교재 글에 없는 과목 이름만 알린다(띄어쓰기 무시, 전체는 제외)', () => {
  const pages = ['1과목 소프트웨어\n설계', '2과목 소프트웨어 개발']
  assert.deepEqual(unverifiedSubjects(['소프트웨어 설계', '소프트웨어 개발', '데이터베이스 구축', '전체'], pages), ['데이터베이스 구축'])
})
