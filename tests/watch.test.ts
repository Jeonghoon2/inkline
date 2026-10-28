import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watchDir } from '../src/main/watch.ts'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

test('하위 폴더 파일이 여러 번 바뀌어도 한 번으로 묶어 알린다', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mh-'))
  mkdirSync(join(root, 'AppDesk'))
  let n = 0
  const stop = watchDir(root, () => n++, 200)
  await wait(100)
  writeFileSync(join(root, 'AppDesk', '2026-10.md'), 'a')
  writeFileSync(join(root, 'AppDesk', '2026-10.md'), 'b')
  writeFileSync(join(root, 'concepts.md'), 'c')
  await wait(800)
  stop()
  assert.equal(n, 1)
})

test('끈 뒤에는 알리지 않는다', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mh-'))
  let n = 0
  const stop = watchDir(root, () => n++, 100)
  stop()
  writeFileSync(join(root, 'x.md'), 'a')
  await wait(400)
  assert.equal(n, 0)
})

test('없는 폴더는 조용히 넘어간다', () => {
  const stop = watchDir(join(tmpdir(), 'no-such-dir-inkline'), () => {})
  stop()
})

test('.md · .mp4 가 아닌 파일은 알리지 않는다', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mh-'))
  let n = 0
  const stop = watchDir(root, () => n++, 100)
  await wait(100)
  writeFileSync(join(root, 'x.log'), 'a')
  await wait(500)
  stop()
  assert.equal(n, 0)
})
