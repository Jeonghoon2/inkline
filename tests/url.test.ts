import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProblemUrl } from '../src/main/coding/url.ts'

test('Programmers 주소 정규화', () => {
  assert.deepEqual(parseProblemUrl(' https://school.programmers.co.kr/learn/courses/30/lessons/118667?language=java#x '), {
    site: 'programmers',
    siteId: '118667',
    url: 'https://school.programmers.co.kr/learn/courses/30/lessons/118667'
  })
  assert.equal(parseProblemUrl('https://programmers.co.kr/learn/courses/30/lessons/42576')?.siteId, '42576')
})

test('LeetCode 주소 정규화', () => {
  assert.deepEqual(parseProblemUrl('https://leetcode.com/problems/two-sum/description/'), {
    site: 'leetcode',
    siteId: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/'
  })
  assert.equal(parseProblemUrl('leetcode.com/problems/two-sum'), null) // 프로토콜 없음
})

test('그 밖의 주소는 null', () => {
  for (const s of ['', 'abc', 'https://example.com/problems/two-sum', 'https://school.programmers.co.kr/learn/courses/30/lessons/abc', 'https://leetcode.com/contest/x', 'javascript:alert(1)'])
    assert.equal(parseProblemUrl(s), null, s)
})
