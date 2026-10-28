import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIndex, parseItem, serializeItem, type KItem } from '../src/shared/knowledge.ts'

// knowledge 스킬의 index.mjs(Claude · Codex · Gemini 가 쓰는 쪽)가 앱과 같은 목차를 만드는지 — 스킬이 없는 컴퓨터에서는 건너뛴다
const SKILL = join(homedir(), '.claude', 'skills', 'knowledge', 'index.mjs')

test('스킬 index.mjs 와 앱 buildIndex 가 같은 목차', { skip: !existsSync(SKILL) }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kskill-'))
  const base: KItem = { category: '', slug: '', title: '', kind: '논문', source: '저자 · 2009', url: '', tags: [], summary: '요약', added: '2026-10-19', by: 'Claude', points: '', uses: '', memo: '', error: null }
  const items: KItem[] = [
    { ...base, category: '학습 과학', slug: 'pretesting', title: 'Pretesting effect', tags: ['먼저 묻기'] },
    { ...base, category: '학습 과학', slug: 'a-pipe', title: 'A | pipe', summary: '줄\n바꿈 | 표' },
    { ...base, category: 'LLM · 프롬프트', slug: 'broken', title: '형식 오류 항목', kind: '' }
  ]
  for (const i of items) {
    await mkdir(join(dir, i.category), { recursive: true })
    await writeFile(join(dir, i.category, `${i.slug}.md`), serializeItem(i))
  }
  execFileSync(process.execPath, [SKILL, dir])
  const fromSkill = await readFile(join(dir, 'INDEX.md'), 'utf8')
  const parsed = items.map(i => parseItem(i.category, i.slug, serializeItem(i)))
  assert.equal(fromSkill, buildIndex(parsed))
})
