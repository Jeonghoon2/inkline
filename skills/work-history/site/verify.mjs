// 스킬만으로 My-History 가 다시 만들어지는지 검증 — node verify.mjs [원본 기록 폴더] [--full]
// 임시 HOME 은 운영체제 임시 폴더(TMPDIR) 아래에 만들고, 통과하면 지운다. 서버는 빈 포트에 잠깐 띄운다
// 빈 임시 HOME 에 스킬 두 개(work-history·concept-shorts)와 원본의 '데이터'만 옮기고, 스킬에 적힌 명령으로 다시 만들어 원본과 비교한다
// --full: 쇼츠 엔진 설치(setup.sh, Windows 는 setup.mjs)와 쇼츠 한 편 다시 녹화·프레임 비교까지(몇 분, 내려받기 있음). Claude 는 부르지 않는다
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = dirname(fileURLToPath(import.meta.url))
const SKILLS = dirname(dirname(APP))
const args = process.argv.slice(2)
const full = args.includes('--full')
const src = resolve(args.find(a => !a.startsWith('--')) ?? join(homedir(), 'My-History'))
const tmp = mkdtempSync(join(tmpdir(), 'mh-verify-'))
const H = join(tmp, 'home'), dst = join(H, 'My-History')
const WIN = process.platform === 'win32'
// Windows 의 node 는 홈을 HOME 이 아니라 USERPROFILE 에서 읽는다
const env = { ...process.env, HOME: H, ...(WIN && { USERPROFILE: H }), MH_ROOT: '', SHORTS_ROOT: '', SHORTS_WHISPER_PY: '' }
delete env.MH_ROOT; delete env.SHORTS_ROOT; delete env.SHORTS_WHISPER_PY
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`) }

// 1) 스킬만 — node_modules 는 빼고(받는 사람도 setup.sh 로 다시 깐다)
for (const s of ['work-history', 'concept-shorts'])
  cpSync(join(SKILLS, s), join(H, '.claude/skills', s), { recursive: true, dereference: true, filter: p => !p.includes(`${sep}node_modules`) })

// 2) 데이터만 — 이 목록에 없는 원본 파일은 '데이터 아님'으로 알린다(코드가 아직 원본에 남았는지 본다)
const isData = rel => /^[^/]+\/\d{4}-\d{2}\.md$/.test(rel) || ['concepts.md', 'resume.md', 'README.md'].includes(rel) ||
  /^reports\/[^/]+\.md$/.test(rel) || /^resume\/[^/]+\.md$/.test(rel) || /^shorts\/[^/]+\.(mp4|json)$/.test(rel)
const generated = new Set(['index.html', 'build.mjs', 'serve.mjs']) // init 이 만드는 것
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return n.startsWith('.') || n === 'node_modules' ? [] : statSync(p).isDirectory() ? walk(p) : [p] })
const extra = []
for (const p of walk(src)) {
  const rel = relative(src, p).split(sep).join('/') // 아래 규칙은 '/' 로 쓴다(Windows 는 '\\')
  if (isData(rel)) { mkdirSync(dirname(join(dst, rel)), { recursive: true }); cpSync(p, join(dst, rel), { preserveTimestamps: true }) }
  else if (!generated.has(rel) && !/^shorts\/.+\.(log|qa\.json)$/.test(rel)) extra.push(rel)
}
const code = extra.filter(r => /\.(mjs|js|css|html)$/.test(r) || /^(src|mockups)\//.test(r) || ['DESIGN.md', 'RESUME-GUIDE.md'].includes(r))
check('원본 폴더에 코드가 남지 않음', !code.length, code.length ? code.join(', ') : `데이터 아닌 다른 파일 ${extra.length}개는 사이트와 무관(${extra.join(', ') || '없음'})`)
const entries = readFileSync(join(src, 'build.mjs'), 'utf8')
check('원본의 build.mjs 가 스킬을 부르는 진입 파일', /site\/init\.mjs 가 만든다/.test(entries))

// 3) 스킬의 명령으로 만든다
const node = (a, opts = {}) => execFileSync('node', a, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
try { console.log('  ' + node([join(H, '.claude/skills/work-history/site/init.mjs'), dst]).trim().split('\n').join('\n  ')); check('init.mjs 로 기록 폴더 만들기', true) }
catch (e) { check('init.mjs 로 기록 폴더 만들기', false, e.stderr?.slice(-300)) }
const norm = t => t.replace(/"built":"[^"]+"/, '"built":""')
const a = norm(readFileSync(join(src, 'index.html'), 'utf8')), b = existsSync(join(dst, 'index.html')) ? norm(readFileSync(join(dst, 'index.html'), 'utf8')) : ''
let at = 0; while (at < a.length && a[at] === b[at]) at++
check('index.html 이 원본과 같음(만든 시각 빼고)', a === b, a === b ? `${a.length.toLocaleString()}자` : `${at}번째 글자부터 다름: 원본 "${a.slice(at, at + 60)}" / 새것 "${b.slice(at, at + 60)}"`)
check('진입 파일이 임시 HOME 의 스킬을 가리킴', readFileSync(join(dst, 'build.mjs'), 'utf8').includes(H))

// 4) 서버 — 페이지·쇼츠 목록·영상 넘겨 보기·잘못된 요청 막기
// 빈 포트를 운영체제에게 받는다 — 정한 번호를 쓰면 켜 둔 서버와 부딪혔다
const PORT = await new Promise(r => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
const srv = spawn('node', [join(dst, 'serve.mjs')], { env: { ...env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; srv.stdout.on('data', d => { log += d }); srv.stderr.on('data', d => { log += d })
try {
  for (let i = 0; i < 50 && !log.includes('http://'); i++) await new Promise(r => setTimeout(r, 100))
  const get = (p, h = {}) => fetch(`http://127.0.0.1:${PORT}${p}`, { headers: { host: `localhost:${PORT}`, ...h } })
  const page = await get('/'); check('서버: 페이지', page.status === 200 && norm(await page.text()) === b)
  const api = await (await get('/api/shorts')).json()
  const want = readdirSync(join(src, 'shorts')).filter(n => n.endsWith('.mp4')).length
  check('서버: 쇼츠 목록', Object.keys(api.have).length === want, `${Object.keys(api.have).length}/${want}편`)
  const mp4 = readdirSync(join(dst, 'shorts')).find(n => n.endsWith('.mp4'))
  if (mp4) { const r = await get(`/shorts/${encodeURIComponent(mp4)}`, { range: 'bytes=0-99' }); check('서버: 영상 넘겨 보기(Range)', r.status === 206) }
  const bad = await fetch(`http://127.0.0.1:${PORT}/api/shorts?name=x`, { method: 'POST', headers: { host: `localhost:${PORT}`, origin: 'http://evil.test' } })
  check('서버: 다른 사이트의 만들기 요청 막기', bad.status === 403)
  check('서버: 쇼츠 엔진 읽힘', !log.includes('쇼츠 만들기 꺼짐'), log.trim().split('\n')[0])
} finally { srv.kill() }

// 4-1) 사전 읽기 두 벌이 같은지 — 다르면 쇼츠 파일 이름이 페이지와 어긋날 수 있다
const ce = join(H, '.claude/skills/concept-shorts/engine/concepts.mjs'), cs = join(H, '.claude/skills/work-history/site/concepts.mjs')
const body = f => readFileSync(f, 'utf8').split('\n').slice(1).join('\n') // 첫 줄(설명)만 다르다
check('concepts.mjs 두 벌(원본 concept-shorts/engine, 복사 work-history/site)이 같음', existsSync(ce) && body(ce) === body(cs))

// 5) 스킬 문서가 옛 위치·내 컴퓨터 경로를 가리키지 않는지
const stale = []
for (const p of walk(join(H, '.claude/skills'))) {
  if (!/\.(md|mjs|js|sh|py|html)$/.test(p)) continue
  const t = readFileSync(p, 'utf8'), rel = relative(join(H, '.claude/skills'), p)
  for (const m of t.matchAll(/~\/My-History\/(template\.html|src\/|DESIGN\.md|RESUME-GUIDE\.md|mockups|shorts\.mjs|shorts-qa\.mjs|concepts\.mjs|package\.json)|\/Users\/[a-z]+/g)) stale.push(`${rel}: ${m[0]}`)
}
check('스킬 문서에 옛 코드 위치·내 경로 없음', !stale.length, stale.slice(0, 8).join(' | '))

// 6) --full: 쇼츠 엔진 설치 → 원본 쇼츠 한 편을 대본 그대로 다시 녹화해 프레임 비교
if (full) {
  const E = join(H, '.claude/skills/concept-shorts/engine')
  // Windows 에는 sh 가 없을 수 있어 같은 일을 하는 setup.mjs 로
  const [cmd, setup] = WIN ? [process.execPath, 'setup.mjs'] : ['sh', 'setup.sh']
  try { execFileSync(cmd, [join(E, setup)], { env, stdio: 'ignore' }); check(`쇼츠: ${setup}`, true) } catch { check(`쇼츠: ${setup}`, false) }
  const name = '나눠 읽기(스트리밍)', file = '나눠_읽기(스트리밍)'
  if (existsSync(join(dst, 'shorts', `${file}.json`))) {
    try {
      const before = statSync(join(dst, 'shorts', `${file}.mp4`)).mtimeMs
      node([join(E, 'shorts.mjs'), name, '--render', '--root', dst], { timeout: 600000 })
      // 정말 다시 녹화했는지 — 경로 비교가 어긋나 아무것도 안 하고 0 으로 끝난 적이 있다(2026-10-13)
      const ran = statSync(join(dst, 'shorts', `${file}.mp4`)).mtimeMs > before && /완료/.test(readFileSync(join(dst, 'shorts', `${file}.log`), 'utf8'))
      check('쇼츠: 다시 녹화가 실제로 돌았음', ran)
      const md5 = f => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').pop().trim())
      const x = md5(join(src, 'shorts', `${file}.mp4`)), y = md5(join(dst, 'shorts', `${file}.mp4`))
      const diff = x.filter((v, i) => v !== y[i]).length
      check('쇼츠: 대본 그대로 다시 녹화하면 같은 영상', x.length === y.length && !diff, `프레임·소리 묶음 ${x.length}개 중 다름 ${diff}`)
      check('쇼츠: 새로 만든 뒤 페이지도 다시 만들어짐', statSync(join(dst, 'index.html')).mtimeMs > statSync(join(dst, 'shorts', `${file}.mp4`)).mtimeMs - 5000)
    } catch (e) { check('쇼츠: 다시 녹화', false, (e.stderr ?? e.message).slice(-300)) }
  }
}

const failed = results.filter(r => !r.ok)
console.log(failed.length ? `결과: ${failed.length}개 실패 (임시 폴더 남김: ${tmp})` : `결과: 모두 통과 ${results.length}개`)
if (!failed.length) rmSync(tmp, { recursive: true, force: true })
process.exit(failed.length ? 1 : 0)
