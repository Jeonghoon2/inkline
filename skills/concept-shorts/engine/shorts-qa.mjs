// 쇼츠 품질 검사 — node shorts-qa.mjs "<개념 이름>" [--layout] [--root <기록 폴더>]   (--layout: 화면 넘침·겹침만 빠르게)
// 길이·말 속도·큰 글자만 있는 박자·화면 넘침·검토 지적을 재고, faster-whisper 가 깔린 python 이 있으면 받아쓰기로 핵심어도 잰다
// (SHORTS_WHISPER_PY, 없으면 setup.sh --whisper(Windows 는 node setup.mjs --whisper)가 만드는 ~/.cache/concept-shorts/venv)
// 결과는 shorts/<이름>.qa.json. 기준을 모두 넘으면 종료 코드 0, 아니면 1
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { slug } from './concepts.mjs'
import { root, speakable, takeRoot } from './shorts.mjs'
import { whisperPython } from './platform.mjs'

const GATES = { minSec: 50, maxSec: 60, maxPace: 5.9, minTerms: 0.9, maxBare: 2, maxOverflow: 0, maxHigh: 0 }
const ENGINE = dirname(fileURLToPath(import.meta.url)), SKILL = dirname(ENGINE)
// 받아쓰기는 '메가바이트'를 'MB' 로, '빅오 엔'을 'O(N)' 으로 다시 줄여 쓰기도 해 양쪽을 같은 꼴로 맞춘다
const UNIT_BACK = [[/테라바이트/g, 'tb'], [/기가바이트|기가/g, 'gb'], [/메가바이트|메가/g, 'mb'], [/킬로바이트/g, 'kb'], [/밀리초/g, 'ms'], [/퍼센트/g, '%'], [/빅오\s*/g, 'o'], [/아이디/g, 'id'], [/디비/g, 'db'], [/에스\s*쓰리/g, 's3'], [/,(?=\d{3})/g, '']]
// '5천'·'32만'은 받아쓰기가 '5000'·'320000' 으로도 써서 숫자로 맞춘다
const KNUM = t => t.replace(/(\d+)\s*만/g, (_, n) => String(+n * 10000)).replace(/(\d+)\s*천/g, (_, n) => String(+n * 1000))
const norm = t => KNUM(UNIT_BACK.reduce((x, [re, to]) => x.replace(re, to), t.toLowerCase())).replace(/[\s.,!?·…'"“”‘’()\[\]{}:;~\-—→>＞<=+*/]/g, '')
function lev(a, b) { // 글자 편집 거리
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

// 화면 넘침·겹침 — 박자마다 말이 끝나는 순간(새 항목이 다 나온 뒤)을 그려 보고, 글자 하나하나의 줄 상자로 잰다
// 1) 그림 칸 밖으로 나간 것  2) 상자(흐름 상자·카드·칸·코드) 안 글자가 테두리에 붙거나 넘친 것
// 3) 상자 밖 글자(화살표 글자 등)가 다른 상자 테두리에 걸친 것  4) 서로 다른 글자끼리 겹친 것  5) 자막 3줄·띠 넘침
// 흐름 상자 사이 화살표 글자가 상자 테두리 위로 넘쳤는데 1)만 보던 검사가 놓쳤다(2026-10-13, 'plan → 읽고 나서 → apply')
export async function layoutCheck(script, meta) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })
  const overflow = []
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
    await page.goto(pathToFileURL(join(ENGINE, 'player.html')).href)
    await page.evaluate(([s, st, t, d]) => window.load(s, st, t, d), [script, meta.starts, meta.total, meta.durs])
    for (let i = 0; i < script.beats.length; i++) {
      await page.evaluate(t => window.__seek(t), meta.starts[i] + meta.durs[i] - 0.05)
      const found = await page.evaluate(() => {
        const out = [], draw = document.getElementById('draw'), dr = draw.getBoundingClientRect()
        const tight = el => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2
        for (const el of draw.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (!r.width) continue
          if (r.left < -2 || r.right > 1082 || r.top < dr.top - 40 || r.bottom > dr.bottom + 40) out.push(`그림 칸 밖: ${el.className || el.tagName} "${el.textContent.trim().slice(0, 20)}"`)
          else if ((['node', 'card', 'cell', 'code'].some(c => el.classList.contains(c)) && tight(el)) || (el.classList.contains('big') && el.scrollWidth > el.clientWidth + 2)) out.push(`글자 넘침: ${el.className} "${el.textContent.trim().slice(0, 20)}"`)
        }
        // 보이는 정도 — 흐려지며 사라지는 중인 것은 뺀다
        const seen = el => { let o = 1; for (let e = el; e && e !== draw; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o > 0.1 }
        const BOX = '.node, .card, .cell, .code, .g-track', OWN = '.node, .card, .cell, .code' // 게이지 막대는 글자를 담지 않고 가로막기만 한다(한계 글자는 막대 아래에 붙는다)
        const PAD = { cell: 4 } // 테두리 안쪽으로 비워 둘 거리(px) — 작은 네모 칸만 좁게
        const boxes = [...draw.querySelectorAll(BOX)].filter(seen).map(el => {
          const r = el.getBoundingClientRect(), bw = parseFloat(getComputedStyle(el).borderTopWidth) || 0, pad = bw + (PAD[el.classList[0]] ?? 12)
          return { el, r, inner: { left: r.left + pad, right: r.right - pad, top: r.top + pad, bottom: r.bottom - pad } }
        })
        const hit = (a, b, g = 0) => a.left < b.right + g && a.right > b.left - g && a.top < b.bottom + g && a.bottom > b.top - g
        const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1
        const texts = []
        const walk = document.createTreeWalker(draw, NodeFilter.SHOW_TEXT)
        for (let t; (t = walk.nextNode());) {
          if (!t.textContent.trim() || !seen(t.parentElement)) continue
          const range = document.createRange(); range.selectNodeContents(t)
          // 글자 상자는 줄 높이가 아니라 글자 높이로 — 줄 간격만 겹치는 것은 문제가 아니다
          const fs = parseFloat(getComputedStyle(t.parentElement).fontSize)
          for (const r of range.getClientRects()) if (r.width > 1) {
            const cut = Math.max(0, (r.height - fs) / 2)
            texts.push({ t, word: t.textContent.trim().slice(0, 14), r: { left: r.left, right: r.right, top: r.top + cut, bottom: r.bottom - cut }, own: t.parentElement.closest(OWN) })
          }
        }
        for (const x of texts) for (const b of boxes) {
          if (b.el === x.own) { if (!inside(x.r, b.inner)) out.push(`글자가 상자 테두리에 붙음: "${x.word}"`) }
          else if (b.el.contains(x.t)) continue // 상자 안의 상자(칸 안 글자 등)는 안쪽 상자가 맡는다
          else if (hit(x.r, b.r, 6) && !inside(x.r, b.inner)) out.push(`글자가 다른 상자에 걸침: "${x.word}"`)
        }
        for (let a = 0; a < texts.length; a++) for (let c = a + 1; c < texts.length; c++)
          if (texts[a].t !== texts[c].t && hit(texts[a].r, texts[c].r)) out.push(`글자끼리 겹침: "${texts[a].word}" · "${texts[c].word}"`)
        // 글자 크기 바닥 — 1080 폭 화면의 30px 는 휴대폰에서 약 10pt. 이보다 작으면 못 읽는다(긴 글자를 줄이다 보조 글자가 21px 까지 내려갔다)
        for (const x of texts) { const f = parseFloat(getComputedStyle(x.t.parentElement).fontSize); if (f < 30) out.push(`글자 너무 작음(${Math.round(f)}px): "${x.word}"`) }
        // 제목·띠 — 제목은 한 줄, 띠와 겹치지 않는다(긴 제목이 두 줄로 내려와 띠를 덮었다)
        const title = document.getElementById('title'), tr = title.getBoundingClientRect(), br = document.getElementById('band').getBoundingClientRect()
        if (tr.height > parseFloat(getComputedStyle(title).fontSize) * 1.5 || tr.bottom > br.top) out.push(`제목이 두 줄이거나 띠를 덮음: "${title.textContent.slice(0, 20)}"`)
        const sub = document.getElementById('sub')
        if (sub.getBoundingClientRect().height > 58 * 1.42 * 2 + 6) out.push(`자막 3줄 이상: "${sub.textContent.slice(0, 20)}"`)
        for (const d of document.querySelectorAll('#band div')) if (d.scrollWidth > d.clientWidth + 2) out.push(`띠 넘침: "${d.textContent}"`)
        return [...new Set(out)]
      })
      for (const f of found) overflow.push(`박자 ${i + 1}: ${f}`)
      // 바뀌는 순간 — 앞 박자 그림이 사라지는 동안 새 그림 글자와 겹치는지(0.05초 간격으로 0.5초). 끝 장면만 보던 검사가 놓쳤다
      if (!i) continue
      const clash = new Set()
      for (let u = 0.05; u <= 0.5; u += 0.05) {
        await page.evaluate(t => window.__seek(t), meta.starts[i] + u)
        for (const f of await page.evaluate(() => {
          const seen = el => { let o = 1; for (let e = el; e && e.id !== 'stage'; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o > 0.15 }
          // 그림 하나(.item)마다 글자 상자를 모아, 서로 다른 그림의 글자끼리 겹치는지 본다(사라지는 그림과 새 그림·자리를 옮긴 그림)
          const all = []
          for (const host of ['draw-prev', 'draw']) for (const [k, item] of [...document.getElementById(host).children].entries()) {
            const w = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
            for (let t; (t = w.nextNode());) { if (!t.textContent.trim() || !seen(t.parentElement)) continue
              const r = document.createRange(); r.selectNodeContents(t); for (const x of r.getClientRects()) if (x.width > 1) all.push({ group: `${host}${k}`, word: t.textContent.trim().slice(0, 14), r: x }) }
          }
          const out = []
          for (let x = 0; x < all.length; x++) for (let y = x + 1; y < all.length; y++) { const a = all[x], b = all[y]
            if (a.group !== b.group && a.r.left < b.r.right && a.r.right > b.r.left && a.r.top < b.r.bottom && a.r.bottom > b.r.top) out.push(`"${a.word}" · "${b.word}"`) }
          return out
        })) clash.add(f)
      }
      if (clash.size) overflow.push(`박자 ${i + 1}: 바뀌는 동안 그림끼리 글자 겹침: ${[...clash].slice(0, 3).join(', ')}`)
    }
  } finally { await browser.close() }
  return overflow
}

export async function qa(name) {
  const base = join(root, 'shorts', slug(name))
  const script = JSON.parse(readFileSync(`${base}.json`, 'utf8'))
  const meta = JSON.parse(readFileSync(`${base}.meta.json`, 'utf8'))
  const mp4 = `${base}.mp4`
  const seconds = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }).stdout.trim()
  // 말 속도는 실제로 읽는 글자로 잰다 — 자막 글자로 재면 영어가 많은 대본이 부풀었다(prevent_destroy 15자 = 9음절, Terraform 5.99 → 5.67)
  const chars = script.beats.reduce((n, b) => n + speakable(b.speak ?? b.say).replace(/[\s.,!?·…'"“”‘’()\[\]{}:;~\-—→>＞<=+*/_]/g, '').length, 0)
  const spoken = meta.durs.reduce((a, b) => a + b, 0)
  const bare = script.beats.map((b, i) => b.draw.every(d => d.type === 'big') ? i + 1 : 0).filter(Boolean)

  const overflow = await layoutCheck(script, meta)

  // 받아쓰기 — 대본(읽는 소리 기준)과 글자 오차
  let cer = null, heard = null, termRate = null, missed = []
  const py = process.env.SHORTS_WHISPER_PY ?? whisperPython() // 맥 venv/bin/python, Windows venv\Scripts\python.exe
  if (py && existsSync(py)) {
    const dir = mkdtempSync(join(tmpdir(), 'shorts-qa-'))
    try {
      spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vn', '-ac', '1', '-ar', '16000', join(dir, 'a.wav')])
      const r = spawnSync(py, ['-I', join(SKILL, 'tools', 'transcribe.py'), join(dir, 'a.wav'), join(dir, 't.json')], { encoding: 'utf8' })
      if (r.status !== 0) throw new Error(`받아쓰기 실패: ${r.stderr.slice(-300)}`)
      heard = JSON.parse(readFileSync(join(dir, 't.json'), 'utf8')).map(s => s.t).join(' ')
      const ref = norm(script.beats.map(b => speakable(b.speak ?? b.say)).join(''))
      cer = lev(ref, norm(heard)) / ref.length
      const h = norm(heard)
      // speak 로 한글 발음을 준 영어(SIGKILL → 시그킬)는 받아쓰기도 한글로 써서 영어로 비교하면 늘 '안 들림'이 된다 — 그런 말은 뺀다
      // ponytail: 한글 발음 쪽이 잘 들렸는지는 안 본다(글자 오차로만). 필요하면 speak 의 바뀐 낱말을 따로 비교
      const terms = [...new Set(script.beats.flatMap(b => (b.say.match(/\d[\d,.]*\s*(?:[A-Za-z%]+|만|천|분|초|줄|개|번|일)?|[A-Za-z][A-Za-z0-9]+(?:\([^)]*\))?/g) ?? []).filter(t => !b.speak || b.speak.includes(t))).map(norm).filter(t => t.length >= 2))]
      missed = terms.filter(t => !h.includes(t))
      termRate = terms.length ? 1 - missed.length / terms.length : 1
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  const issues = meta.issues ?? []
  const checks = [
    ['길이', seconds >= GATES.minSec && seconds <= GATES.maxSec, `${seconds.toFixed(1)}초 (기준 ${GATES.minSec}~${GATES.maxSec})`],
    ['말 속도', chars / spoken <= GATES.maxPace, `읽는 글자 초당 ${(chars / spoken).toFixed(2)}자 (기준 ≤ ${GATES.maxPace}, 레퍼런스 4.9~5.8)`],
    ['큰 글자만 있는 박자', bare.length <= GATES.maxBare, `${bare.length}개 ${bare.length ? `(박자 ${bare.join(', ')})` : ''} (기준 ≤ ${GATES.maxBare})`],
    ['화면 넘침', overflow.length <= GATES.maxOverflow, `${overflow.length}곳`],
    ['검토 지적(높음)', issues.filter(x => x.severity !== '보통').length <= GATES.maxHigh, `높음 ${issues.filter(x => x.severity !== '보통').length}건 · 보통 ${issues.filter(x => x.severity === '보통').length}건`],
    ['핵심어 들림', termRate == null ? null : termRate >= GATES.minTerms, termRate == null ? '건너뜀(받아쓰기 python 없음 — setup.sh --whisper)' : `${(termRate * 100).toFixed(0)}% (기준 ≥ ${GATES.minTerms * 100}%)${missed.length ? ` · 안 들린 것: ${missed.join(', ')}` : ''}`],
    ['글자 오차(참고)', null, cer == null ? '건너뜀' : `${(cer * 100).toFixed(1)}% — 받아쓰기 모델의 철자 실수(읽기 → 일기 등)도 들어 있어 참고로만`]
  ]
  const report = { name, at: new Date().toISOString(), pass: checks.every(c => c[1] !== false) && termRate != null, checks: checks.map(([k, ok, v]) => ({ k, ok, v })), overflow, issues, heard, missed }
  writeFileSync(`${base}.qa.json`, JSON.stringify(report, null, 1) + '\n')
  return report
}

// 직접 실행했을 때만 — 경로는 실제 경로끼리 비교한다(/var → /private/var 나 심볼릭 링크로 부르면 문자열이 달라 아무것도 안 하고 끝났다)
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = takeRoot(process.argv.slice(2)), layoutOnly = args.includes('--layout'), [name] = args.filter(a => a !== '--layout')
  if (!name) { console.error('사용: node shorts-qa.mjs "<개념 이름>" [--layout] [--root <기록 폴더>]'); process.exit(1) }
  if (layoutOnly) { // 화면 넘침·겹침만 — 녹화·받아쓰기 없이 몇 초. 그림 모양(player.html)을 고친 뒤 모든 편에 돌려 본다
    const base = join(root, 'shorts', slug(name))
    const found = await layoutCheck(JSON.parse(readFileSync(`${base}.json`, 'utf8')), JSON.parse(readFileSync(`${base}.meta.json`, 'utf8')))
    for (const o of found) console.log(`  · ${o}`)
    console.log(found.length ? `화면 넘침·겹침 ${found.length}곳` : '화면 넘침·겹침 0곳')
    process.exit(found.length ? 1 : 0)
  }
  const r = await qa(name)
  for (const c of r.checks) console.log(`${c.ok == null ? '–' : c.ok ? '통과' : '실패'}  ${c.k}: ${c.v}`)
  for (const o of r.overflow) console.log(`  · ${o}`)
  for (const x of r.issues) console.log(`  · 박자 ${x.beat} [${x.kind}·${x.severity ?? '?'}] ${x.problem}`)
  if (r.heard) console.log(`받아쓰기: ${r.heard}`)
  console.log(r.pass ? '결과: 통과' : r.checks.every(c => c.ok !== false) ? '결과: 아직 아님 — 핵심어 검사를 건너뛰었다(setup.sh --whisper 뒤 다시)' : '결과: 다시 손볼 것')
  process.exit(r.pass ? 0 : 1)
}
