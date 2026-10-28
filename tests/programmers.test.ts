import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseProgrammers } from '../src/main/coding/programmers.ts'
import { LANGS } from '../src/shared/types.ts'

const F = join(import.meta.dirname, 'fixtures/programmers')
const pages = Object.fromEntries(LANGS.map(l => [l, readFileSync(join(F, `${l}.html`), 'utf8')]))

test('제목 · 레벨 · 주소', () => {
  const d = parseProgrammers('118667', pages)!
  assert.equal(d.title, '두 큐 합 같게 만들기')
  assert.equal(d.siteLevel, 'Lv. 2')
  assert.equal(d.url, 'https://school.programmers.co.kr/learn/courses/30/lessons/118667')
  assert.equal(d.site, 'programmers')
  assert.deepEqual(d.siteTags, [])
})

test('본문은 markdown 칸 안쪽만, 안쪽 div 를 포함해 끝까지', () => {
  const d = parseProgrammers('118667', pages)!
  assert.match(d.html, /^<p>길이가 같은 두 개의 큐가 주어집니다/)
  assert.match(d.html, /<div class="highlight"><pre>x<\/pre><\/div>/)
  assert.match(d.html, /<p>설명 &amp; 끝<\/p>\s*$/)
  assert.doesNotMatch(d.html, /textarea/)
})

test('언어별 시작 코드는 엔티티를 푼다', () => {
  const d = parseProgrammers('118667', pages)!
  assert.match(d.starter.python3!, /^def solution\(queue1, queue2\):/)
  assert.match(d.starter.cpp!, /#include <vector>/)
  assert.match(d.starter.java!, /public int solution\(int\[\] queue1, int\[\] queue2\)/)
})

test('시그니처는 Java 시작 코드에서', () => {
  assert.deepEqual(parseProgrammers('118667', pages)!.signature, {
    name: 'solution',
    params: [{ name: 'queue1', type: { array: 'int' } }, { name: 'queue2', type: { array: 'int' } }],
    returns: 'int'
  })
})

test('입출력 예 표 → 예제', () => {
  assert.deepEqual(parseProgrammers('118667', pages)!.examples, [
    { args: [[3, 2, 7, 2], [4, 6, 5, 1]], expected: 2 },
    { args: [[1, 1], [1, 5]], expected: -1 }
  ])
})

test('본문이 없으면 null (로그인 화면 · 구조 바뀜)', () => {
  assert.equal(parseProgrammers('1', { python3: '<html><body>로그인</body></html>' }), null)
})

test('제목이 없으면 null', () => {
  const page = '<div class="guide-section-description"><div class="markdown"><p>본문</p></div></div>'
  assert.equal(parseProgrammers('1', { python3: page }), null)
})
