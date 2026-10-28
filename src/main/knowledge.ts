// 지식사전 저장소 — <historyRoot>/knowledge/<분류>/<slug>.md. electron 을 모른다(휴지통은 함수로 받는다).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { atomicCopy, atomicWrite } from './atomic.ts'
import { parseItem, serializeItem, slugify, uniqueSlug, validName, buildIndex, type KItem, type KnowledgeData } from '../shared/knowledge.ts'
import { t } from '../shared/i18n.ts'

export type { KnowledgeData }

export function itemPath(dir: string, category: string, slug: string): string {
  if (!validName(category) || !validName(slug)) throw new Error(t('잘못된 이름'))
  const root = path.resolve(dir)
  const p = path.resolve(root, category, `${slug}.md`)
  if (!p.startsWith(root + path.sep)) throw new Error(t('knowledge 밖 경로'))
  const cat = path.join(root, category)
  let st: fs.Stats | null = null
  try { st = fs.lstatSync(cat) } catch { /* 아직 없음 */ }
  if (st) {
    if (st.isSymbolicLink()) throw new Error(t('분류 폴더가 심볼릭 링크'))
    const real = fs.realpathSync(cat), base = fs.realpathSync(root)
    if (!real.startsWith(base + path.sep)) throw new Error(t('knowledge 밖 경로'))
  }
  return p
}

// 원문 PDF 는 항목과 같은 폴더의 <slug>.pdf. 분류 폴더 안전 검사는 itemPath 와 같다.
const pdfName = (f: string) => validName(f) && /\.pdf$/i.test(f)
function filePath(dir: string, category: string, file: string): string {
  if (!pdfName(file)) throw new Error(t('잘못된 파일 이름'))
  return path.join(path.dirname(itemPath(dir, category, 'x')), file)
}
const isFile = (p: string) => { try { return fs.lstatSync(p).isFile() } catch { return false } } // 심볼릭 링크는 따르지 않는다

export function loadKnowledge(dir: string): KnowledgeData {
  const items: KItem[] = []
  const categories: string[] = []
  if (!fs.existsSync(dir)) return { root: dir, exists: false, items, categories }
  for (const c of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!c.isDirectory() || !validName(c.name)) continue
    categories.push(c.name)
    for (const f of fs.readdirSync(path.join(dir, c.name), { withFileTypes: true })) {
      if (!f.isFile() || f.name.startsWith('.') || !f.name.endsWith('.md')) continue
      const slug = f.name.slice(0, -3)
      if (!validName(slug)) continue
      items.push(parseItem(c.name, slug, fs.readFileSync(path.join(dir, c.name, f.name), 'utf8')))
    }
  }
  items.sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title, 'ko'))
  categories.sort((a, b) => a.localeCompare(b, 'ko'))
  return { root: dir, exists: true, items, categories }
}

export async function writeIndex(dir: string): Promise<void> {
  await atomicWrite(path.join(dir, 'INDEX.md'), buildIndex(loadKnowledge(dir).items))
}

async function rmEmptyDir(dir: string, category: string) {
  try { await fsp.rmdir(path.join(dir, category)) } catch { /* 비어 있지 않거나 없음 */ }
}

export async function saveItem(dir: string, item: KItem, prev: { category: string; slug: string } | null, attach?: string): Promise<KItem> {
  const moved = !prev || prev.category !== item.category || prev.slug !== item.slug
  let slug = item.slug
  if (!prev || moved) {
    itemPath(dir, item.category, 'x') // 분류 이름 검사
    // macOS 는 대소문자 · 유니코드 정규형을 구분하지 않으므로 비교는 정규화해서. 자기 자신(대소문자만 바뀐 이동)은 충돌로 보지 않는다.
    const n = (s: string) => s.normalize('NFC').toLowerCase()
    const self = prev && prev.category === item.category ? n(prev.slug) : null
    const taken = new Set(loadKnowledge(dir).items.filter((i) => i.category === item.category && n(i.slug) !== self).map((i) => n(i.slug)))
    slug = uniqueSlug(prev ? item.slug || slugify(item.title) : slugify(item.title), { has: (s: string) => taken.has(n(s)) } as Set<string>)
  }
  const out = { ...item, slug }
  let oldPdf: string | null = null // 옮긴 뒤 지울 옛 PDF
  if (item.file && !pdfName(item.file)) out.file = undefined
  if (attach) {
    if (!path.isAbsolute(attach) || !/\.pdf$/i.test(attach) || !isFile(attach)) throw new Error(t('잘못된 PDF 파일'))
    if (prev && item.file && pdfName(item.file)) oldPdf = filePath(dir, prev.category, item.file)
    out.file = `${slug}.pdf`
    await atomicCopy(attach, filePath(dir, out.category, out.file))
  } else if (prev && moved && out.file) {
    const from = filePath(dir, prev.category, out.file)
    if (isFile(from)) {
      oldPdf = from
      out.file = `${slug}.pdf`
      await atomicCopy(from, filePath(dir, out.category, out.file))
    } else out.file = undefined
  }
  if (prev) { // 앱은 '쓴 곳'을 고치지 않는다 — AI 도구가 덧붙인 줄을 지우지 않게 디스크의 것을 쓴다
    try { out.uses = parseItem(prev.category, prev.slug, await fsp.readFile(itemPath(dir, prev.category, prev.slug), 'utf8')).uses } catch { /* 파일이 없으면 받은 값 */ }
  }
  await atomicWrite(itemPath(dir, out.category, out.slug), serializeItem(out))
  if (prev && moved) {
    const oldP = itemPath(dir, prev.category, prev.slug)
    const [a, b] = await Promise.all([fsp.stat(oldP).catch(() => null), fsp.stat(itemPath(dir, out.category, out.slug))])
    if (a && !(a.ino === b.ino && a.dev === b.dev)) await fsp.rm(oldP, { force: true }) // 같은 파일(대소문자만 다른 이름)이면 지우지 않는다
    if (prev.category !== out.category) await rmEmptyDir(dir, prev.category)
  }
  if (oldPdf && out.file) {
    const np = filePath(dir, out.category, out.file)
    const [a, b] = await Promise.all([fsp.stat(oldPdf).catch(() => null), fsp.stat(np).catch(() => null)])
    if (a && !(b && a.ino === b.ino && a.dev === b.dev)) await fsp.rm(oldPdf, { force: true })
  }
  await writeIndex(dir)
  return out
}

export async function removeItem(dir: string, category: string, slug: string, trash: (p: string) => Promise<void>): Promise<void> {
  const p = itemPath(dir, category, slug)
  let file = ''
  try { file = parseItem(category, slug, await fsp.readFile(p, 'utf8')).file ?? '' } catch { /* 읽지 못하면 md 만 */ }
  await trash(p)
  if (pdfName(file)) { const f = filePath(dir, category, file); if (isFile(f)) await trash(f) }
  await rmEmptyDir(dir, category)
  await writeIndex(dir)
}
