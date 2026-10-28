import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cliArgs, stdinFor } from '../src/main/ai/args.ts'
import type { JsonSchema } from '../src/main/ai/schema.ts'

const schema: JsonSchema = { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'], additionalProperties: false }
const o = { model: 'opus', effort: 'low', schema, system: 'SYS', schemaFile: '/t/schema.json', outFile: '/t/out.txt', cwd: '/t' }

test('claude: 도구 · 스킬 · MCP 끄고 시스템 프롬프트 교체, 모델 · 노력 수준', () => {
  const a = cliArgs('claude', o)
  assert.deepEqual(a.slice(0, 5), ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema)])
  for (const f of ['--disable-slash-commands', '--strict-mcp-config', '--no-session-persistence', '--exclude-dynamic-system-prompt-sections']) assert.ok(a.includes(f), f)
  assert.equal(a[a.indexOf('--tools') + 1], '')
  assert.equal(a[a.indexOf('--system-prompt') + 1], 'SYS')
  assert.equal(a[a.indexOf('--model') + 1], 'opus')
  assert.equal(a[a.indexOf('--effort') + 1], 'low')
  assert.ok(!cliArgs('claude', { ...o, model: '', effort: '' }).includes('--model'))
})

test('codex: 읽기 전용 · 일회성 · 스키마 파일 · 마지막 답 파일 · stdin', () => {
  const a = cliArgs('codex', o)
  assert.equal(a[0], 'exec')
  assert.equal(a[a.indexOf('-m') + 1], 'opus')
  assert.equal(a[a.indexOf('-c') + 1], 'model_reasoning_effort=low')
  assert.equal(a[a.indexOf('--output-schema') + 1], '/t/schema.json')
  assert.equal(a[a.indexOf('-s') + 1], 'read-only')
  assert.equal(a[a.indexOf('-o') + 1], '/t/out.txt')
  assert.equal(a.at(-1), '-')
})

test('gemini: 계획 모드 · JSON 출력 · 신뢰 확인 건너뛰기', () => {
  const a = cliArgs('gemini', { ...o, model: 'flash' })
  assert.deepEqual(a.slice(0, 7), ['-p', '', '-o', 'json', '--approval-mode', 'plan', '--skip-trust'])
  assert.equal(a[a.indexOf('-m') + 1], 'flash')
})

test('stdin: claude 는 프롬프트만, gemini 는 스키마 안내까지', () => {
  assert.equal(stdinFor('claude', 'SYS', 'P', schema), 'P')
  assert.equal(stdinFor('codex', 'SYS', 'P', schema), 'SYS\n\nP')
  assert.match(stdinFor('gemini', 'SYS', 'P', schema), /^SYS\n\nP\n\nJSON 하나만 답한다/)
})

test('웹 검색 허용 — claude 는 WebSearch · WebFetch 만, codex 는 exec 앞 --search, 끄면 그대로', () => {
  const c = cliArgs('claude', { ...o, web: true })
  assert.equal(c[c.indexOf('--tools') + 1], 'WebSearch,WebFetch')
  assert.equal(c[c.indexOf('--allowedTools') + 1], 'WebSearch,WebFetch')
  assert.deepEqual(cliArgs('codex', { ...o, web: true }).slice(0, 2), ['--search', 'exec'])
  assert.ok(!cliArgs('codex', o).includes('--search'))
  assert.ok(!cliArgs('claude', o).includes('--allowedTools'))
})
