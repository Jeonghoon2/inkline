import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { spawnGroup, killAll } from '../src/main/proc.ts'

const sh = (script: string, o: Partial<Parameters<typeof spawnGroup>[2]> = {}) =>
  spawnGroup('/bin/sh', ['-c', script], { cwd: tmpdir(), timeoutMs: 3000, ...o })

test('표준 입력 · 출력 · 종료 코드', async () => {
  const r = await sh('read x; echo "got $x"; echo err >&2; exit 4', { stdin: '한글\n' })
  assert.equal(r.stdout, 'got 한글\n')
  assert.equal(r.stderr, 'err\n')
  assert.equal(r.code, 4)
  assert.equal(r.timedOut, false)
})

test('시간 초과는 손자 프로세스까지 끈다', async () => {
  const t = Date.now()
  const r = await sh('sleep 10 & sleep 10; wait', { timeoutMs: 300 })
  assert.equal(r.timedOut, true)
  assert.ok(Date.now() - t < 2500)
})

test('TERM 을 무시해도 2초 뒤 KILL', async () => {
  const t = Date.now()
  const r = await sh("trap '' TERM; sleep 10", { timeoutMs: 200 })
  assert.equal(r.timedOut, true)
  assert.ok(Date.now() - t < 3500)
})

test('출력 상한', async () => {
  const r = await sh('yes x | head -c 3000000', { maxOutput: 1000 })
  assert.ok(r.stdout.length < 1100)
  assert.match(r.stdout, /잘랐습니다\)$/)
})

test('이미 취소된 신호면 띄우지 않는다', async () => {
  const ac = new AbortController()
  ac.abort()
  const r = await sh('echo no', { signal: ac.signal })
  assert.equal(r.aborted, true)
  assert.equal(r.stdout, '')
})

test('killAll 은 살아 있는 그룹을 끈다', async () => {
  const p = sh('sleep 10', { timeoutMs: 20000 })
  await new Promise(r => setTimeout(r, 200))
  killAll()
  const r = await p
  assert.notEqual(r.code, 0)
})

test('spawn 이 바로 던져도 reject 하지 않고 error 로', async () => {
  const r = await sh('echo\u0000x')
  assert.ok(r.error)
  assert.equal(r.code, null)
})

test('신호로 끝나면 signal 을 알린다', async () => {
  const r = await sh('kill -9 $$')
  assert.equal(r.signal, 'SIGKILL')
  assert.equal((await sh('exit 0')).signal, null)
})
