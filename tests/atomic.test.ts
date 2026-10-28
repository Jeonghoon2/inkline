import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicCopy, atomicWrite } from '../src/main/atomic.ts'

const dir = (): string => mkdtempSync(join(tmpdir(), 'inkline-atomic-'))

test('임시 파일 쓰기 — 없는 폴더도 만들고, 있는 파일은 통째로 바꾸며, .tmp 를 남기지 않는다', async () => {
  const d = dir(), f = join(d, 'a', 'b', 'x.md')
  await atomicWrite(f, '첫 글')
  assert.equal(readFileSync(f, 'utf8'), '첫 글')
  await atomicWrite(f, '둘째 글')
  assert.equal(readFileSync(f, 'utf8'), '둘째 글')
  assert.equal(existsSync(`${f}.tmp`), false)
})

test('임시 파일 쓰기 — 실패하면 던지고 .tmp 를 지운다(이름을 바꿀 수 없는 자리: 폴더)', async () => {
  const d = dir(), target = join(d, 'folder')
  mkdirSync(target)
  await assert.rejects(atomicWrite(target, '글'))
  assert.equal(existsSync(`${target}.tmp`), false)
})

test('임시 파일 복사 — 복사하고, 원본이 없으면 던지되 기존 파일은 그대로 · .tmp 는 남지 않는다', async () => {
  const d = dir(), src = join(d, 's.pdf'), dst = join(d, 'out', 'd.pdf')
  writeFileSync(src, '%PDF-1')
  await atomicCopy(src, dst)
  assert.equal(readFileSync(dst, 'utf8'), '%PDF-1')
  await assert.rejects(atomicCopy(join(d, '없음.pdf'), dst))
  assert.equal(readFileSync(dst, 'utf8'), '%PDF-1')
  assert.equal(existsSync(`${dst}.tmp`), false)
})
