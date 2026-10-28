import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCodexModels, listModels, CLAUDE_MODELS, GEMINI_MODELS } from '../src/main/models.ts'
import type { Tools } from '../src/shared/types.ts'

const CODEX_JSON = JSON.stringify({
  models: [{ slug: 'gpt-6.1-sol', visibility: 'list', supported_reasoning_levels: [{ effort: 'high' }] }]
})

function toolsWithCodex(path: string | null, version: string | null): Tools {
  return { ai: [{ id: 'codex', path, version }], runners: [] }
}

test('codex 버전을 못 읽었으면 실행하지 않고 빈 목록', async () => {
  assert.deepEqual(await listModels('codex', toolsWithCodex(null, null)), [])
  assert.deepEqual(await listModels('codex', toolsWithCodex('/nonexistent/codex', null)), [])
})

test('codex 가 stderr 에 경고를 써도 stdout 의 JSON 으로 목록을 만든다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-'))
  const p = join(dir, 'codex')
  writeFileSync(p, `#!/bin/sh\necho '${CODEX_JSON}'\necho warning >&2\n`)
  chmodSync(p, 0o755)
  assert.deepEqual(await listModels('codex', toolsWithCodex(p, '0.160.1')), [{ id: 'gpt-6.1-sol', efforts: ['high'] }])
})


test('codex 모델 목록에서 보이는(list) 것만, 노력 수준과 함께', () => {
  const json = JSON.stringify({
    models: [
      { slug: 'gpt-6.1-sol', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] },
      { slug: 'internal-x', visibility: 'hide', supported_reasoning_levels: [] }
    ]
  })
  assert.deepEqual(parseCodexModels(json), [{ id: 'gpt-6.1-sol', efforts: ['low', 'high'] }])
})

test('codex 출력이 JSON 이 아니면 빈 목록', () => {
  assert.deepEqual(parseCodexModels('error: not logged in'), [])
})

test('고정 목록', () => {
  assert.deepEqual(CLAUDE_MODELS.map(m => m.id), ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])
  assert.deepEqual(CLAUDE_MODELS.map(m => [m.label, m.aliases]), [['Fable 5.1', ['fable']], ['Opus 5.5', ['opus']], ['Sonnet 5.5', ['sonnet']], ['Haiku 5.5', ['haiku']]])
  assert.deepEqual(CLAUDE_MODELS[0].efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(GEMINI_MODELS.map(m => m.id), ['auto', 'pro', 'flash', 'flash-lite'])
})
