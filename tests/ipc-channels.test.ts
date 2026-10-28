import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// registerIpc 를 여러 파일로 나눠도 채널이 하나도 빠지거나 겹치지 않아야 한다 — 같은 채널을 두 번 등록하면 앱이 켜질 때 죽는다
const EXPECTED = [
  'app:dataDir',
  'app:titleBar',
  'cert:answer',
  'cert:cancel',
  'cert:confirm',
  'cert:home',
  'cert:import',
  'cert:list',
  'cert:mockStart',
  'cert:mockSubmit',
  'cert:next',
  'cert:page',
  'cert:pairCard',
  'cert:pairs',
  'cert:pickPdf',
  'cert:remove',
  'cert:seen',
  'cert:segment',
  'cert:wrongs',
  'coding:classify',
  'coding:get',
  'coding:import',
  'coding:list',
  'coding:login',
  'coding:passedIds',
  'coding:statuses',
  'dialog:pickFolder',
  'drill:grade',
  'drill:state',
  'history:load',
  'history:rules',
  'history:setRules',
  'knowledge:attach',
  'knowledge:browse',
  'knowledge:cancelDraft',
  'knowledge:draft',
  'knowledge:load',
  'knowledge:openFile',
  'knowledge:pickPdf',
  'knowledge:remove',
  'knowledge:save',
  'practice:addCase',
  'practice:cancelRun',
  'practice:cases',
  'practice:finish',
  'practice:giveUp',
  'practice:lastRun',
  'practice:predict',
  'practice:removeCase',
  'practice:report',
  'practice:run',
  'practice:save',
  'practice:stage',
  'practice:start',
  'practice:support',
  'reports:cancel',
  'reports:make',
  'reports:remove',
  'reports:rename',
  'reports:save',
  'resume:addRole',
  'resume:backups',
  'resume:cancel',
  'resume:head',
  'resume:research',
  'resume:restore',
  'resume:review',
  'resume:save',
  'resume:savePdf',
  'resume:setHead',
  'resume:since',
  'resume:update',
  'review:due',
  'settings:all',
  'settings:set',
  'shell:openPath',
  'shorts:jobs',
  'shorts:make',
  'theory:approaches',
  'theory:cancel',
  'theory:choose',
  'theory:chosen',
  'theory:familiar',
  'theory:limits',
  'theory:log',
  'theory:scenes',
  'tools:detect',
  'tools:models',
  'tutor:answerStage',
  'tutor:hints',
  'tutor:mistakeBook',
  'tutor:mistakes',
  'tutor:nextHint',
  'tutor:nudge',
]

const main = join(import.meta.dirname, '..', 'src', 'main')
const sources = (): string[] => {
  const files = [join(main, 'ipc.ts')].filter(existsSync)
  const dir = join(main, 'ipc')
  if (existsSync(dir)) files.push(...readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => join(dir, f)))
  return files.map(f => readFileSync(f, 'utf8'))
}
const channels = (): string[] => sources().flatMap(s => [...s.matchAll(/ipcMain\.handle\('([A-Za-z]+:[A-Za-z]+)'/g)].map(m => m[1]!))

test('IPC 채널이 겹치지 않는다', () => {
  const all = channels()
  assert.deepEqual(all.filter((c, i) => all.indexOf(c) !== i), [])
})

test('IPC 채널 94개가 그대로 있다', () => {
  assert.deepEqual([...channels()].sort(), EXPECTED)
})

test('preload 가 부르는 채널은 모두 등록돼 있다', () => {
  const have = new Set(channels())
  const pre = readFileSync(join(main, '..', 'preload', 'index.ts'), 'utf8')
  const used = [...pre.matchAll(/invoke\('([A-Za-z]+:[A-Za-z]+)'/g)].map(m => m[1]!)
  assert.deepEqual(used.filter(c => !have.has(c)), [])
})
