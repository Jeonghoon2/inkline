import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { ask } from '../src/main/ai/run.ts'
import type { JsonSchema } from '../src/main/ai/schema.ts'

const schema: JsonSchema = { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'], additionalProperties: false }
const FAKE = join(import.meta.dirname, 'fixtures/bin/fake-claude.sh')
const base = { task: 't', cli: 'claude' as const, cliPath: FAKE, model: '', effort: '', system: 'S', schema, timeoutMs: 3000 }

test('정상', async () => assert.deepEqual(await ask({ ...base, prompt: 'hi' }), { ok: true, value: { a: 7 } }))
test('형식이 틀리면 한 번 다시 묻는다', async () => assert.deepEqual(await ask({ ...base, prompt: 'BAD' }), { ok: true, value: { a: 1 } }))
test('종료 코드가 0 이 아니면 cli-error 와 stderr', async () => {
  const r = await ask({ ...base, prompt: 'FAIL' })
  assert.deepEqual(r, { ok: false, error: { code: 'cli-error', message: 'boom' } })
})
test('시간 초과는 그룹째 끈다', async () => {
  const t = Date.now()
  const r = await ask({ ...base, prompt: 'SLEEP', timeoutMs: 300 })
  assert.equal(r.ok ? '' : r.error.code, 'timeout')
  assert.ok(Date.now() - t < 2000)
})
test('취소', async () => {
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 200)
  const r = await ask({ ...base, prompt: 'SLEEP', signal: ac.signal })
  assert.equal(r.ok ? '' : r.error.code, 'aborted')
})
test('이미 취소된 신호면 곧바로 aborted', async () => {
  const r = await ask({ ...base, cliPath: '/nonexistent/cli', prompt: 'x', signal: AbortSignal.abort() }) // 띄웠다면 cli-error
  assert.equal(r.ok ? '' : r.error.code, 'aborted')
})
test('고른 CLI 없음 · 설치 안 됨', async () => {
  assert.equal(((await ask({ ...base, cli: null, prompt: 'x' })) as { ok: false; error: { code: string } }).error.code, 'no-cli')
  assert.equal(((await ask({ ...base, cliPath: null, prompt: 'x' })) as { ok: false; error: { code: string } }).error.code, 'not-installed')
})
test('TERM 을 무시해도 KILL 로 끝낸다', async () => {
  const t = Date.now()
  const r = await ask({ ...base, prompt: 'TRAPSLEEP', timeoutMs: 300 })
  assert.equal(r.ok ? '' : r.error.code, 'timeout')
  assert.ok(Date.now() - t < 3500)
})
test('오류를 stdout JSON 으로 알리고 1 로 끝나는 claude', async () => {
  assert.deepEqual(await ask({ ...base, prompt: 'LOGIN' }), { ok: false, error: { code: 'cli-error', message: 'AI 도구에 로그인돼 있지 않습니다 — 터미널에서 그 도구(claude · codex · gemini)를 한 번 실행해 로그인한 뒤 다시 시도하세요 (Not logged in · Please run /login)' } })
})
test('두 번 다 틀리면 bad-output', async () => {
  const r = await ask({ ...base, prompt: 'ALWAYSBAD' })
  assert.equal(r.ok ? '' : r.error.code, 'bad-output')
})
test('deadlineMs: 첫 시도가 오래 걸려 남은 시간이 1초 미만이면 다시 묻지 않고 timeout', async () => {
  const t = Date.now()
  const r = await ask({ ...base, prompt: 'SLOWBAD', timeoutMs: 3000, deadlineMs: 1500 })
  assert.equal(r.ok ? '' : r.error.code, 'timeout')
  assert.ok(Date.now() - t < 2500)
})
