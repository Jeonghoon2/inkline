// 개념 쇼츠 만들기 — ① 대본(claude -p) → ② 검사 → ③ 음성(say) → ④ 녹화(Playwright)·합치기(ffmpeg)
// node shorts.mjs "<개념 이름>" [--root <기록 폴더>]   처음부터 끝까지 (기록 폴더에 build.mjs 가 있으면 끝나고 돌린다)
// node shorts.mjs "<개념 이름>" --render       이미 있는 대본(<기록 폴더>/shorts/<이름>.json)으로 음성·영상만 다시
// node shorts.mjs "<개념 이름>" --from-draft   녹화만 실패했을 때 저장해 둔 확정 대본(shorts/<이름>.draft.json)으로 영상만
// node shorts.mjs "<개념 이름>" --review       손으로 고친 대본을 다시 검토만
// 후속: 대본이 follow(선행·심화 개념, 0~2개)를 내면 끝난 뒤 그 개념의 쇼츠를 이어서 만든다 — 사전에 없으면 항목부터 쓴다. 후속의 후속은 만들지 않는다(한 단계)
// 기록 폴더: --root > SHORTS_ROOT > ~/My-History. 대본 규칙·모양은 이 스킬 폴더의 script-rules.md·review-rules.md·schema.json
import { spawn } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { conceptBlock, conceptEntries, conceptLines, parseConcepts, slug } from './concepts.mjs'
import { AUDIO_EXT, DEFAULT_VOICE, WIN, chromePath, missingTools, speechCmd, which } from './platform.mjs'

const ENGINE = dirname(fileURLToPath(import.meta.url))
const SKILL = dirname(ENGINE)
export let root = resolve(process.env.SHORTS_ROOT ?? join(homedir(), 'My-History')) // concepts.md 와 기록이 있고, 결과가 shorts/ 에 쌓이는 폴더(페이지·서버와 같은 기본값)
export const useRoot = dir => { root = resolve(dir) }
// CLI 공통 — '--root <폴더>' 를 떼어 내고 나머지 인자를 돌려준다(shorts-qa.mjs 도 쓴다)
export function takeRoot(args) {
  const i = args.indexOf('--root')
  if (i >= 0) { useRoot(args[i + 1]); args.splice(i, 2) }
  return args
}
const VOICE = process.env.SHORTS_VOICE ?? DEFAULT_VOICE // 맥 Yuna, Windows Microsoft Heami(platform.mjs)
const RATE = process.env.SHORTS_RATE ?? '185' // 분당 단어 수 — 레퍼런스 쇼츠(초당 5~6자)에 맞춘 값. 195 는 10~25% 빨랐다
const MODEL = process.env.SHORTS_MODEL // 대본·검토 모델 — 비우면 Claude Code 기본 모델. 예: sonnet
const FPS = 30, LEAD = 0.3, GAP = 0.3, TAIL = 1.6, MAX_SEC = 60
// 녹화 방식 — 기본은 그림을 HyperFrames, 조립(글자 층·음성)을 Remotion 이(2026-10-14 사용자가 정함). classic 은 예전처럼 player.html 을 직접 찍는다
const RENDERER = process.env.SHORTS_RENDERER ?? 'hf-remotion'
const CHROME = chromePath() // 맥은 /Applications, Windows 는 Program Files·LocalAppData 아래
const ORDER = ['problem', 'idea', 'example', 'twist', 'result', 'outro']
const COUNT = { problem: [1, 2], idea: [1, 4], example: [3, 6], twist: [1, 2], result: [1, 1], outro: [1, 1] }
const PARTS = ['big', 'gauge', 'cells', 'flow', 'compare', 'code', 'list']
const MAX_CHARS = 370 // 속도 185 에서 60초 안에 드는 대사 합(박자 사이 쉼·끝 화면 포함). 410 이면 61~64초였다

// 읽는 소리 — Yuna 가 단위·기호를 흐리게 읽어(받아쓰기에서 'MB' → 'm') 코드에서 풀어 준다. speak 에도 똑같이
const UNITS = [[/(\d)\s*TB\b/g, '$1테라바이트'], [/(\d)\s*GB\b/g, '$1기가바이트'], [/(\d)\s*MB\b/g, '$1메가바이트'], [/(\d)\s*KB\b/g, '$1킬로바이트'],
  [/(\d)\s*ms\b/g, '$1밀리초'], [/(\d)\s*%/g, '$1퍼센트'], [/(\d)\s*×/g, '$1 곱하기'], [/→/g, ', '], [/\bO\(([^)]{1,8})\)/g, '빅오 $1'], [/\bid\b/g, '아이디'], [/(\d)일치/g, '$1일 치'], [/\bDB\b/g, '디비'], [/\bS3\b/g, '에스쓰리']] // DB 는 받아쓰기에 'dp' 로 들렸다 // 'O(N)' 을 '오 엔'으로 읽히면 받아쓰기에서 '5N' 으로 들렸다
export const speakable = t => UNITS.reduce((x, [re, to]) => x.replace(re, to), t)

// 대본 검사 — 스키마(--json-schema)가 모양을 잡고, 여기서는 순서·길이·참조처럼 스키마로 못 거르는 것을 본다
// fresh: 새로 쓴 대본만 보는 것(분량·'왜?' 질문·큰 글자만 있는 박자). 예전 대본을 다시 렌더할 때는 보지 않는다
export function validateScript(s, { fresh = false } = {}) {
  const err = []
  if (!s || typeof s.title !== 'string' || !s.title) return ['title 이 없다']
  if (!Array.isArray(s.beats) || s.beats.length < 7 || s.beats.length > 18) return ['beats 는 7~18개']
  let last = 0
  for (const [i, b] of s.beats.entries()) {
    const at = `박자 ${i + 1}`
    const r = ORDER.indexOf(b.role)
    if (r < 0) err.push(`${at}: role 이 이상하다(${b.role})`)
    else if (r < last) err.push(`${at}: ${b.role} 가 ${ORDER[last]} 뒤에 왔다(순서: ${ORDER.join(' → ')})`)
    else last = r
    if (!b.say || b.say.length > 48) err.push(`${at}: say 는 1~48자(${b.say?.length ?? 0}자)`)
    if (!b.band?.text || b.band.text.length > 24 || !['bad', 'key', 'good'].includes(b.band.tone)) err.push(`${at}: band 는 tone bad|key|good, text 24자 이하`)
    if (!Array.isArray(b.draw) || !b.draw.length || b.draw.length > 2) { err.push(`${at}: draw 는 1~2개`); continue }
    const ids = new Set()
    for (const d of b.draw) {
      if (!PARTS.includes(d.type)) { err.push(`${at}: 없는 부품 ${d.type}`); continue }
      if (!d.id || ids.has(d.id)) err.push(`${at}: draw id 가 비었거나 겹친다`)
      ids.add(d.id)
      if (d.type === 'gauge' && !(d.max > 0)) err.push(`${at}: gauge max 는 0보다 커야 한다`)
      if (d.type === 'cells' && d.focus && !(d.focus[0] <= d.focus[1] && d.focus[1] < d.items.length)) err.push(`${at}: cells focus 가 칸 범위를 벗어난다`)
      if (d.type === 'flow' && (d.arrows?.length ?? 0) > d.nodes.length - 1) err.push(`${at}: flow arrows 는 상자 수 - 1 개 이하`)
      if (d.type === 'code' && (d.mark ?? []).some(m => m.line >= d.lines.length || !d.lines[m.line].includes(m.text))) err.push(`${at}: code mark 가 없는 줄·글자를 가리킨다`)
    }
  }
  for (const [role, [lo, hi]] of Object.entries(COUNT)) {
    const n = s.beats.filter(b => b.role === role).length
    if (n < lo || n > hi) err.push(`${role} 는 ${lo}~${hi}개(${n}개)`)
  }
  if (s.beats.at(-1)?.role !== 'outro') err.push('마지막 박자는 outro')
  if (s.follow != null && (!Array.isArray(s.follow) || s.follow.length > 2 || s.follow.some(f => !f?.name || f.name.length > 20 || !['선행', '심화'].includes(f.kind) || !f.why))) err.push('follow 는 0~2개, 각각 name(20자 이하)·kind(선행|심화)·why')
  const chars = s.beats.reduce((n, b) => n + (b.say?.length ?? 0), 0)
  if (chars > MAX_CHARS) err.push(`대사 합이 ${MAX_CHARS}자를 넘는다(${chars}자)`)
  if (fresh) {
    if (s.beats.length < 9) err.push(`박자가 ${s.beats.length}개 — 11~14개로 과정을 더 자세히`)
    if (chars < 330) err.push(`대사 합이 ${chars}자 — 340~365자로 '왜'와 과정을 더 자세히`)
    // 잇는 말은 숫자로 세지 않는다 — 검토자가 '뜻이 안 맞는 그래서는 빼라'고 하면 숫자 검사와 부딪혔다. 흐름은 검토 단계가 본다
    if (!s.beats.some(b => /\?|요\?$|까요/.test(b.say) && b.role !== 'outro')) err.push("'왜?'를 묻는 대사가 없다 — 한 번은 묻고 다음 박자에서 답하게")
    const bare = s.beats.slice(1, -1).filter(b => b.draw.every(d => d.type === 'big')).map((_, k) => k)
    if (bare.length > 1) err.push(`큰 글자만 있는 박자가 첫·마지막 말고 ${bare.length}개 — 막대·칸·흐름 같은 그림으로 바꿔 1개 이하가 되게`)
  }
  return err
}

// input: stdin 으로 넘길 글(Windows 에서 claude 에 긴 요청을 줄 때)
function run(cmd, args, { cwd, env, timeout = 0, input } = {}) {
  return new Promise((resolve, reject) => {
    const [bin, pre] = which(cmd) // 맥은 그대로, Windows 는 .exe·npm .cmd 를 shell 없이 부를 꼴로
    const p = spawn(bin, [...pre, ...args], { cwd, env, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
    if (input != null) p.stdin.end(input)
    const timer = timeout && setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} 가 ${Math.round(timeout / 60000)}분 넘게 응답이 없어 끊었다`)) }, timeout)
    p.on('close', () => clearTimeout(timer))
    let out = '', errText = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { errText += d })
    p.on('error', reject)
    // claude 는 오류를 stdout 에 찍고 1 로 끝날 때가 있다 — stderr 가 비면 stdout 끝을 보여 주고, 부른 쪽이 읽게 stdout 도 붙인다
    p.on('close', code => code === 0 ? resolve(out) : reject(Object.assign(new Error(`${cmd} 실패(${code}): ${(errText.trim() || out.trim()).slice(-400)}`), { stdout: out })))
  })
}

// ① 대본 — 사전의 그 개념 블록과, 그 개념을 칠한 기록 전체(사건·수치의 출처)를 넘긴다
// ② 검사 → 검토 — 모양 검사(validateScript)를 통과하면 검토자(review-rules.md)가 사실·흐름·그림을 본다. 지적이 있으면 붙여 다시 쓴다(최대 3번)
const REVIEW_SCHEMA = JSON.stringify({ type: 'object', additionalProperties: false, required: ['issues'], properties: { issues: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['beat', 'kind', 'severity', 'problem', 'fix'],
  properties: { beat: { type: 'integer' }, kind: { enum: ['사실', '흐름', '그림', '발음'] }, severity: { enum: ['높음', '보통'] }, problem: { type: 'string' }, fix: { type: 'string' } } } } } })
// API 는 절대 쓰지 않는다(사용자 규칙) — claude.ai 구독 로그인으로만 부른다. API 키·다른 제공자 환경 변수는 지우고, 로그인 방식이 다르면 멈춘다
const API_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX'] // CLAUDE_CODE_OAUTH_TOKEN 은 구독 로그인 토큰이라 남긴다
const subscriptionEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !API_ENV.includes(k)))
let checked = false
async function assertSubscription() {
  if (checked) return
  // 로그인 안 됐으면 auth status 가 JSON 을 찍고 1 로 끝난다
  const st = JSON.parse(await run('claude', ['auth', 'status'], { env: subscriptionEnv() }).catch(e => { if (e.stdout) return e.stdout; throw e }))
  if (!st.loggedIn) throw new Error('claude 에 로그인돼 있지 않다 — 터미널에서 claude 를 한 번 실행해 /login 한 뒤 다시 만든다')
  if (st.authMethod !== 'claude.ai' || st.apiProvider !== 'firstParty') throw new Error(`claude.ai 구독 로그인이 아니라 멈춘다(로그인 방식: ${st.authMethod}, 제공자: ${st.apiProvider}) — API 는 쓰지 않는다`)
  checked = true
}
async function claude(system, schema, prompt, log, label) {
  await assertSubscription()
  const tmp = mkdtempSync(join(tmpdir(), 'shorts-claude-')) // 저장소 밖에서 돌려 다른 지침이 섞이지 않게
  try {
    // Windows 는 명령줄이 32,767자까지라 규칙·대본을 다 실으면 넘칠 수 있다 — 규칙은 파일로, 요청은 stdin 으로
    if (WIN) writeFileSync(join(tmp, 'system.md'), system)
    const sys = WIN ? ['--system-prompt-file', join(tmp, 'system.md')] : ['--system-prompt', system]
    // 응답 없이 멈추는 일이 있었다(맥이 잠들었다 깬 뒤 1시간 42분, 2026-10-14) — 10분이면 끊고 한 번 더
    const call = () => run('claude', ['-p', '--output-format', 'json', '--json-schema', schema, ...sys,
      '--tools', '', '--strict-mcp-config', '--no-session-persistence', ...(MODEL ? ['--model', MODEL] : []), ...(WIN ? [] : [prompt])], { cwd: tmp, env: subscriptionEnv(), timeout: 600000, input: WIN ? prompt : undefined })
    const out = await call().catch(e => { log(`${label}: ${e.message} — 다시 부른다`); return call() })
    const res = JSON.parse(out)
    log(`${label}: 정가 환산 $${res.total_cost_usd ?? '?'} (구독 사용량 — 청구액 아님)`)
    if (res.is_error) throw new Error(`claude 오류: ${res.result}`)
    return res.structured_output ?? JSON.parse(res.result)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}
// 검토만 — 손으로 고친 대본을 다시 검토해 meta.json 의 지적을 갈아 끼운다(node shorts.mjs "<이름>" --review)
export async function reviewOnly(name) {
  const base = join(root, 'shorts', slug(name)), c = parseConcepts(root)[name]
  if (!c) throw new Error(`사전에 없는 개념: ${name} (기록 폴더 ${root})`)
  const log = msg => appendFileSync(`${base}.log`, `${new Date().toISOString()} ${msg}\n`)
  const script = JSON.parse(readFileSync(`${base}.json`, 'utf8'))
  const story = conceptEntries(root, name, 3500) || conceptLines(root, name).map(l => `- ${l}`).join('\n')
  const source = `개념: ${name}\n\n## 사전 내용\n${c.raw}\n## 이 개념이 나온 우리 기록 — 사건은 여기서 고르고, 실제 수치도 여기서만 가져온다\n${story || '(없음 — 사전 내용만 쓴다)'}`
  const { issues } = await claude(readFileSync(join(SKILL, 'review-rules.md'), 'utf8'), REVIEW_SCHEMA, `${source}\n\n## 검토할 대본\n${JSON.stringify(script, null, 1)}`, log, '검토만')
  log(`검토만: 지적 ${issues.length}건(높음 ${issues.filter(x => x.severity === '높음').length})${issues.map(x => `\n  박자 ${x.beat} [${x.kind}·${x.severity}] ${x.problem} → ${x.fix}`).join('')}`)
  const meta = JSON.parse(readFileSync(`${base}.meta.json`, 'utf8'))
  writeFileSync(`${base}.meta.json`, JSON.stringify({ ...meta, issues }, null, 1) + '\n')
  return issues
}

export async function writeScript(name, { feedback = '', log = () => {}, from = null, parent = null } = {}) {
  const all = parseConcepts(root), c = all[name]
  if (!c) throw new Error(`사전에 없는 개념: ${name} (기록 폴더 ${root})`)
  const rules = readFileSync(join(SKILL, 'script-rules.md'), 'utf8')
  const review = readFileSync(join(SKILL, 'review-rules.md'), 'utf8')
  const schema = readFileSync(join(SKILL, 'schema.json'), 'utf8')
  const beatSchema = JSON.parse(schema).properties.beats.items
  const patchSchema = JSON.stringify({ type: 'object', additionalProperties: false, required: ['changes'], $defs: JSON.parse(schema).$defs,
    properties: { changes: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['beat'], properties: { beat: { type: 'integer' }, remove: { type: 'boolean' }, replace: beatSchema } } } } })
  const story = conceptEntries(root, name, 3500) || conceptLines(root, name).map(l => `- ${l}`).join('\n')
  const source = `개념: ${name}\n\n## 사전 내용\n${c.raw}\n## 이 개념이 나온 우리 기록 — 사건은 여기서 고르고, 실제 수치도 여기서만 가져온다\n${story || '(없음 — 사전 내용만 쓴다)'}` +
    (parent ? `\n\n## 이 영상은 후속이다\n'${parent.name}' 쇼츠의 ${parent.kind} 편 — ${parent.why}. 원래 영상을 본 사람이 이어 본다고 생각하고 쓴다. follow 는 빈 배열로(후속의 후속은 만들지 않는다)`
      : `\n\n## 사전에 있는 다른 개념(follow 이름은 맞는 것이 있으면 이대로)\n${Object.keys(all).filter(k => k !== name).map(k => `- ${k}`).join('\n')}`)
  // 지적된 박자만 고쳐 끼운다 — 통째로 다시 쓰면 매번 새 문제가 생기고 비용도 3~5배였다
  const patch = async (cur, problems, label) => {
    const { changes } = await claude(rules, patchSchema, `${source}\n\n## 지금 대본\n${JSON.stringify(cur, null, 1)}\n\n## 고칠 것\n${problems}\n\n` +
      '고칠 박자만 고쳐서, 박자 번호(1부터)와 그 박자 전체(replace)를 돌려라. 없앨 박자는 remove: true. 번호는 모두 지금 대본 기준. 나머지 박자는 그대로 둔다. 앞뒤 박자와 잇는 말이 이어지게, 대사 합은 350자 안팎(370자 넘지 않게).', log, label)
    const next = structuredClone(cur)
    for (const ch of changes) if (ch.beat >= 1 && ch.beat <= next.beats.length && ch.replace) next.beats[ch.beat - 1] = ch.replace
    const drop = new Set(changes.filter(c => c.remove).map(c => c.beat - 1)) // 박자를 합칠 때 빈 박자는 지운다
    next.beats = next.beats.filter((_, i) => !drop.has(i))
    log(`${label}: 박자 ${changes.map(c => c.beat + (c.remove ? '(지움)' : '')).join(', ')}`)
    return next
  }
  // 1) 처음 쓰기 한 번 → 모양 검사에 걸리면 그 문제만 고쳐 끼우기(최대 2번)
  let script = from ? await patch(from, feedback, '줄이기') // 길이 초과 — 검토까지 마친 대본을 버리지 않고 대사만 줄여 끼운다
    : await claude(rules, schema, `${source}\n\n규칙대로 이 개념의 쇼츠 대본을 써라. 내기 전에 규칙 끝의 점검을 하고 고쳐서 낸다.${feedback}`, log, '대본')
  for (let k = 1; ; k++) {
    const errs = validateScript(script, { fresh: true })
    if (!errs.length) break
    log(`모양 검사 실패: ${errs.join(' / ')}`)
    if (k > 2) throw new Error(`대본이 모양 검사를 통과하지 못했다: ${errs.join(' / ')}`)
    // 박자 개수 문제는 박자를 합치거나 역할을 바꿔야 해서, 해당 박자를 고쳐 끼우는 것으로 풀리게 이유를 그대로 넘긴다
    script = await patch(script, `모양 검사에 걸린 것(모두 고쳐라): ${errs.join(' / ')}\n- 박자 수를 줄여야 하면 고칠 박자의 role 을 바꾸거나 두 박자의 내용을 한 박자로 합쳐라(이때 빠진 자리는 앞뒤 박자를 고쳐 메운다)`, `모양 고치기 ${k}차`)
  }
  // 2) 검토 → 지적이 있으면 그 박자만 고쳐 끼운다(1·2차는 보통까지, 3차는 결과만). 통째로 다시 쓰면 매번 새 지적이 생겨 수렴하지 않았다
  let issues = []
  for (let round = 1; round <= 3; round++) {
    ;({ issues } = await claude(review, REVIEW_SCHEMA, `${source}\n\n## 검토할 대본\n${JSON.stringify(script, null, 1)}`, log, `검토 ${round}차`))
    const listed = issues.map(x => `박자 ${x.beat} [${x.kind}·${x.severity}] ${x.problem} → ${x.fix}`)
    log(`검토 ${round}차: 지적 ${issues.length}건(높음 ${issues.filter(x => x.severity === '높음').length})${listed.length ? '\n  ' + listed.join('\n  ') : ''}`)
    const high = issues.filter(x => x.severity === '높음')
    // '보통'도 두 번까지 고친다(박자 순서·추정을 단정한 곳 같은 게 '보통'으로 와도 영상에선 거슬렸다). 마지막 검토는 결과만 남긴다
    if ((round <= 2 ? !issues.length : !high.length) || round === 3) break
    const next = await patch(script, `검토자의 지적:\n${listed.join('\n')}`, `고치기 ${round}차`)
    if (next.beats.at(-1).role === 'outro') next.question = next.question ?? script.question
    let errs = validateScript(next, { fresh: true }), fixed = next
    // 고친 대본이 모양 검사(대개 글자 수)에 걸리면 검토 반영은 지키고 그것만 한 번 더 고친다 — 바로 버리면 '높음' 사실 지적이 남은 대본으로 녹화됐다(2026-10-14, 8자 넘어서)
    if (errs.length) {
      log(`고치기 ${round}차 모양 검사 실패 — 그것만 다시 고친다: ${errs.join(' / ')}`)
      fixed = await patch(next, `모양 검사에 걸린 것(모두 고쳐라): ${errs.join(' / ')}\n- 방금 검토 지적을 반영해 고친 내용(사실·흐름)은 그대로 지키고, 긴 박자의 대사만 줄여라`, `고치기 ${round}차 모양`)
      if (fixed.beats.at(-1).role === 'outro') fixed.question = fixed.question ?? next.question
      errs = validateScript(fixed, { fresh: true })
    }
    if (errs.length) { log(`고치기 ${round}차 모양 검사 실패 — 고치기 전 대본을 둔다: ${errs.join(' / ')}`); break }
    script = fixed
  }
  // 후속 — 자기 자신·겹친 이름은 빼고 2개까지. 후속 편이면 비운다(한 단계)
  const seen = new Set([name])
  script.follow = parent ? [] : (script.follow ?? []).filter(f => f?.name && !seen.has(f.name) && seen.add(f.name)).slice(0, 2)
  if (script.follow.length) log(`후속 제안: ${script.follow.map(f => `${f.kind} ${f.name} — ${f.why}`).join(' / ')}`)
  return { script, issues }
}

// 후속 개념의 사전 항목 — 사전에 없으면 원래 개념의 항목과 이유를 주고 써서 concepts.md 끝에 붙인다(concept-rules.md)
const CONCEPT_SCHEMA = JSON.stringify({ type: 'object', additionalProperties: false, required: ['why', 'qs'], properties: { why: { type: 'string', maxLength: 400 },
  qs: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string', maxLength: 80 }, a: { type: 'string', maxLength: 300 } } } } } })
export async function writeConcept(name, parent, log = () => {}) {
  if (parseConcepts(root)[name]) return false
  const p = parseConcepts(root)[parent.name]
  const entry = await claude(readFileSync(join(SKILL, 'concept-rules.md'), 'utf8'), CONCEPT_SCHEMA,
    `새 개념: ${name}\n원래 개념: ${parent.name} (${parent.kind})\n이유: ${parent.why}\n\n## 원래 개념의 사전 내용\n${p?.raw ?? '(없음)'}`, log, '사전 항목')
  const path = join(root, 'concepts.md'), old = existsSync(path) ? readFileSync(path, 'utf8') : '# 개념 사전\n'
  writeFileSync(path, `${old.replace(/\n*$/, '\n\n')}${conceptBlock(name, entry, parent)}`)
  log(`사전 항목 추가: ${name} (${parent.kind} · ${parent.name})`)
  return true
}

// ③ 음성 — 박자마다 say(Windows 는 System.Speech, platform.mjs)로 만들고 길이를 재, 박자 시작 시각과 전체 길이를 정한다
async function voice(script, dir) {
  const durs = []
  for (const [i, b] of script.beats.entries()) {
    const f = join(dir, `${i}.${AUDIO_EXT}`)
    const sp = speechCmd(speakable(b.speak ?? b.say), f, { voice: VOICE, rate: RATE, sapi: process.env.SHORTS_SAPI_RATE })
    await run(sp.cmd, sp.args, sp.env && { env: { ...process.env, ...sp.env } })
    durs.push(+(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])).trim())
  }
  const starts = []
  let t = LEAD
  for (const d of durs) { starts.push(+t.toFixed(3)); t += d + GAP }
  const total = +(t + TAIL).toFixed(3)
  const inputs = durs.flatMap((_, i) => ['-i', join(dir, `${i}.${AUDIO_EXT}`)])
  const mix = durs.map((_, i) => `[${i + 1}]adelay=${Math.round(starts[i] * 1000)}:all=1[a${i}]`).join(';') +
    `;[0]${durs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${durs.length + 1}:normalize=0:duration=first[out]`
  const wav = join(dir, 'voice.wav')
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=48000:cl=mono', ...inputs, '-filter_complex', mix, '-map', '[out]', wav])
  return { starts, total, wav, durs }
}

// ④ 녹화(classic) — 재생기를 화면 없는 Chrome 에 띄워 프레임마다 __seek(t) 로 그리고 찍어, 음성과 함께 MP4 로
async function videoClassic(script, { starts, total, wav, durs }, out, onProgress) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })
  // 찍기가 가끔 30초씩 멈춘다(2026-10-13 6바퀴) — 그러면 페이지를 새로 열어 그 프레임부터 이어 찍는다(최대 3번)
  const open = async () => {
    const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
    await pg.goto(pathToFileURL(join(ENGINE, 'player.html')).href)
    await pg.evaluate(([s, st, t, d]) => window.load(s, st, t, d), [script, starts, total, durs])
    return pg
  }
  try {
    let page = await open(), retries = 0
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] })
    let errText = ''
    ff.stderr.on('data', d => { errText += d })
    const done = new Promise((resolve, reject) => ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg 실패: ${errText.trim().slice(-400)}`))))
    const frames = Math.ceil(total * FPS)
    for (let k = 0; k < frames; k++) {
      let jpg
      try {
        await page.evaluate(t => window.__seek(t), k / FPS)
        jpg = await page.screenshot({ type: 'jpeg', quality: 90, timeout: 15000 })
      } catch (e) {
        if (++retries > 3) throw e
        await page.close().catch(() => {})
        page = await open()
        k--; continue
      }
      if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r))
      if (k % FPS === 0) onProgress?.(k / frames)
    }
    ff.stdin.end()
    await done
  } finally { await browser.close() }
}

// ④ 녹화(기본) — HyperFrames 가 그림 칸(1080×920)을 장면 영상으로, Remotion 이 그 위에 글자 층(overlay.js)·음성을 얹어 최종 MP4 로
// 그림은 player.html 그대로다: 제목·자막 칸만 숨기고, HyperFrames 가 프레임마다 보내는 hf-seek 을 __seek(t) 에 잇는다 — 품질 검사가 재는 그림과 같다
// HyperFrames 의 사용 통계·스킬 자동 설치는 끈다(init 이 ~/.claude/skills 에 스킬 10개를 깔았다, 2026-10-14). Chrome 은 이 컴퓨터에 깔린 것(chromePath)
// 찍는 방식도 고정한다 — HyperFrames 는 설치마다 실험군(~/.hyperframes 의 bucketSeed)을 정해 빠른 찍기(drawElementImage)를 켰다 껐다 해서, 빈 HOME 에서 다시 녹화하면 화소가 달랐다(4,323묶음 중 381, 2026-10-14)
const HF_ENV = { DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_BROWSER_PATH: CHROME, HF_DE_PARALLEL_ROUTER: 'false' }
// 하드웨어 GPU 로 그리면 같은 장면을 다시 찍어도 프레임이 미세하게 달랐다(무손실 PNG 로도 360장 중 265장) — 소프트웨어로 그리면 일꾼 수와 상관없이 같다. 일꾼 수도 고정
const HF_FLAGS = ['--no-experimental-fast-capture', '--no-browser-gpu', '--workers', '6']
export function sceneHTML(script, { starts, total, durs }) {
  return readFileSync(join(ENGINE, 'player.html'), 'utf8')
    .replace('</style>', '  /* HyperFrames 장면 — 그림 칸만. 제목·띠·자막·끝 화면은 Remotion 이 얹는다 */\n  #title, #band, #sub, #brand, #end { display: none !important; }\n  html, body { width: 1080px; height: 920px; overflow: hidden; }\n  #stage { height: 920px; }\n  #draw, #draw-prev { top: 0; }\n</style>\n<script src="gsap.min.js"></script>')
    .replace('<div id="stage">', `<div id="stage" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1080" data-height="920">`)
    .replace('</body>', `<script>
window.load(${JSON.stringify(script).replace(/</g, '\\u003c')}, ${JSON.stringify(starts)}, ${total}, ${JSON.stringify(durs)})
window.addEventListener('hf-seek', e => window.__seek(e.detail.time))
const tl = gsap.timeline({ paused: true }); tl.set({}, {}, ${total}) // 길이만 알리는 빈 타임라인 — 그리기는 hf-seek 이 한다
window.__timelines = window.__timelines || {}; window.__timelines.main = tl
</script>
</body>`)
}
async function video(script, timing, out, onProgress) {
  if (RENDERER === 'classic') return videoClassic(script, timing, out, onProgress)
  const dir = mkdtempSync(join(tmpdir(), 'shorts-hf-')), scene = join(dir, 'scene'), pub = join(dir, 'public')
  try {
    mkdirSync(scene); mkdirSync(pub)
    for (const f of ['overlay.js', 'overlay.css']) copyFileSync(join(ENGINE, f), join(scene, f))
    copyFileSync(join(ENGINE, 'node_modules/gsap/dist/gsap.min.js'), join(scene, 'gsap.min.js'))
    writeFileSync(join(scene, 'index.html'), sceneHTML(script, timing))
    // 1) 그림 장면 — HyperFrames(진행 0~60%)
    await new Promise((resolve, reject) => {
      // Windows 의 .bin/hyperframes 는 .cmd 라 shell 없이 못 부른다 — 그 안의 js 를 node 로(which)
      const [hf, pre] = WIN ? which('hyperframes', { env: { PATH: join(ENGINE, 'node_modules', '.bin') } }) : [join(ENGINE, 'node_modules/.bin/hyperframes'), []]
      const p = spawn(hf, [...pre, 'render', scene, '-o', join(pub, 'scene.mp4'), '--fps', String(FPS), '--quality', 'delivery', ...HF_FLAGS],
        { cwd: dir, env: { ...process.env, ...HF_ENV }, stdio: ['ignore', 'pipe', 'pipe'] })
      let tail = ''
      const read = d => { tail = (tail + d).slice(-2000); for (const m of String(d).matchAll(/@hf-progress (\{.*\})/g)) try { onProgress?.(0.6 * JSON.parse(m[1]).pct / 100) } catch { /* 진행 줄이 잘렸다 */ } }
      p.stdout.on('data', read); p.stderr.on('data', read)
      p.on('error', reject)
      p.on('close', code => code === 0 ? resolve() : reject(new Error(`HyperFrames 그림 장면 실패(${code}): ${tail.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-400)}`)))
    })
    copyFileSync(timing.wav, join(pub, 'voice.wav'))
    // 2) 조립 — Remotion(진행 60~100%)
    const { bundle } = await import('@remotion/bundler')
    const { makeCancelSignal, renderMedia, selectComposition } = await import('@remotion/renderer')
    const serveUrl = await bundle({ entryPoint: join(ENGINE, 'remotion/index.jsx'), publicDir: pub, outDir: join(dir, 'bundle') })
    const inputProps = { script, starts: timing.starts, durs: timing.durs, total: timing.total }
    const opts = { serveUrl, inputProps, browserExecutable: CHROME, chromeMode: 'chrome-for-testing', logLevel: 'error' }
    const composition = await selectComposition({ ...opts, id: 'Short' })
    // 프레임 꺼내기(compositor)가 끊기면 오류 없이 멈춰 버렸다(2026-10-14, 72분) — 3분 동안 진행이 없으면 끊고 한 번 더. 탭 수도 4개로 줄인다
    for (let attempt = 1; ; attempt++) {
      const { cancelSignal, cancel } = makeCancelSignal()
      let last = Date.now(), stalled = false
      const watch = setInterval(() => { if (Date.now() - last > 180000) { stalled = true; cancel() } }, 10000)
      try {
        await renderMedia({ ...opts, composition, codec: 'h264', crf: 20, pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '160k', outputLocation: out,
          concurrency: 4, timeoutInMilliseconds: 60000, cancelSignal, onProgress: ({ progress }) => { last = Date.now(); onProgress?.(0.6 + 0.4 * progress) } })
        break
      } catch (e) {
        if (attempt >= 2) throw new Error(`Remotion 조립 실패${stalled ? '(3분 동안 멈춤)' : ''}: ${e.message.slice(0, 200)}`)
      } finally { clearInterval(watch) }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// 전체 — 새 파일은 임시 이름으로 만들고 다 된 뒤에만 바꿔 끼운다(실패해도 이전 영상은 남는다)
// parent: 후속으로 부를 때 { name, kind, why }. chain(f, from): 후속을 어떻게 만들지 — 기본은 바로 이어서, 서버는 작업 줄에 넣는다
export async function makeShort(name, { renderOnly = false, fromDraft = false, onStep = () => {}, parent = null, chain = null } = {}) {
  const miss = missingTools() // 대본을 쓴 뒤 음성 길이를 잴 때(ffprobe)야 'spawn ffprobe ENOENT' 로 죽던 것을 미리 막는다
  if (miss) throw new Error(miss)
  // 처음 깐 PC 는 녹화 부품(playwright 등)이 없다 — 대본을 몇 분 쓴 뒤 녹화에서 'Cannot find package' 로 죽기 전에 막는다
  if (!existsSync(join(ENGINE, 'node_modules', 'playwright'))) throw new Error(`쇼츠 엔진을 아직 설치하지 않았습니다 — 터미널에서 ${WIN ? 'node ' : 'sh '}${join(ENGINE, WIN ? 'setup.mjs' : 'setup.sh').replace(homedir(), '~')} 를 한 번 실행한 뒤 다시 시도하세요`)
  mkdirSync(join(root, 'shorts'), { recursive: true })
  const base = join(root, 'shorts', slug(name))
  const log = msg => appendFileSync(`${base}.log`, `${new Date().toISOString()} ${msg}\n`)
  const dir = mkdtempSync(join(tmpdir(), 'shorts-'))
  try {
    log(`시작: ${name}${renderOnly ? ' (대본 그대로)' : ''}${parent ? ` (${parent.name} 의 ${parent.kind} 편)` : ''}`)
    if (parent && !renderOnly && !fromDraft) { onStep('script'); await writeConcept(name, parent, log) } // 사전에 없는 후속 개념은 항목부터
    let script, issues = null
    if (fromDraft) { // 녹화만 실패했을 때 — 저장해 둔 확정 대본으로 영상만
      ;({ script, issues } = JSON.parse(readFileSync(`${base}.draft.json`, 'utf8')))
      renderOnly = true
    } else if (renderOnly) {
      script = JSON.parse(readFileSync(`${base}.json`, 'utf8'))
      try { issues = JSON.parse(readFileSync(`${base}.meta.json`, 'utf8')).issues ?? null } catch { /* 처음 렌더 */ } // 영상만 다시 만들어도 검토 지적은 남긴다
      const errs = validateScript(script)
      if (errs.length) throw new Error(`대본 검사 실패: ${errs.join(' / ')}`)
    } else { onStep('script'); ({ script, issues } = await writeScript(name, { log, parent })) }
    onStep('voice')
    let timing = await voice(script, dir)
    for (let k = 1; k <= 2 && timing.total > MAX_SEC && !renderOnly; k++) { // 너무 길면 지금 대본의 대사를 줄여 끼운다(최대 2번)
      log(`길이 ${timing.total}초 — 줄인다(${k}차)`)
      onStep('script')
      ;({ script, issues } = await writeScript(name, { log, parent, from: script, feedback: `읽으면 ${timing.total.toFixed(1)}초라 ${MAX_SEC}초를 넘는다. 긴 박자 몇 개의 대사를 줄여 대사 합을 ${Math.round(script.beats.reduce((n, b) => n + b.say.length, 0) * (MAX_SEC - 3) / timing.total)}자 아래로. 뜻과 흐름은 그대로` }))
      onStep('voice')
      timing = await voice(script, dir)
    }
    if (!fromDraft && !renderOnly) writeFileSync(`${base}.draft.json`, JSON.stringify({ script, issues }, null, 1) + '\n') // 녹화가 실패해도 대본은 남긴다(--from-draft)
    if (timing.total > MAX_SEC + 2) throw new Error(`영상이 ${timing.total.toFixed(0)}초로 너무 길다`)
    onStep('video', 0)
    await video(script, timing, join(dir, 'out.mp4'), p => onStep('video', p))
    writeFileSync(join(dir, 'script.json'), JSON.stringify(script, null, 2) + '\n')
    // 품질 검사(shorts-qa.mjs)가 읽는 박자 시각·대사 길이와 검토 결과
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ starts: timing.starts, durs: timing.durs, total: timing.total, rate: RATE, voice: VOICE, issues: issues ?? undefined }, null, 1) + '\n')
    for (const [from, to] of [['out.mp4', `${base}.mp4`], ['script.json', `${base}.json`], ['meta.json', `${base}.meta.json`]]) { copyFileSync(join(dir, from), `${to}.tmp`); renameSync(`${to}.tmp`, to) } // 같은 폴더 안 이름 바꾸기라 한 번에 바뀐다
    rmSync(`${base}.draft.json`, { force: true })
    log(`완료: ${timing.total.toFixed(1)}초, 박자 ${script.beats.length}개`)
    if (existsSync(join(root, 'build.mjs'))) await run('node', [join(root, 'build.mjs')]) // My-History 처럼 페이지를 만드는 폴더면 다시 만든다
    onStep('done')
    // 후속 — 새로 쓴 대본만(대본 그대로 다시 녹화할 때는 만들지 않는다). 이미 만든 영상은 건너뛴다. 후속이 실패해도 이 영상은 그대로 둔다
    if (!renderOnly && !parent) for (const f of script.follow ?? []) {
      if (existsSync(join(root, 'shorts', `${slug(f.name)}.mp4`))) { log(`후속 ${f.name}: 이미 있다`); continue }
      const from = { name, kind: f.kind, why: f.why }
      if (chain) { chain(f, from); continue }
      try { await makeShort(f.name, { parent: from, onStep }) } catch (e) { log(`후속 ${f.name} 실패: ${e.message}`) }
    }
    return { seconds: timing.total, beats: script.beats.length, follow: script.follow ?? [] }
  } catch (e) { log(`실패: ${e.message}`); throw e } finally { rmSync(dir, { recursive: true, force: true }) }
}

// 직접 실행했을 때만 — 경로는 실제 경로끼리 비교한다(/var → /private/var 나 심볼릭 링크로 부르면 문자열이 달라 아무것도 안 하고 끝났다)
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [name, flag] = takeRoot(process.argv.slice(2))
  if (!name) { console.error('사용: node shorts.mjs "<개념 이름>" [--render | --from-draft | --review] [--root <기록 폴더>]'); process.exit(1) }
  const label = { script: '대본 쓰는 중', voice: '음성 만드는 중', video: '영상 만드는 중', done: '완료' }
  let lastStep = ''
  if (flag === '--review') { const xs = await reviewOnly(name); for (const x of xs) console.log(`박자 ${x.beat} [${x.kind}·${x.severity}] ${x.problem}`); console.log(`지적 ${xs.length}건`); process.exit(0) }
  makeShort(name, { renderOnly: flag === '--render', fromDraft: flag === '--from-draft', onStep: (s, p) => { if (s !== lastStep || p === undefined) console.log(label[s]); lastStep = s } })
    .then(r => console.log(`${join(root, 'shorts', slug(name))}.mp4 — ${r.seconds.toFixed(1)}초, 박자 ${r.beats}개`))
    .catch(e => { console.error(e.message); process.exit(1) })
}
