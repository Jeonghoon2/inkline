// 기록 폴더(카테고리/YYYY-MM.md)를 읽어 그 폴더에 타임라인 페이지(index.html)를 만든다
// node build.mjs [--root <기록 폴더>]   기록 폴더: --root > MH_ROOT > ~/My-History. 화면 코드(template.html·src/)는 이 파일 옆에 있다
// 외부 패키지 없음. 기록 형식은 work-history 스킬의 SKILL.md
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConcepts, slug } from './concepts.mjs'

const APP = dirname(fileURLToPath(import.meta.url))
const at = process.argv.indexOf('--root')
const root = resolve(at > 0 ? process.argv[at + 1] : process.env.MH_ROOT ?? join(homedir(), 'My-History'))
const entries = []
for (const cat of readdirSync(root)) {
  const dir = join(root, cat)
  if (cat.startsWith('.') || cat === 'reports' || cat === 'resume' || cat === 'src' || cat === 'knowledge' || !statSync(dir).isDirectory()) continue
  for (const f of readdirSync(dir).filter(n => /^\d{4}-\d{2}\.md$/.test(n))) {
    let date = null
    let cur = null
    let sec = ''
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      const d = line.match(/^## (\d{4}-\d{2}-\d{2})/)
      if (d) { date = d[1]; continue }
      const h = line.match(/^### (.+)/)
      if (h && date) { cur = { category: cat, date, title: h[1].replace(/^[^—]+—\s*/, ''), type: '', tags: [], body: '', sections: {} }; sec = '수행 일지'; entries.push(cur); continue }
      if (!cur) continue
      const s = line.match(/^#### (.+)/)
      if (s) { sec = s[1].trim(); continue }
      if (/^#/.test(line)) { cur = null; continue }
      const b = line.match(/^- (종류|분류|내용):\s*(.*)/)
      if (b?.[1] === '종류') cur.type = b[2].trim()
      else if (b?.[1] === '내용') cur.body = b[2].trim()
      // 분류: '대분류 - 소분류' 를 쉼표로 여러 개
      else if (b) cur.tags = b[2].split(',').map(t => t.trim()).filter(Boolean).map(t => { const [major, ...rest] = t.split(' - '); return { major: major.trim(), minor: rest.join(' - ').trim() } })
      else cur.sections[sec] = (cur.sections[sec] ?? '') + line + '\n' // 상세 창의 '## 섹션' 본문
    }
  }
}
for (const e of entries) for (const k in e.sections) if (!(e.sections[k] = e.sections[k].trim())) delete e.sections[k]
entries.sort((a, b) => b.date.localeCompare(a.date))
const reports = (existsSync(join(root, 'reports')) ? readdirSync(join(root, 'reports')) : []).filter(n => n.endsWith('.md')).sort().reverse()
  .map(n => ({ name: n.replace(/\.md$/, ''), text: readFileSync(join(root, 'reports', n), 'utf8') }))

// 이력서 — 직접 고치는 resume.md 하나. 없으면 탭이 안내만 보인다
const resumePath = join(root, 'resume.md')
const resume = existsSync(resumePath) ? readFileSync(resumePath, 'utf8') : ''
// 직무별 이력서 — resume/<직무>.md (backend · frontend · data-engineer · ai-engineer …). 페이지가 '기본' 옆 직무 칩으로 바꿔 보인다
const roleDir = join(root, 'resume')
const roles = (existsSync(roleDir) ? readdirSync(roleDir) : []).filter(n => /^[a-z0-9-]+\.md$/.test(n)).sort()
  .map(n => ({ slug: n.replace(/\.md$/, ''), text: readFileSync(join(roleDir, n), 'utf8') }))

// 이력서 개발자 용어 검사 — 인사 담당자가 풀이 없이 못 읽는 말을 줄 번호와 함께 경고한다(RESUME-GUIDE.md '인사 담당자가 읽는 글').
// 고르는 말: 주소 경로(/partner/*), 내부 버전(V42 · v3 · 1.4.0), 커밋·MR 번호, `코드`, 파일 이름(.py · .tsx), 명령 옵션(--dry-run), 코드 이름(API_BASE_URL · yield_per · run())
// V1·V2 처럼 한 자리 판 이름은 화면 이름이라 두고, 회사·제품 이름은 사람이 본다
const JARGON = [
  ['주소 경로', /(?:^|[\s(])\/[a-z][\w*-]*(?:\/[\w*-]*)*/],
  ['내부 버전', /\b[vV](?:\d{2,}|\d+\.\d+(?:\.\d+)*)\b|\b\d+\.\d+\.\d+\b/],
  ['커밋·MR 번호', /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b|![0-9]+\b|#\d+\b/],
  ['코드 글자', /`[^`]*`?/],
  ['파일 이름', /[\w-]\.(?:py|tsx?|jsx|mjs|java|sql|ya?ml|json|sh|md|css|html)\b/], // .js 는 Node.js·xterm.js 같은 이름이라 뺀다
  ['명령 옵션', /(?:^|[\s(])--[a-z][\w-]*/],
  ['코드 이름', /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b[a-z][a-z0-9]*_[a-z0-9_]+\b|\b\w+\(\)/],
]
const jargon = [['resume.md', resume], ...roles.map(r => [`resume/${r.slug}.md`, r.text])].flatMap(([f, t]) => t.split('\n')
  .flatMap((l, i) => JARGON.flatMap(([k, re]) => { const m = l.match(re); return m ? [`  ${f}:${i + 1} ${k} '${m[0].trim()}'`] : [] })))
if (jargon.length) console.warn(`이력서 개발자 용어 ${jargon.length}곳 — 쉬운 말로 바꾼다(RESUME-GUIDE.md '인사 담당자가 읽는 글'):\n${jargon.join('\n')}`)

// 개념 사전 —기록의 '==글자|개념 이름==' 이 이 이름을 가리킨다. 쇼츠는 만들어 둔 것(shorts/<이름>.mp4)만 페이지에 알린다
const concepts = Object.fromEntries(Object.entries(parseConcepts(root)).map(([k, { why, qs, from }]) => [k, from ? { why, qs, from } : { why, qs }]))
const shorts = Object.fromEntries(Object.keys(concepts).filter(k => existsSync(join(root, 'shorts', `${slug(k)}.mp4`))).map(k => [k, statSync(join(root, 'shorts', `${slug(k)}.mp4`)).mtimeMs.toFixed(0)]))
// 후속 — 쇼츠 대본(shorts/<이름>.json)의 follow. 페이지가 영상 옆에 '다음 편'을 보여 준다
const follow = Object.fromEntries(Object.keys(shorts).flatMap(k => { try { const f = JSON.parse(readFileSync(join(root, 'shorts', `${slug(k)}.json`), 'utf8')).follow; return f?.length ? [[k, f]] : [] } catch { return [] } }))
const missing = new Set(entries.flatMap(e => [...[e.body, ...Object.values(e.sections)].join('\n').matchAll(/==([^=|]+?)(?:\|([^=]+?))?==/g)].map(m => (m[2] ?? m[1]).trim())).filter(k => !concepts[k]))
if (missing.size) console.warn(`concepts.md 에 없는 개념: ${[...missing].join(', ')}`)

// 화면 코드 — src/의 조각을 이 순서로 이어 붙여 index.html 한 파일에 넣는다(CSS는 뒤가 앞을 덮고, JS는 한 범위를 같이 쓴다)
const STYLES = ['base', 'timeline', 'reports', 'resume', 'shorts', 'motion']
const SCRIPTS = ['common', 'timeline', 'reports', 'resume', 'shorts', 'app']
const read = (dir, names, ext) => names.map(n => readFileSync(join(APP, 'src', dir, `${n}.${ext}`), 'utf8')).join('\n')

const data = JSON.stringify({ entries, reports, resume, roles, concepts, shorts, follow, built: new Date().toISOString() }).replace(/</g, '\\u003c')
// 바꿀 값은 함수로 넘긴다 — 문자열로 넘기면 코드·기록 속 '$&' 같은 글자가 치환 패턴으로 읽힌다
const html = readFileSync(join(APP, 'template.html'), 'utf8')
  .replace('/*__STYLES__*/', () => read('styles', STYLES, 'css'))
  .replace('/*__SCRIPTS__*/', () => read('scripts', SCRIPTS, 'js'))
  .replace('/*__DATA__*/null', () => data)
writeFileSync(join(root, 'index.html'), html)
console.log(`index.html — 기록 ${entries.length}건, 보고 ${reports.length}건, 이력서 ${resume ? '있음' : '없음'}${roles.length ? ` + 직무 ${roles.length}개` : ''}`)
