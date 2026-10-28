import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, MIGRATIONS, getSettings, setSetting, isValidSetting, pickFirstAi } from '../src/main/db.ts'
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types.ts'

const defaults: Settings = { ...DEFAULT_SETTINGS, historyRoot: '/tmp/h' }

test('새 DB 는 마이그레이션을 끝까지 적용한다', () => {
  const db = openDb(':memory:')
  const v = db.prepare('PRAGMA user_version').get() as { user_version: number }
  assert.equal(v.user_version, MIGRATIONS.length)
})

test('저장한 값이 없으면 기본값', () => {
  const db = openDb(':memory:')
  assert.deepEqual(getSettings(db, defaults), defaults)
})

test('setSetting 은 덮어쓰고 타입을 지킨다', () => {
  const db = openDb(':memory:')
  setSetting(db, 'ai.cli', 'codex')
  setSetting(db, 'ai.cli', 'claude')
  setSetting(db, 'nudge.enabled', false)
  setSetting(db, 'run.timeoutMs', 5000)
  const s = getSettings(db, defaults)
  assert.equal(s['ai.cli'], 'claude')
  assert.equal(s['nudge.enabled'], false)
  assert.equal(s['run.timeoutMs'], 5000)
})

test('파일 DB 를 다시 열어도 값이 남고 마이그레이션을 다시 돌리지 않는다', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'inkline-')), 'a.db')
  setSetting(openDb(file), 'theme', 'dark')
  assert.equal(getSettings(openDb(file), defaults).theme, 'dark')
})

test('모르는 키는 무시한다', () => {
  const db = openDb(':memory:')
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)').run('old.key', '"x"')
  assert.equal('old.key' in getSettings(db, defaults), false)
})

test('상속된 이름(constructor)은 저장값이 있어도 설정으로 복사하지 않는다', () => {
  const db = openDb(':memory:')
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)').run('constructor', '"x"')
  assert.equal(Object.hasOwn(getSettings(db, defaults), 'constructor'), false)
})

test('isValidSetting: 기본값은 모두 통과', () => {
  for (const [k, v] of Object.entries(defaults)) assert.equal(isValidSetting(k, v, defaults), true, k)
  assert.equal(isValidSetting('ai.cli', 'codex', defaults), true)
})

test('isValidSetting: 잘못된 값 거부', () => {
  assert.equal(isValidSetting('ai.cli', 'bash', defaults), false)
  assert.equal(isValidSetting('theme', 'blue', defaults), false)
  assert.equal(isValidSetting('run.timeoutMs', 1234.5, defaults), false)
  assert.equal(isValidSetting('run.timeoutMs', -1, defaults), false)
  assert.equal(isValidSetting('ai.model', '--danger', defaults), false)
  assert.equal(isValidSetting('ai.effort', '-x', defaults), false)
  assert.equal(isValidSetting('historyRoot', '', defaults), false)
  assert.equal(isValidSetting('nudge.enabled', 'yes', defaults), false)
  assert.equal(isValidSetting('nope', 1, defaults), false)
})

test('getSettings 는 깨진 행 · 타입이 틀린 행을 건너뛴다', () => {
  const db = openDb(':memory:')
  const ins = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)')
  ins.run('theme', '{not json')
  ins.run('nudge.enabled', '"yes"')
  ins.run('ai.cli', '"codex"')
  const s = getSettings(db, defaults)
  assert.equal(s.theme, defaults.theme)
  assert.equal(s['nudge.enabled'], defaults['nudge.enabled'])
  assert.equal(s['ai.cli'], 'codex')
})

test('마이그레이션이 실패하면 되돌리고 버전을 올리지 않는다', () => {
  MIGRATIONS.push('CREATE TABLE broken (')
  try {
    assert.throws(() => openDb(':memory:'))
  } finally {
    MIGRATIONS.pop()
  }
  const db = openDb(':memory:')
  const v = db.prepare('PRAGMA user_version').get() as { user_version: number }
  assert.equal(v.user_version, MIGRATIONS.length)
})

test('coding.lang 은 네 언어만', () => {
  assert.equal(isValidSetting('coding.lang', 'java', defaults), true)
  assert.equal(isValidSetting('coding.lang', 'ruby', defaults), false)
})

test('isValidSetting: run.timeoutMs 는 1~60초', () => {
  assert.equal(isValidSetting('run.timeoutMs', 999, defaults), false)
  assert.equal(isValidSetting('run.timeoutMs', 60_001, defaults), false)
  assert.equal(isValidSetting('run.timeoutMs', 1000, defaults), true)
  assert.equal(isValidSetting('run.timeoutMs', 60_000, defaults), true)
})

test('resume.through — 이력서 키 → 날짜만', () => {
  const d = { ...DEFAULT_SETTINGS, historyRoot: '/h' }
  assert.equal(isValidSetting('resume.through', {}, d), true)
  assert.equal(isValidSetting('resume.through', { base: '2026-10-19', backend: '2026-10-18' }, d), true)
  assert.equal(isValidSetting('resume.through', { base: '10/19' }, d), false)
  assert.equal(isValidSetting('resume.through', { '../x': '2026-10-19' }, d), false)
  assert.equal(isValidSetting('resume.through', [], d), false)
})

test('테마 설정 — 테마 이름 · 밝을 때 칸은 밝은 테마만 · 어두울 때 칸은 어두운 테마만', () => {
  assert.equal(isValidSetting('theme', 'nord', defaults), true)
  assert.equal(isValidSetting('theme', 'system', defaults), true)
  assert.equal(isValidSetting('theme.light', 'paper', defaults), true)
  assert.equal(isValidSetting('theme.light', 'dracula', defaults), false)
  assert.equal(isValidSetting('theme.dark', 'solarized-dark', defaults), true)
  assert.equal(isValidSetting('theme.dark', 'sky', defaults), false)
  assert.equal(isValidSetting('theme.dark', 'system', defaults), false)
})

test('DB 백업 — 마이그레이션 전 · 하루 한 번, 7개까지', async () => {
  const { mkdtemp, readdir } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { backupDb } = await import('../src/main/db.ts')
  const dir = await mkdtemp(join(tmpdir(), 'dbbk-'))
  const file = join(dir, 'inkline.db')
  openDb(file).close() // 새 파일: 백업 없음
  assert.deepEqual(await readdir(dir).then(x => x.includes('backups')), false)
  openDb(file).close() // 다시 열면 오늘 백업
  assert.ok((await readdir(join(dir, 'backups'))).some(n => /-daily\.db$/.test(n)))
  // 낮은 버전으로 되돌려 두면(이미 있는 표라 마이그레이션은 실패하지만) 그 전에 백업이 남는다
  const db = openDb(file); db.exec('PRAGMA user_version = 3'); db.close()
  assert.throws(() => openDb(file))
  assert.ok((await readdir(join(dir, 'backups'))).some(n => /-v3\.db$/.test(n)))
  const { DatabaseSync } = await import('node:sqlite')
  const db2 = new DatabaseSync(file)
  for (let d = 1; d <= 9; d++) backupDb(db2, file, 'daily', new Date(2026, 0, d))
  db2.close()
  assert.equal((await readdir(join(dir, 'backups'))).length, 7)
})

test('isValidSetting: 이력서 사진은 빈 값이거나 이미지 data URL 만', () => {
  assert.equal(isValidSetting('resume.photo', 'data:image/jpeg;base64,/9j/4AAQ==', defaults), true)
  assert.equal(isValidSetting('resume.photo', 'data:text/html;base64,PGI+', defaults), false)
  assert.equal(isValidSetting('resume.photo', 'https://x/y.jpg', defaults), false)
  assert.equal(isValidSetting('resume.photo', 'data:image/png;base64,"onerror=', defaults), false)
})

test('새로 깐 앱은 깔린 AI CLI 중 첫째를 고르고, 고른 적이 있으면 그대로 둔다', () => {
  const ai = [{ id: 'claude', version: null }, { id: 'gemini', version: '0.43.0' }, { id: 'codex', version: '0.1' }] as const
  const db = openDb(':memory:')
  pickFirstAi(db, [...ai])
  assert.equal(getSettings(db, defaults)['ai.cli'], 'gemini')
  setSetting(db, 'ai.cli', null) // 환경설정에서 '없음'
  pickFirstAi(db, [...ai])
  assert.equal(getSettings(db, defaults)['ai.cli'], null)
  const none = openDb(':memory:')
  pickFirstAi(none, [{ id: 'claude', version: null }])
  assert.equal(getSettings(none, defaults)['ai.cli'], null)
})
