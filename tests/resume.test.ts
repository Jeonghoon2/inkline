import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cvBlanks, cvIsBlank, cvMonths, cvSpan, cvSplit, cvRoles, renderResume, gapLackCount, gapItem, roleEvidence } from '../src/renderer/history/resume.ts'
import type { Entry } from '../src/shared/types.ts'

const NOW = new Date('2026-10-18T00:00:00')

test('기간 → 개월 수 → 글자', () => {
  assert.equal(cvMonths('2024.03 - 현재', NOW), 32)
  assert.equal(cvMonths('2016.04 ~ 2022.09', NOW), 78)
  assert.equal(cvMonths('언젠가', NOW), 0)
  assert.equal(cvSpan(22), '1년 10개월')
  assert.equal(cvSpan(12), '1년')
  assert.equal(cvSpan(3), '3개월')
})

test('보완할 경험은 떼어 내고 무리별로', () => {
  const [doc, groups] = cvSplit('## 기술\n- a\n## 보완할 경험\n### 부족한 경험\n- **캐시** — 없음\n### 해보면 좋은 것\n- k6\n- 큐')
  assert.equal(doc, '## 기술\n- a')
  assert.deepEqual(groups, [
    { name: '부족한 경험', items: ['**캐시** — 없음'] },
    { name: '해보면 좋은 것', items: ['k6', '큐'] }
  ])
  assert.equal(gapLackCount(groups), 1)
})

test('직무 목록: 기본 먼저, 정한 순서, 머리 줄 물려받기', () => {
  const base = '# 홍길동\n> 소개\n- 이메일: a@b.c\n\n## 경력\n'
  const list = cvRoles(base, [{ slug: 'zeta', text: '> z' }, { slug: 'frontend', text: '> f' }, { slug: 'backend', text: '# 다른 이름\n> b' }])
  assert.deepEqual(list.map(r => [r.slug, r.label, r.file]), [
    ['', '기본', 'resume.md'],
    ['backend', '백엔드', 'resume/backend.md'],
    ['frontend', '프론트엔드', 'resume/frontend.md'],
    ['zeta', 'zeta', 'resume/zeta.md']
  ])
  assert.equal(list[2].text, '# 홍길동\n- 이메일: a@b.c\n> f')
  assert.equal(list[1].text, '# 다른 이름\n> b')
})

test('renderResume: 이름 · 연락처 · 경력 기간 · 빈칸 · 기술 칩, HTML 이스케이프', () => {
  const html = renderResume(
    '# 홍<길동>\n> 소개\n- 이메일: a@b.c\n- GitHub: [GitHub 주소]\n\n## 경력\n### 회사 · 개발자\n기간: 2024.03 - 현재\n역할: 개발\n\n## 기술\n- 언어: Java, Python (FastAPI, Django)',
    NOW
  )
  assert.match(html, /<h1 class="cv-name">홍&lt;길동&gt;<\/h1>/)
  assert.match(html, /<span class="cv-blank">\[GitHub 주소\]<\/span>/)
  assert.match(html, /2024\.03 - 현재 \(2년 8개월\)/)
  assert.match(html, /<h2>경력 <small class="num">2년 8개월<\/small><\/h2>/)
  assert.match(html, /<li>Python \(FastAPI, Django\)<\/li>/)
  assert.equal(renderResume('  ', NOW), '')
})

test('연락처 이스케이프', () => {
  const html = renderResume('# n\n- <x>: <y>', NOW)
  assert.match(html, /&lt;x&gt;/)
  assert.match(html, /&lt;y&gt;/)
  assert.doesNotMatch(html, /<x>|<y>/)
})

test('프로젝트 새 꼴: 머리 줄 · 소제목 · Skills 칩', () => {
  const html = renderResume('# n\n\n## 프로젝트\n### 이름\n소속: 회사 / 기간: 2026.09 - 현재\n**Description**\n설명\n**What did I do**\n- 했다\n***Skills***: a, b', NOW)
  assert.match(html, /cv-pmeta/)
  assert.match(html, /cv-part/)
  assert.equal((html.match(/<li>[ab]<span|<li>b<\/li>/g) ?? []).length, 2)
})

test('cvMonths: ~ 와 현재', () => {
  assert.equal(cvMonths('2024.03 ~ 현재', NOW), 32)
})

test('renderResume: ## 앞의 ### 는 버린다', () => {
  assert.ok(!renderResume('# n\n### 고아\n## 경력\n### 회사', NOW).includes('고아'))
})

test('gapItem: esc 후 **굵게**', () => {
  assert.equal(gapItem('<x> **y**'), '&lt;x&gt; <b>y</b>')
})

test('renderResume: 사진이 있으면 이름 · 연락처 왼쪽, 없으면 그대로', () => {
  const html = renderResume('# n\n- 메일: a@b.c\n> 소개', NOW, 'data:image/jpeg;base64,AAAA')
  assert.match(html, /<div class="cv-id"><img class="cv-photo" src="data:image\/jpeg;base64,AAAA" alt=""><div><h1 class="cv-name">n<\/h1><ul class="cv-contact">.*<\/ul><\/div><\/div><p class="cv-intro">/)
  assert.doesNotMatch(renderResume('# n', NOW), /cv-photo/)
})

test('cvBlanks: 아직 안 채운 [칸], 같은 칸은 한 번', () => {
  assert.deepEqual(cvBlanks('# n\n- GitHub: [GitHub 주소]\n## 교육\n- [자격증]\n- [GitHub 주소]'), ['GitHub 주소', '자격증'])
  assert.deepEqual(cvBlanks('# n\n- 메일: a@b.c'), [])
})

test('직무 근거 — 분류 · 소분류 · 본문으로 세고, 데이터는 소분류 · 본문으로', () => {
  const E = (tags: [string, string][], body = ''): Entry => ({ category: 'X', date: '2026-10-20', title: 't', type: '기능', tags: tags.map(([major, minor]) => ({ major, minor })), body, sections: {} })
  const ev = roleEvidence([E([['백엔드', 'FastAPI'], ['AI', 'LLM']]), E([['프론트엔드', 'React']]), E([['배포', 'AWS S3']], 'S3 보관 Parquet'), E([['백엔드', 'PostgreSQL']])])
  const by = Object.fromEntries(ev.map(r => [r.slug, r]))
  assert.deepEqual([by.backend!.count, by.frontend!.count, by['data-engineer']!.count, by['ai-engineer']!.count], [2, 1, 2, 1])
  assert.deepEqual(by.backend!.top, ['FastAPI', 'PostgreSQL'])
  assert.equal(by['data-engineer']!.label, '데이터 엔지니어')
})

test('빈 이력서 — 구역 제목 · 머리 줄뿐이면 비었다', () => {
  assert.equal(cvIsBlank('## 자기소개\n\n## 프로젝트\n\n## 보완할 경험\n### 부족한 경험\n'), true)
  assert.equal(cvIsBlank('# 이름\n- 이메일: a@b.c\n\n## 자기소개\n'), true)
  assert.equal(cvIsBlank('## 자기소개\n- 측정합니다\n'), false)
  assert.equal(cvIsBlank('## 기술\n- 언어: Python\n'), false) // 구역 안의 '- 분류: …' 는 내용
})

test('직무 근거 — 개인 작업은 따로 센다', () => {
  const E2 = (category: string, major: string, minor: string): Entry => ({ category, date: '2026-10-20', title: 't', type: '기능', tags: [{ major, minor }], body: '', sections: {} })
  const by = Object.fromEntries(roleEvidence([E2('Inkline', '프론트엔드', 'React'), E2('Billing', '프론트엔드', 'React')], ['Inkline']).map(r => [r.slug, r]))
  assert.deepEqual([by.frontend!.count, by.frontend!.mine], [2, 1])
})
