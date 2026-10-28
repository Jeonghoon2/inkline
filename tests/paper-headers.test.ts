import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPdfResponse, forceAttachment } from '../src/main/paperHeaders.ts'

test('isPdfResponse: 대소문자 무시, 배열/문자열 모두', () => {
  assert.equal(isPdfResponse({ 'Content-Type': ['application/pdf; charset=binary'] }), true)
  assert.equal(isPdfResponse({ 'content-type': 'Application/PDF' }), true)
  assert.equal(isPdfResponse({ 'content-type': ['text/html'] }), false)
  assert.equal(isPdfResponse({}), false)
})

test('forceAttachment: 기존 inline 을 attachment 로 바꾸고 나머지는 둔다', () => {
  const r = forceAttachment({ 'content-disposition': ['inline; filename=a.pdf'], 'Content-Type': ['application/pdf'] })
  assert.deepEqual(r, { 'Content-Type': ['application/pdf'], 'Content-Disposition': ['attachment'] })
  assert.deepEqual(forceAttachment({ X: 'y' }), { X: 'y', 'Content-Disposition': ['attachment'] })
})
