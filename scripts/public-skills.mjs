// 공개용 스킬 만들기 — ~/.claude/skills 의 원본에서 개인 · 회사 기록을 빼고 저장소의 skills/ 에 쓴다.
// 원본은 그대로 두고(개인 자료와 함께 계속 쓴다) 지우기 · 바꾸기 규칙으로 공개용을 다시 만든다.
// 규칙(public-skills.rules.local.mjs)은 바꿀 원문에 개인 자료가 들어 있어 저장소에 없다 — 공개된 skills/ 를 그대로 쓰면 된다.
// 규칙의 원문이 원본에 없으면 멈춘다 — 원본 문구가 바뀌었는데 조용히 개인 자료가 새는 것을 막는다.
// 사용: node scripts/public-skills.mjs [원본 폴더]   (기본 ~/.claude/skills)
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = process.argv[2] || join(homedir(), '.claude', 'skills')
const OUT = join(ROOT, 'skills')
const SKILLS = ['work-history', 'knowledge', 'concept-shorts']

const RULES = join(ROOT, 'scripts', 'public-skills.rules.local.mjs')
if (!existsSync(RULES)) { console.error('규칙 파일이 없습니다(scripts/public-skills.rules.local.mjs) — 저장소의 skills/ 를 그대로 쓰세요'); process.exit(1) }
const { EXCLUDE, SECTIONS, GLOBAL, REPLACE, POST = {} } = await import(RULES)

const rel = p => relative(SRC, p).split(sep).join('/')
rmSync(OUT, { recursive: true, force: true })
for (const s of SKILLS) {
  if (!existsSync(join(SRC, s))) throw new Error(`원본 스킬이 없습니다: ${join(SRC, s)}`)
  cpSync(join(SRC, s), join(OUT, s), { recursive: true, filter: p => !EXCLUDE.some(r => r.test(rel(p))) })
}
// 저장소에 둔 공개용 예시(가짜 기록)를 얹는다
cpSync(join(ROOT, 'scripts', 'public-skills'), OUT, { recursive: true })

// 글 파일 전부에 전역 규칙을 먼저 건다 — 세 번째 칸이 있으면 그 경로 아래에만
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
for (const p of walk(OUT).filter(p => /\.(md|mjs|js|css|html|json|sh|py|jsx)$/.test(p))) {
  const r = relative(OUT, p).split(sep).join('/')
  const s = readFileSync(p, 'utf8'), n = GLOBAL.filter(([, , pre]) => !pre || r.startsWith(pre)).reduce((acc, [a, b]) => acc.split(a).join(b), s)
  if (n !== s) writeFileSync(p, n)
}
const edit = (f, fn) => { const p = join(OUT, f); writeFileSync(p, fn(readFileSync(p, 'utf8'))) }
for (const [f, heads] of Object.entries(SECTIONS)) edit(f, t => heads.reduce((acc, h) => {
  const i = acc.indexOf(h + '\n'); if (i < 0) throw new Error(`${f}: 구역이 없습니다 — ${h}`)
  const j = acc.indexOf('\n## ', i + h.length); return acc.slice(0, i) + (j < 0 ? '' : acc.slice(j + 1))
}, t))
for (const [f, pairs] of Object.entries(REPLACE)) edit(f, t => pairs.reduce((acc, [a, b]) => {
  if (!acc.includes(a)) throw new Error(`${f}: 바꿀 원문이 없습니다 — ${a.slice(0, 60)}`)
  return acc.split(a).join(b)
}, t))
// 글자 바꾸기로 안 되는 고침(JSON 그림 등)은 규칙 파일의 POST 가 맡는다
for (const [f, fn] of Object.entries(POST)) edit(f, fn)
console.log(`공개용 스킬을 만들었습니다: ${relative(ROOT, OUT)}/ (${SKILLS.join(', ')})`)
