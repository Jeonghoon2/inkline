import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esc, plain, conceptKeys, hl, md, badge, dkey, md2, toDay, tally, entryKeys, shortUrl } from '../src/renderer/history/render.ts'

const C = { '종료 코드 137': { why: '원리', qs: [] }, '화면 분할': { why: '나눔', qs: [] } }

test('esc 는 & < > " 를 바꾼다', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  assert.equal(esc(null), '')
})

test('형광펜: 보이는 글자 · 이름, 사전에 있는 것만', () => {
  const s = '==둘로|화면 분할== 와 ==종료 코드 137== 와 ==없는 개념=='
  assert.equal(plain(s), '둘로 와 종료 코드 137 와 없는 개념')
  assert.deepEqual(conceptKeys(s, C), ['화면 분할', '종료 코드 137'])
  assert.equal(hl('==둘로|화면 분할=='), '<mark class="cc" tabindex="0" data-c="화면 분할">둘로</mark>')
})

test('md: 목록 · 번호 목록 · 굵게 · 문단, HTML 은 이스케이프', () => {
  assert.equal(
    md('- **겹침** 문제\n- <b>x</b>\n\n1. 하나\n2. 둘\n문단 ==종료 코드 137=='),
    '<ul><li><b>겹침</b> 문제</li><li>&lt;b&gt;x&lt;/b&gt;</li></ul><ol class="steps"><li>하나</li><li>둘</li></ol>' +
      '<p>문단 <mark class="cc" tabindex="0" data-c="종료 코드 137">종료 코드 137</mark></p>'
  )
  assert.equal(md('# 제목'), '<h2>제목</h2>')
})

test('badge 와 날짜 도우미', () => {
  assert.equal(badge('기능'), '<span class="b" style="--t:var(--t-feat)">기능</span>')
  assert.equal(badge('기타'), '<span class="b" style="--t:var(--t-etc)">기타</span>')
  assert.equal(badge(''), '')
  assert.equal(dkey(toDay('2026-10-07')), '2026-10-07')
  assert.equal(md2(toDay('2026-10-07')), '10.7')
  assert.deepEqual({ ...tally(['a', 'b', 'a'], x => x) }, { a: 2, b: 1 })
})

test('entryKeys 는 내용과 섹션을 함께 본다', () => {
  const e = { category: 'A', date: '2026-10-07', title: 't', type: '기능', tags: [], body: '==화면 분할==', sections: { 문제: '==종료 코드 137==' } }
  assert.deepEqual(entryKeys(e, C), ['화면 분할', '종료 코드 137'])
})

test('사전 조회는 자기 속성만 — constructor 같은 이름은 개념도 종류도 아니다', () => {
  assert.deepEqual(conceptKeys('==constructor==', C), [])
  assert.ok(badge('constructor').includes('var(--t-etc)'))
})

test('md: 형광펜 이름에 든 태그 · 따옴표는 이스케이프된다', () => {
  const out = md('==<img src=x onerror=alert(1)>|"x==')
  assert.ok(!out.includes('<img'))
  assert.ok(out.includes('&lt;img'))
})

test('shortUrl 은 slug 규칙으로 inkline-media 주소를 만든다', () => {
  assert.equal(shortUrl('종료 코드 137'), 'inkline-media://shorts/' + encodeURIComponent('종료_코드_137') + '.mp4')
})

test('tally: constructor 같은 키도 센다', () => {
  assert.equal(tally(['constructor', 'constructor'], x => x).constructor, 2)
})

test('md: 두 칸 들여쓴 줄은 하위 줄(li.sub)', () => {
  assert.equal(md('- 주제: 기존 → 변경\n  - 채택: 먼저 묻기'), '<ul><li>주제: 기존 → 변경</li><li class="sub">채택: 먼저 묻기</li></ul>')
})
