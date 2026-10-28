import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cliFailure, parseCliOutput } from '../src/main/ai/parse.ts'

test('claude: structured_output, 없으면 result, is_error 는 cli-error', () => {
  assert.deepEqual(parseCliOutput('claude', JSON.stringify({ is_error: false, result: '{"a":1}', structured_output: { a: 2 } }), ''), { ok: true, value: { a: 2 } })
  assert.deepEqual(parseCliOutput('claude', JSON.stringify({ is_error: false, result: '{"a":1}' }), ''), { ok: true, value: { a: 1 } })
  const e = parseCliOutput('claude', JSON.stringify({ is_error: true, result: 'Not logged in' }), '')
  assert.deepEqual(e, { ok: false, error: { code: 'cli-error', message: 'AI 도구에 로그인돼 있지 않습니다 — 터미널에서 그 도구(claude · codex · gemini)를 한 번 실행해 로그인한 뒤 다시 시도하세요 (Not logged in)' } })
})

test('codex: 마지막 답 파일', () => {
  assert.deepEqual(parseCliOutput('codex', 'tokens used 20', '{"a":5}\n'), { ok: true, value: { a: 5 } })
  assert.equal((parseCliOutput('codex', '', 'not json') as { ok: false; error: { code: string } }).error.code, 'bad-output')
})

test('gemini: response 의 json 울타리를 뗀다', () => {
  assert.deepEqual(parseCliOutput('gemini', JSON.stringify({ response: '```json\n{"a":3}\n```' }), ''), { ok: true, value: { a: 3 } })
  assert.equal((parseCliOutput('gemini', 'Error authenticating', '') as { ok: false; error: { code: string } }).error.code, 'cli-error')
})

test('cliFailure: hook 로그 · 프롬프트 메아리를 걷고 마지막 ERROR 줄, 붐빔은 busy', () => {
  const raw = '…기록에 없는 일은 쓰지 않는다.\nhook: SessionStart\nhook: SessionStart Completed\nERROR: Selected model is at capacity. Please try a different model.\nERROR: Selected model is at capacity. Please try a different model.\n'
  const e = cliFailure(raw, 'x')
  assert.equal(e.code, 'busy')
  assert.ok(e.message.startsWith('선택한 모델이 지금 붐빕니다') && e.message.includes('(Selected model is at capacity. Please try a different model.)') && !e.message.includes('hook'))
  assert.ok(cliFailure('hook: a\nError: Not logged in\n', 'x').message.startsWith('AI 도구에 로그인돼 있지 않습니다'))
  assert.ok(cliFailure('Not logged in · Please run /login', 'x').message.endsWith('(Not logged in · Please run /login)'))
  assert.deepEqual(cliFailure('line1\nline2\nline3', 'x'), { code: 'cli-error', message: 'line2 line3' })
  assert.deepEqual(cliFailure('\nhook: only\n', '종료 코드 1'), { code: 'cli-error', message: '종료 코드 1' })
})

test('cliFailure: Claude 의 여러 문단 오류 — ID · 안내 줄은 버리고, 안전 장치 오탐은 busy', () => {
  const raw = "API Error: Opus 5.5's safeguards flagged this message (https://www.anthropic.com/legal/aup). This sometimes happens.\n\nTry rephrasing the request in a new session or change your model.\n\nLearn more: https://x\n\nDetails: `[reasoning_extraction]`\n\nRequest ID: req_1\n\nMessage ID: msg_1"
  const e = cliFailure(raw, 'x')
  assert.equal(e.code, 'busy')
  assert.ok(e.message.startsWith('모델의 안전 장치가') && !e.message.includes('Request ID'))
  assert.deepEqual(cliFailure('API Error: 500 Internal\n\nRequest ID: r', 'x'), { code: 'cli-error', message: '500 Internal' })
})
