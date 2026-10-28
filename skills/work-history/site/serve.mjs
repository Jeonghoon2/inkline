// 타임라인 페이지를 http://localhost:4173 으로 열고, 페이지의 '쇼츠 만들기' 요청을 받아 쇼츠 스킬(concept-shorts)의 엔진으로 만든다
// node serve.mjs [--root <기록 폴더>]   — 내 컴퓨터(127.0.0.1)에서만 받는다. 기록 폴더: --root > MH_ROOT > ~/My-History
// 쇼츠 스킬이 없거나 설치(engine/setup.sh) 전이면 페이지만 열고 '만들기'는 이유를 돌려준다
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseConcepts, slug } from './concepts.mjs'

const at = process.argv.indexOf('--root')
const root = resolve(at > 0 ? process.argv[at + 1] : process.env.MH_ROOT ?? join(homedir(), 'My-History'))
// 쇼츠 엔진 — 이 스킬 옆(같은 skills 폴더)의 concept-shorts 를 먼저, 없으면 ~/.claude/skills
const ENGINE = [join(dirname(fileURLToPath(import.meta.url)), '../../concept-shorts/engine/shorts.mjs'), join(homedir(), '.claude/skills/concept-shorts/engine/shorts.mjs')].find(existsSync)
let engine = null, engineError = '쇼츠 스킬(concept-shorts)이 없다'
if (ENGINE) try { engine = await import(pathToFileURL(ENGINE).href); engine.useRoot(root) } catch (e) { engineError = `쇼츠 엔진을 못 읽었다(${e.message.slice(0, 80)}) — concept-shorts/engine/setup.sh 먼저` }

const PORT = +(process.env.PORT ?? 4173)
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`])
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json; charset=utf-8', mp4: 'video/mp4' }
const jobs = {} // 개념 이름 → { state: queued|running|done|failed, step, progress, error }
let queue = Promise.resolve() // ponytail: 한 번에 하나씩 — 쇼츠 하나가 Chrome·ffmpeg 를 1분 남짓 쓴다. 동시에 여럿이 필요하면 작업 수 제한으로

function enqueue(name, parent = null) {
  jobs[name] = { state: 'queued' }
  queue = queue.then(async () => {
    jobs[name] = { state: 'running', step: 'script' }
    try {
      // 후속(대본이 낸 선행·심화 개념)은 따로 줄에 세워 페이지가 편마다 진행을 본다
      await engine.makeShort(name, { parent, onStep: (step, progress) => { jobs[name] = { state: 'running', step, progress } },
        chain: (f, from) => { if (!['queued', 'running'].includes(jobs[f.name]?.state)) enqueue(f.name, from) } })
      jobs[name] = { state: 'done' }
      console.log(`완료: ${name}`)
    } catch (e) {
      jobs[name] = { state: 'failed', error: e.message.slice(0, 200) }
      console.error(`실패: ${name} — ${e.message}`)
    }
  })
}

const have = () => Object.fromEntries(Object.keys(parseConcepts(root)).flatMap(k => {
  const f = join(root, 'shorts', `${slug(k)}.mp4`)
  return existsSync(f) ? [[k, statSync(f).mtimeMs.toFixed(0)]] : []
}))

function sendJson(res, code, body) { res.writeHead(code, { 'content-type': TYPES.json }); res.end(JSON.stringify(body)) }

function sendFile(req, res, file) {
  if (!existsSync(file)) return sendJson(res, 404, { error: '없음' })
  const size = statSync(file).size, type = TYPES[file.split('.').pop()] ?? 'application/octet-stream'
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/) // 영상 넘겨 보기(Safari 는 이게 있어야 재생)
  if (range) {
    const start = range[1] ? +range[1] : size - +range[2], end = range[1] && range[2] ? +range[2] : size - 1
    res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' })
    return createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' })
  createReadStream(file).pipe(res)
}

createServer((req, res) => {
  // 다른 사이트가 이 주소로 요청을 보내거나(DNS 재결합), 만들기를 몰래 누르게 하는 것을 막는다
  if (!HOSTS.has(req.headers.host)) return sendJson(res, 403, { error: 'host' })
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname === '/api/shorts' && req.method === 'GET') return sendJson(res, 200, { jobs, have: have() })
  if (url.pathname === '/api/shorts' && req.method === 'POST') {
    const origin = req.headers.origin
    if (!origin || !HOSTS.has(origin.replace(/^http:\/\//, ''))) return sendJson(res, 403, { error: '이 페이지에서만 요청할 수 있어요' })
    const name = url.searchParams.get('name') ?? ''
    if (!parseConcepts(root)[name]) return sendJson(res, 400, { error: '사전에 없는 개념' })
    if (!engine) return sendJson(res, 503, { error: engineError })
    if (['queued', 'running'].includes(jobs[name]?.state)) return sendJson(res, 202, jobs[name])
    enqueue(name)
    return sendJson(res, 202, jobs[name])
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method' })
  if (url.pathname === '/' || url.pathname === '/index.html') return sendFile(req, res, join(root, 'index.html'))
  const m = url.pathname.match(/^\/shorts\/([^/]+\.(?:mp4|json))$/) // 쇼츠 폴더의 영상·대본만 내준다
  if (m) return sendFile(req, res, join(root, 'shorts', decodeURIComponent(m[1]).replace(/[\/\\]/g, '')))
  sendJson(res, 404, { error: '없음' })
}).listen(PORT, '127.0.0.1', () => console.log(`My History — http://localhost:${PORT}  기록 폴더 ${root}${engine ? '' : ` · 쇼츠 만들기 꺼짐: ${engineError}`}  (끄려면 Ctrl+C)`))
