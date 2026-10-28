import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createShorts } from '../src/main/shorts.ts'

// 가짜 엔진 — 받은 인자를 적고, 이름이 '실패'면 진짜 엔진처럼 stderr 에 이유를 남기고 1 로 끝난다
const dir = mkdtempSync(join(tmpdir(), 'inkline-shorts-'))
const engine = join(dir, 'shorts.mjs')
writeFileSync(engine, `import { appendFileSync } from 'node:fs'
const [name, , root] = process.argv.slice(2)
appendFileSync(${JSON.stringify(join(dir, 'calls'))}, name + '|' + root + '\\n')
console.log('음성 만드는 중')
await new Promise(r => setTimeout(r, 100))
if (name === '실패') { console.error('ffmpeg 가 없다'); process.exit(1) }
`)
const until = async (ok: () => boolean): Promise<void> => { for (let i = 0; i < 100 && !ok(); i++) await new Promise(r => setTimeout(r, 30)) }

test('한 편씩 돌려 진행 · 완료 · 실패를 알린다', async () => {
  let changes = 0
  const s = createShorts(engine, () => '/기록', () => { changes++ })
  assert.equal(s.make('페이지네이션').state, 'queued')
  assert.equal(s.make('실패').state, 'queued')
  assert.equal(s.make('페이지네이션').state, 'queued') // 줄에 있는 것은 다시 세우지 않는다
  await until(() => JSON.stringify(s.jobs()['페이지네이션']) === JSON.stringify({ state: 'running', step: '음성 만드는 중' }))
  assert.deepEqual(s.jobs()['페이지네이션'], { state: 'running', step: '음성 만드는 중' })
  assert.equal(s.jobs()['실패']!.state, 'queued') // 앞 편이 끝나기 전에는 기다린다
  await until(() => s.jobs()['실패']?.state === 'failed')
  assert.deepEqual(s.jobs()['페이지네이션'], { state: 'done' })
  assert.deepEqual(s.jobs()['실패'], { state: 'failed', error: 'ffmpeg 가 없다' })
  assert.equal(readFileSync(join(dir, 'calls'), 'utf8'), '페이지네이션|/기록\n실패|/기록\n')
  assert.ok(changes >= 5)
})

test('이름이 아니거나 엔진이 없으면 거절한다', () => {
  const s = createShorts(engine, () => '/기록', () => {})
  assert.throws(() => s.make('a\nb'), /개념 이름/)
  assert.throws(() => s.make(''), /개념 이름/)
  assert.throws(() => createShorts(join(dir, '없음.mjs'), () => '/', () => {}).make('x'), /concept-shorts/)
})
