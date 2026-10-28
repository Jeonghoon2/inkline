import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isExternalHttpUrl } from '../src/main/urls.ts'

test('http / https 만 바깥 링크로 허용', () => {
  assert.equal(isExternalHttpUrl('http://example.com'), true)
  assert.equal(isExternalHttpUrl('https://example.com/a?b=1'), true)
})

test('그 밖의 스킴 · 쓰레기는 거부', () => {
  for (const u of ['file:///etc/passwd', 'smb://host/share', 'javascript:alert(1)', 'myapp://x', 'garbage', ''])
    assert.equal(isExternalHttpUrl(u), false, u)
})
