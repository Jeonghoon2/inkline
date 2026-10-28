import { test } from 'node:test'
import assert from 'node:assert/strict'
import { constraintLines, parseBound, allowedFor, limitsOf } from '../src/main/theory/limits.ts'

const PG_QUEUE = '<h5>제한사항</h5><ul><li>1 ≤ <code>queue1</code>의 길이 = <code>queue2</code>의 길이 ≤ 300,000</li><li>1 ≤ <code>queue1</code>의 원소, <code>queue2</code>의 원소 ≤ 10<sup>9</sup></li></ul><h5>입출력 예</h5><table><tr><td>[3, 2, 7, 2]</td></tr></table>'
const PG_GRID = '<h5>제한사항</h5><ul><li>격자의 크기 m, n은 1 이상 100 이하인 자연수입니다.</li><li>물에 잠긴 지역은 0개 이상 10개 이하입니다.</li></ul><h5>입출력 예</h5>'
const PG_RAIL = '<h5>제한사항</h5><ul><li>2 ≤ <code>grid</code> 의 세로 길이 = n ≤ 8</li><li>2 ≤ <code>grid</code> 의 가로 길이 = m ≤ 8</li><li>n × m ≤ 20</li></ul><h5>테스트 케이스 구성 안내</h5>'
const LC_TWO = '<p>Example 1:</p><pre>Input: nums = [2,7]</pre><p><strong>Constraints:</strong></p><ul><li><code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code></li><li><code>-10<sup>9</sup> &lt;= nums[i] &lt;= 10<sup>9</sup></code></li><li><code>-10<sup>9</sup> &lt;= target &lt;= 10<sup>9</sup></code></li></ul><p><strong>Follow-up:</strong> less than O(n<sup>2</sup>)?</p>'

test('제약 구역만 줄로 — 다음 구역 앞에서 끊는다', () => {
  assert.deepEqual(constraintLines(PG_QUEUE), ['1 ≤ queue1의 길이 = queue2의 길이 ≤ 300,000', '1 ≤ queue1의 원소, queue2의 원소 ≤ 10^9'])
  assert.equal(constraintLines(LC_TWO).length, 3)
  assert.deepEqual(constraintLines('<p>제약이 없는 글</p>'), [])
})

test('상한 읽기 — 쉼표 · 거듭제곱 · 곱 · 이하 · 만', () => {
  assert.equal(parseBound('1 ≤ n ≤ 300,000'), 300000)
  assert.equal(parseBound('2 <= nums.length <= 10^4'), 10000)
  assert.equal(parseBound('1 <= n <= 3 × 10^5'), 300000)
  assert.equal(parseBound('m, n은 1 이상 100 이하인 자연수'), 100)
  assert.equal(parseBound('n은 10만 이하'), 100000)
  assert.equal(parseBound('정수 배열'), null)
})

test('허용 복잡도 표(1초)', () => {
  assert.equal(allowedFor(10), 'O(N!)')
  assert.equal(allowedFor(20), 'O(2^N)')
  assert.equal(allowedFor(100), 'O(N^3)')
  assert.equal(allowedFor(5000), 'O(N^2)')
  assert.equal(allowedFor(300000), 'O(N log N)')
  assert.equal(allowedFor(10 ** 7), 'O(N)')
})

test('크기 줄만 N 으로 — 값 줄(원소 · nums[i] · target)은 뺀다', () => {
  assert.deepEqual([limitsOf(PG_QUEUE).n, limitsOf(PG_QUEUE).allowed], [300000, 'O(N log N)'])
  assert.deepEqual([limitsOf(PG_GRID).n, limitsOf(PG_GRID).allowed], [100, 'O(N^3)'])
  assert.deepEqual([limitsOf(PG_RAIL).n, limitsOf(PG_RAIL).allowed], [20, 'O(2^N)'])
  assert.deepEqual([limitsOf(LC_TWO).n, limitsOf(LC_TWO).allowed], [10000, 'O(N log N)'])
  assert.equal(limitsOf(LC_TWO).source, 'text')
})

test('못 읽으면 분류의 complexityNote 를 추정으로', () => {
  const l = limitsOf('<p>설명뿐</p>', 'N ≤ 10⁵ → O(N log N)')
  assert.deepEqual([l.source, l.allowed, l.note], ['ai', null, 'N ≤ 10⁵ → O(N log N)'])
  assert.equal(limitsOf('<p>설명뿐</p>').source, 'none')
})

test('값 줄(한 글자 변수 + 100만 초과)은 N 에서 뺀다', () => {
  const html = '<h5>제한사항</h5><ul><li>1 ≤ n ≤ 1,000,000,000</li><li>1 ≤ k ≤ 500,000</li><li>1 ≤ enemy의 길이 ≤ 1,000,000</li></ul>'
  const l = limitsOf(html)
  assert.equal(l.n, 1_000_000)
  assert.equal(l.allowed, 'O(N log N)')
})
