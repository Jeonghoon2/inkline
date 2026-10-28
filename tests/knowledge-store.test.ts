import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadKnowledge, saveItem, removeItem, itemPath } from '../src/main/knowledge.ts'
import type { KItem } from '../src/shared/knowledge.ts'

const mk = (o: Partial<KItem> = {}): KItem => ({
  category: '논문', slug: '', title: '제목', kind: '논문', source: '출처', url: '', tags: [], summary: '요약',
  added: '2026-10-19', by: '', points: '', uses: '', memo: '', error: null, ...o,
})
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kn-')), 'knowledge')

test('없는 폴더', () => {
  const d = loadKnowledge(tmp())
  assert.equal(d.exists, false); assert.deepEqual(d.items, [])
})

test('저장 · slug -2 · INDEX 는 항목 아님', async () => {
  const dir = tmp()
  const a = await saveItem(dir, mk(), null)
  const b = await saveItem(dir, mk(), null)
  assert.equal(a.slug, '제목'); assert.equal(b.slug, '제목-2')
  assert.ok(fs.existsSync(path.join(dir, '논문', '제목.md')))
  assert.ok(fs.existsSync(path.join(dir, 'INDEX.md')))
  assert.ok(!fs.existsSync(path.join(dir, '논문', '제목.md.tmp')))
  fs.writeFileSync(path.join(dir, '.hidden.md'), '# x')
  fs.writeFileSync(path.join(dir, '논문', 'note.txt'), 'x')
  const d = loadKnowledge(dir)
  assert.equal(d.exists, true); assert.equal(d.items.length, 2); assert.deepEqual(d.categories, ['논문'])
})

test('분류 옮기기', async () => {
  const dir = tmp()
  const a = await saveItem(dir, mk(), null)
  const m = await saveItem(dir, { ...a, category: '책' }, { category: a.category, slug: a.slug })
  assert.equal(m.category, '책')
  assert.ok(!fs.existsSync(path.join(dir, '논문')))
  assert.ok(fs.existsSync(path.join(dir, '책', '제목.md')))
  const same = await saveItem(dir, { ...m, summary: '바뀜' }, { category: '책', slug: m.slug })
  assert.equal(same.slug, '제목'); assert.equal(loadKnowledge(dir).items[0].summary, '바뀜')
})

test('삭제', async () => {
  const dir = tmp()
  const a = await saveItem(dir, mk(), null)
  const got: string[] = []
  await removeItem(dir, a.category, a.slug, async (p) => { got.push(p); fs.rmSync(p) })
  assert.deepEqual(got, [path.join(dir, '논문', '제목.md')])
  assert.ok(!fs.existsSync(path.join(dir, '논문')))
  assert.ok(!fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf8').includes('제목.md'))
})

test('itemPath 탈출 거부', () => {
  const dir = tmp()
  assert.throws(() => itemPath(dir, '..', 'x'))
  assert.throws(() => itemPath(dir, 'a', '../b'))
  assert.ok(itemPath(dir, 'a', 'b').startsWith(dir))
})

test('심볼릭 링크 분류는 거부', async () => {
  const dir = tmp()
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'))
  fs.mkdirSync(dir, { recursive: true })
  fs.symlinkSync(out, path.join(dir, '논문'))
  await assert.rejects(saveItem(dir, mk(), null))
  await assert.rejects(removeItem(dir, '논문', 'x', async () => {}))
  assert.deepEqual(fs.readdirSync(out), [])
})

test('대소문자만 바뀐 이동은 데이터를 지키고, 겹치면 -2', async () => {
  const dir = tmp()
  const a = await saveItem(dir, mk({ slug: 'x', title: 'Foo' }), null)
  assert.equal(a.slug, 'foo')
  const up = await saveItem(dir, { ...a, slug: 'Foo' }, { category: a.category, slug: a.slug })
  assert.equal(up.slug, 'Foo')
  assert.equal(loadKnowledge(dir).items.length, 1)
  const b = await saveItem(dir, mk({ title: 'Bar' }), null)
  const c = await saveItem(dir, { ...b, slug: 'FOO' }, { category: b.category, slug: b.slug })
  assert.equal(c.slug, 'FOO-2')
  assert.equal(loadKnowledge(dir).items.length, 2)
})

test('없는 prev 는 새 저장처럼, 남은 항목이 있으면 분류 폴더 유지', async () => {
  const dir = tmp()
  const a = await saveItem(dir, mk(), { category: '논문', slug: 'ghost' })
  assert.equal(loadKnowledge(dir).items.length, 1)
  const b = await saveItem(dir, mk(), null)
  await removeItem(dir, a.category, a.slug, async (p) => { fs.rmSync(p) })
  assert.ok(fs.existsSync(path.join(dir, '논문')))
  assert.equal(loadKnowledge(dir).items[0].slug, b.slug)
})

test('앱 저장은 AI 가 덧붙인 쓴 곳 줄을 지우지 않는다', async () => {
  const dir = tmp()
  const a = await saveItem(dir, mk(), null)
  const f = path.join(dir, '논문', `${a.slug}.md`)
  fs.appendFileSync(f, '\n## 우리 작업에 쓴 곳\n- AI 가 덧붙임\n')
  await saveItem(dir, { ...a, summary: '바뀐 요약' }, { category: a.category, slug: a.slug })
  const t = fs.readFileSync(f, 'utf8')
  assert.match(t, /AI 가 덧붙임/); assert.match(t, /바뀐 요약/)
})

test('PDF: attach · 옮길 때 같이 · 지울 때 같이', async () => {
  const dir = tmp()
  const src = path.join(path.dirname(dir), 'inkline-knowledge-x.pdf')
  fs.writeFileSync(src, '%PDF-fake')
  const a = await saveItem(dir, mk({ title: 'Pre Test' }), null, src)
  assert.equal(a.file, 'pre-test.pdf')
  assert.equal(fs.readFileSync(path.join(dir, '논문', 'pre-test.pdf'), 'utf8'), '%PDF-fake')
  assert.match(fs.readFileSync(itemPath(dir, '논문', 'pre-test'), 'utf8'), /- 원문: pre-test\.pdf/)
  assert.equal(loadKnowledge(dir).items[0].file, 'pre-test.pdf')
  assert.ok(!fs.existsSync(`${path.join(dir, '논문', 'pre-test.pdf')}.tmp`))
  // 분류 · 이름이 바뀌면 PDF 도 옮겨진다
  const b = await saveItem(dir, { ...a, category: '설계', slug: 'renamed' }, { category: '논문', slug: 'pre-test' })
  assert.equal(b.file, 'renamed.pdf')
  assert.ok(fs.existsSync(path.join(dir, '설계', 'renamed.pdf')))
  assert.ok(!fs.existsSync(path.join(dir, '논문', 'pre-test.pdf')))
  // 그냥 고치기는 PDF 를 건드리지 않는다
  const c = await saveItem(dir, { ...b, title: '바뀜' }, { category: '설계', slug: 'renamed' })
  assert.equal(c.file, 'renamed.pdf')
  // 지우면 md 와 PDF 둘 다 휴지통으로
  const got: string[] = []
  await removeItem(dir, '설계', 'renamed', async (p) => { got.push(path.basename(p)); fs.rmSync(p) })
  assert.deepEqual(got.sort(), ['renamed.md', 'renamed.pdf'])
  // 위험한 attach 는 거부
  await assert.rejects(saveItem(dir, mk({ title: 'z' }), null, '/etc/hosts'))
})
