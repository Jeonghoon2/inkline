import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { ensureHistory, installSkills, GLOBAL_RULES } from '../src/main/skills.ts'

test('없는 스킬만 깔고 Codex 링크를 만든다', () => {
  const root = mkdtempSync(join(tmpdir(), 'inkline-skills-'))
  const src = join(root, 'src'), home = join(root, 'home')
  mkdirSync(join(src, 'work-history'), { recursive: true })
  mkdirSync(join(src, 'knowledge'), { recursive: true })
  writeFileSync(join(src, 'work-history', 'SKILL.md'), 'new')
  writeFileSync(join(src, 'knowledge', 'SKILL.md'), 'new')
  mkdirSync(join(home, '.claude', 'skills', 'knowledge'), { recursive: true })
  writeFileSync(join(home, '.claude', 'skills', 'knowledge', 'SKILL.md'), 'mine')
  mkdirSync(join(home, '.codex'))
  installSkills(src, home)
  assert.equal(readFileSync(join(home, '.claude', 'skills', 'work-history', 'SKILL.md'), 'utf8'), 'new')
  assert.equal(readFileSync(join(home, '.claude', 'skills', 'knowledge', 'SKILL.md'), 'utf8'), 'mine')
  assert.equal(realpathSync(join(home, '.codex', 'skills', 'work-history')), realpathSync(join(home, '.claude', 'skills', 'work-history')))
  assert.equal(existsSync(join(home, '.gemini')), false)
  installSkills(src, home) // 두 번 켜도 그대로
})

test('전역 지침은 없을 때만 덧붙이고, 사용자가 쓴 지침은 그대로 둔다', () => {
  const root = mkdtempSync(join(tmpdir(), 'inkline-rules-'))
  const src = join(root, 'src'), home = join(root, 'home')
  mkdirSync(join(src, 'work-history'), { recursive: true })
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'AGENTS.md'), '# 내 지침\n- 테스트 먼저')
  mkdirSync(join(home, '.gemini'), { recursive: true })
  writeFileSync(join(home, '.gemini', 'GEMINI.md'), '- work-history 는 내 방식대로')
  installSkills(src, home)
  installSkills(src, home) // 두 번 켜도 한 번만
  assert.equal(readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8'), `# 전역 지침\n\n${GLOBAL_RULES}`)
  assert.equal(readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf8'), `# 내 지침\n- 테스트 먼저\n\n${GLOBAL_RULES}`)
  assert.equal(readFileSync(join(home, '.gemini', 'GEMINI.md'), 'utf8'), '- work-history 는 내 방식대로')
})

test('기록 폴더가 없으면 깔아 둔 work-history 로 뼈대를 만들고, 있으면 건드리지 않는다', { skip: !existsSync(join(homedir(), '.claude', 'skills', 'work-history', 'site', 'init.mjs')) }, () => {
  const home = mkdtempSync(join(tmpdir(), 'inkline-hist-'))
  cpSync(join(homedir(), '.claude', 'skills', 'work-history'), join(home, '.claude', 'skills', 'work-history'), { recursive: true })
  const root = join(home, 'My-History')
  ensureHistory(root, home)
  for (const f of ['README.md', 'concepts.md', 'reports', 'build.mjs', 'index.html']) assert.ok(existsSync(join(root, f)), f)
  writeFileSync(join(root, 'concepts.md'), 'mine')
  ensureHistory(root, home)
  assert.equal(readFileSync(join(root, 'concepts.md'), 'utf8'), 'mine')
  ensureHistory(join(home, '없는 스킬'), join(home, 'nobody')) // 스킬이 없으면 조용히 넘어간다
  assert.ok(!existsSync(join(home, '없는 스킬')))
})

test('앱이 깐 스킬은 새 앱의 것으로 바꾸되 rules.json · Knowledge 는 두고, 표 없는 스킬은 건드리지 않는다', () => {
  const root = mkdtempSync(join(tmpdir(), 'inkline-upd-'))
  const src = join(root, 'src'), home = join(root, 'home'), sk = join(home, '.claude', 'skills')
  for (const n of ['work-history', 'knowledge']) {
    mkdirSync(join(src, n, 'Knowledge'), { recursive: true })
    writeFileSync(join(src, n, 'SKILL.md'), 'v2'); writeFileSync(join(src, n, 'rules.json'), '{"새":1}')
    writeFileSync(join(src, n, 'Knowledge', 'a.md'), '새 자료'); writeFileSync(join(src, n, '.inkline-bundle'), '2')
    mkdirSync(join(sk, n, 'Knowledge'), { recursive: true })
    writeFileSync(join(sk, n, 'SKILL.md'), 'v1'); writeFileSync(join(sk, n, 'rules.json'), '{"내":1}')
    writeFileSync(join(sk, n, 'Knowledge', 'a.md'), '내 자료')
  }
  writeFileSync(join(sk, 'work-history', '.inkline-bundle'), '1') // 앱이 깐 것 — knowledge 는 사용자가 만든 것
  installSkills(src, home)
  const r = (n: string, f: string): string => readFileSync(join(sk, n, f), 'utf8')
  assert.deepEqual([r('work-history', 'SKILL.md'), r('work-history', 'rules.json'), r('work-history', 'Knowledge/a.md'), r('work-history', '.inkline-bundle')], ['v2', '{"내":1}', '내 자료', '2'])
  assert.deepEqual([r('knowledge', 'SKILL.md'), r('knowledge', 'rules.json')], ['v1', '{"내":1}'])
})

test('스킬만 고르면 전역 지침 파일은 건드리지 않는다', () => {
  const src = mkdtempSync(join(tmpdir(), 'sk-src-')), home = mkdtempSync(join(tmpdir(), 'sk-home-'))
  mkdirSync(join(src, 'work-history')); writeFileSync(join(src, 'work-history', 'SKILL.md'), 'x')
  installSkills(src, home, false)
  assert.equal(existsSync(join(home, '.claude', 'skills', 'work-history', 'SKILL.md')), true)
  assert.equal(existsSync(join(home, '.claude', 'CLAUDE.md')), false)
})
