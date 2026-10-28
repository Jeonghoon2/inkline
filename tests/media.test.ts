import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediaPath, parseRange } from '../src/main/mediaPath.ts'

test('쇼츠 폴더의 mp4 만 허용', () => {
  assert.equal(mediaPath('/h', 'inkline-media://shorts/%EC%A2%85%EB%A3%8C_%EC%BD%94%EB%93%9C_137.mp4'), '/h/shorts/종료_코드_137.mp4')
  assert.equal(mediaPath('/h', 'inkline-media://shorts/..%2Fresume.md'), null)
  assert.equal(mediaPath('/h', 'inkline-media://shorts/a.mov'), null)
  assert.equal(mediaPath('/h', 'inkline-media://other/a.mp4'), null)
  assert.equal(mediaPath('/h', 'inkline-media://shorts/a%2Fb.mp4'), null)
})

test('parseRange', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 })
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 })
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 })
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 })
  assert.equal(parseRange('bytes=2000-', 1000), 'invalid')
  assert.equal(parseRange('bytes=5-2', 1000), 'invalid')
  assert.equal(parseRange(null, 1000), null)
})
