#!/usr/bin/env node
// 지식사전 목차(INDEX.md) 만들기 — Inkline 앱의 src/shared/knowledge.ts(parseItem · buildIndex)와 같은 규칙. 외부 패키지 없음.
// 쓰는 법: node ~/.claude/skills/knowledge/index.mjs [지식사전 폴더]   (기본 ~/My-History/knowledge)
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KINDS = ['논문', '메타분석', '지침', '사례', '책', '문서', '기사']
const KEYS = ['종류', '출처', '주소', '원문', '태그', '요약', '추가']

export function parseItem(category, slug, text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  let title = ''
  const kv = {}
  let inSec = false
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('## ')) { inSec = true; continue }
    if (inSec) continue
    if (!title && line.startsWith('# ')) { title = line.slice(2).trim(); continue }
    const m = /^-\s*([^:：]+?)\s*[:：]\s*(.*)$/.exec(line)
    if (m && KEYS.includes(m[1]) && !(m[1] in kv)) kv[m[1]] = m[2].trim()
  }
  const kind = KINDS.includes(kv['종류']) ? kv['종류'] : ''
  const source = kv['출처'] ?? ''
  const summary = kv['요약'] ?? ''
  const error = !title ? '제목 없음' : !kind ? '종류 없음' : !source ? '출처 없음' : !summary ? '요약 없음' : null
  const tags = (kv['태그'] ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  return { category, slug, title, kind, source, url: kv['주소'] ?? '', tags, summary, error }
}

const cell = (s) =>
  s.replace(/[\r\n\u2028\u2029]+/g, ' ').trim().replace(/(\\*)\|/g, (_, b) => b + b + '\\|').replace(/\\$/, '\\\\')

export function buildIndex(items) {
  const cats = new Map()
  for (const i of items) cats.set(i.category, [...(cats.get(i.category) ?? []), i])
  const names = [...cats.keys()].sort((a, b) => a.localeCompare(b, 'ko'))
  const out = [
    '# 지식사전 목차',
    '',
    '이 파일은 자동으로 만든다 — 항목 파일을 고치고 `node ~/.claude/skills/knowledge/index.mjs` 를 돌린다 (앱은 저장할 때 다시 만든다).',
    '',
    `전체 ${items.length}개${names.map((c) => ` · ${c} ${cats.get(c).length}`).join('')}`,
  ]
  for (const c of names) {
    out.push('', `## ${c}`, '| 제목 | 종류 | 태그 | 요약 | 파일 |', '| --- | --- | --- | --- | --- |')
    for (const i of [...cats.get(c)].sort((a, b) => a.title.localeCompare(b.title, 'ko')))
      out.push(`| ${cell(i.title)} | ${i.error ? '형식 오류' : cell(i.kind)} | ${cell(i.tags.join(', '))} | ${cell(i.summary)} | ${cell(`${i.category}/${i.slug}.md`)} |`)
  }
  return out.join('\n') + '\n'
}

// eslint-disable-next-line no-control-regex
const validName = (n) => typeof n === 'string' && n.length >= 1 && n.length <= 80 && n === n.trim() && !n.startsWith('.') && !/[/\\:\u0000-\u001f\u007f]/.test(n)

export function loadItems(dir) {
  if (!existsSync(dir)) return []
  const items = []
  const skipped = []
  for (const cat of readdirSync(dir)) {
    const cdir = join(dir, cat)
    if (cat.startsWith('.') || cat === 'INDEX.md') continue
    // 앱(src/main/knowledge.ts)과 같은 규칙: 이름 규칙 · 진짜 폴더(링크 아님)만
    if (!validName(cat) || !lstatSync(cdir).isDirectory()) { skipped.push(cat); continue }
    for (const f of readdirSync(cdir)) {
      if (f.startsWith('.') || !f.endsWith('.md') || f.endsWith('.tmp')) continue
      const slug = f.slice(0, -3)
      if (!validName(slug) || !lstatSync(join(cdir, f)).isFile()) { skipped.push(`${cat}/${f}`); continue }
      items.push(parseItem(cat, slug, readFileSync(join(cdir, f), 'utf8')))
    }
  }
  if (skipped.length) console.error(`건너뜀(이름 규칙 · 링크 · 폴더): ${skipped.join(', ')}`)
  return items
}

// codex · gemini 의 링크(~/.codex/skills/knowledge)로 실행해도 동작하게 실제 경로로 비교한다
const isMain = (() => { try { return realpathSync(process.argv[1] ?? '') === fileURLToPath(import.meta.url) } catch { return false } })()
if (isMain) {
  const dir = process.argv[2] ?? join(homedir(), 'My-History', 'knowledge')
  if (!existsSync(dir)) { console.error(`지식사전 폴더가 없습니다: ${dir}`); process.exit(1) }
  const items = loadItems(dir)
  const file = join(dir, 'INDEX.md')
  writeFileSync(`${file}.tmp`, buildIndex(items))
  renameSync(`${file}.tmp`, file)
  const bad = items.filter((i) => i.error)
  console.log(`INDEX.md — 항목 ${items.length}개${bad.length ? ` · 형식 오류 ${bad.length}개: ${bad.map((i) => `${i.category}/${i.slug}(${i.error})`).join(', ')}` : ''}`)
}
