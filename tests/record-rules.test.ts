import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readRules, writeRules } from '../src/main/recordRules.ts'
import { DEFAULT_RECORD_RULES } from '../src/shared/types.ts'

test('스킬 폴더가 없으면 null, 파일이 없거나 깨졌으면 기본값', async () => {
  const d = await mkdtemp(join(tmpdir(), 'rules-'))
  assert.equal(await readRules(join(d, 'none')), null)
  assert.deepEqual(await readRules(d), DEFAULT_RECORD_RULES)
  await writeFile(join(d, 'rules.json'), '{broken')
  assert.deepEqual(await readRules(d), DEFAULT_RECORD_RULES)
})

test('쓰고 읽기 · 모르는 키 무시 · 잘못된 값 거절', async () => {
  const d = await mkdtemp(join(tmpdir(), 'rules-'))
  const v = { ...DEFAULT_RECORD_RULES, mergeIntegration: false, taskDone: true }
  assert.deepEqual(await writeRules(d, { ...v, extra: 1 }), v)
  assert.deepEqual(await readRules(d), v)
  assert.equal(JSON.parse(await readFile(join(d, 'rules.json'), 'utf8')).auto.taskDone, true)
  await assert.rejects(writeRules(d, { ...v, release: 'yes' }))
  await assert.rejects(writeRules(d, null))
})
