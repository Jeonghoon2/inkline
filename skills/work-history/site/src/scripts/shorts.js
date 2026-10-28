// 개념 쇼츠 — 상세 창 '면접 꼬리 질문'의 ▶ 60초 쇼츠. 만든 영상은 그 자리에서 재생하고, 없으면 로컬 서버(serve.mjs)에 만들기를 요청한다
const SERVED = location.protocol.startsWith('http') // file:// 로 열면 만들기는 못 하고 이미 만든 영상만 본다
const shortSlug = k => k.replace(/[\/\\:*?"<>|\s]+/g, '_') // concepts.mjs 의 slug 와 같다
const haveShort = { ...(DATA?.shorts ?? {}) }
let shortJobs = {}
const shortBusy = k => ['queued', 'running'].includes(shortJobs[k]?.state)
// 후속 편 — 대본이 낸 선행·심화 개념(build.mjs 가 shorts/<이름>.json 의 follow 를 넣는다). 후속 개념은 사전에 from(원래 개념)이 있다
const followOf = DATA?.follow ?? {}
function nextRow(k) {
  const items = [...(concepts[k]?.from ? [{ ...concepts[k].from, back: true }] : []), ...(followOf[k] ?? [])]
  return items.map(f => {
    const label = f.back ? `이전 편 · ${esc(f.name)}` : `다음 편 · ${esc(f.kind)} · ${esc(f.name)}`
    if (haveShort[f.name]) return `<button type="button" class="sh-next" data-play="${esc(f.name)}" title="${esc(f.why)}">${icon(f.back ? 'left' : 'play')}<span>${label}</span></button>`
    if (shortBusy(f.name)) return `<span class="sh-next is-busy">${icon('loader', 'spin')}<span>${label} 만드는 중</span></span>`
    return ''
  }).join('')
}
const STEP = { queued: '차례를 기다리는 중', script: '대본 쓰는 중', voice: '음성 만드는 중', video: '영상 만드는 중' }

function shortPanel(k) {
  const job = shortJobs[k], again = SERVED ? '<button type="button" class="sh-make" data-make>다시 만들기</button>' : ''
  if (shortBusy(k))
    return `<p class="sh-state">${icon('loader', 'spin')} ${STEP[job.step ?? job.state] ?? '만드는 중'}${job.step === 'video' && job.progress != null ? ` ${Math.round(job.progress * 100)}%` : ''} — 몇 분 걸려요</p>`
  if (haveShort[k]) return `${player(shortSrc(k))}<div class="sh-nexts" data-next>${nextRow(k)}</div>${again}`
  const failed = job?.state === 'failed' ? `<p class="sh-state sh-fail">만들지 못했어요: ${esc(job.error)}</p>` : ''
  return failed + (SERVED
    ? '<button type="button" class="sh-make" data-make>쇼츠 만들기</button><small class="sh-hint">대본·음성·영상을 만들어요(몇 분, Claude 사용량이 조금 들어요)</small>'
    : '<p class="sh-state">서버를 켜면 만들 수 있어요 — 터미널에서 <code>node ~/My-History/serve.mjs</code> 실행 뒤 <code>http://localhost:4173</code> 으로 여세요</p>')
}
const shortButton = k => `<button type="button" class="sh-btn" data-short="${esc(k)}" aria-expanded="false">${icon('play')} 60초 쇼츠${haveShort[k] ? '' : ' <span>만들기</span>'}</button><div class="sh" data-panel="${esc(k)}" hidden></div>`

function refreshPanels(autoplay) {
  for (const el of detail.querySelectorAll('.sh:not([hidden])')) {
    const k = el.dataset.panel, playing = el.querySelector('video')
    if (playing && !shortBusy(k) && !autoplay?.has(k)) continue // 보고 있는 영상은 다시 그리지 않는다
    el.innerHTML = shortPanel(k)
    el.previousElementSibling.innerHTML = `${icon('play')} 60초 쇼츠${haveShort[k] ? '' : ' <span>만들기</span>'}`
    if (autoplay?.has(k)) el.querySelector('video')?.play().catch(() => {})
  }
}

let polling = null
async function pollShorts() {
  try {
    const r = await (await fetch('api/shorts')).json()
    const finished = new Set(Object.keys(r.have).filter(k => r.have[k] !== haveShort[k] && shortBusy(k)))
    Object.assign(haveShort, r.have); shortJobs = r.jobs
    refreshPanels(finished)
    for (const box of detail.querySelectorAll('.d-shorts')) box.querySelector('[data-next]').innerHTML = nextRow(box.querySelector('[data-sh-title]').textContent) // 후속 편이 만들어지는 중·다 됨
    const busy = Object.keys(shortJobs).some(shortBusy)
    if (busy && !polling) polling = setInterval(pollShorts, 2000)
    if (!busy && polling) { clearInterval(polling); polling = null }
  } catch { /* 서버가 꺼졌으면 다음 요청 때 다시 */ }
}

// 상세 창 위쪽 띠 — 이 기록의 개념 중 만든 쇼츠가 있는 것. 첫 편을 걸어 두고 버튼으로 바꿔 본다
const shortSrc = k => `shorts/${encodeURIComponent(shortSlug(k))}.mp4?v=${haveShort[k]}`
function shortsBand(keys) {
  const ks = keys.filter(k => haveShort[k])
  if (!ks.length) return ''
  return `<section class="d-shorts" aria-label="60초 쇼츠">${player(`${shortSrc(ks[0])}#t=1.5`)}` +
    `<div class="d-shorts-text"><div class="d-shorts-eyebrow">60초 쇼츠 · 이 기록의 개념</div><h3 data-sh-title>${esc(ks[0])}</h3><p>문제 → 핵심 → 실제 예 → 반전 → 결과 순서로 보고, 마지막 질문의 답은 아래 면접 꼬리 질문에서 확인한다.</p>` +
    (ks.length > 1 ? `<div class="d-shorts-pick">${ks.map((k, j) => `<button type="button" data-play="${esc(k)}" aria-pressed="${j === 0}">${icon('play')} ${esc(k)}</button>`).join('')}</div>` : '') +
    `<div class="sh-nexts" data-next>${nextRow(ks[0])}</div></div></section>`
}

detail.addEventListener('click', async e => {
  const play = e.target.closest('[data-play]')
  if (play) {
    // 위 띠의 개념 고르기·다음 편/이전 편 — 같은 플레이어에서 영상만 바꾼다(꼬리 질문 쪽 플레이어도 같다)
    const box = play.closest('.d-shorts, .sh'), v = box.querySelector('video'), k = play.dataset.play
    v.src = shortSrc(k); v.play().catch(() => {})
    const title = box.querySelector('[data-sh-title]')
    if (title) title.textContent = k
    box.querySelectorAll('.d-shorts-pick [data-play]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.play === k)))
    box.querySelector('[data-next]').innerHTML = nextRow(k)
    return
  }
  const btn = e.target.closest('.sh-btn')
  if (btn) {
    const panel = btn.nextElementSibling
    panel.hidden = !panel.hidden
    btn.setAttribute('aria-expanded', String(!panel.hidden))
    if (!panel.hidden) { panel.innerHTML = shortPanel(btn.dataset.short); if (SERVED) pollShorts() }
    return
  }
  const make = e.target.closest('[data-make]')
  if (!make) return
  const k = make.closest('.sh').dataset.panel
  make.disabled = true
  try {
    const r = await fetch(`api/shorts?name=${encodeURIComponent(k)}`, { method: 'POST' })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText)
    shortJobs[k] = { state: 'queued' }
  } catch (err) { shortJobs[k] = { state: 'failed', error: err.message } }
  refreshPanels(); pollShorts()
})
if (SERVED) pollShorts()

// 쇼츠 플레이어 — 브라우저 기본 조작 대신 페이지에 맞춘 조작판. 세로 영상(9:16)이라 위 줄에 재생 위치, 아래 줄에 시간·속도·소리·전체 화면
// 재생/멈춤은 아래 줄 첫 단추와 영상 누르기. 가운데에는 단추를 두지 않는다 — 멈춘 장면의 그림·글자를 가렸다(2026-10-13). 누르면 가운데에 아이콘이 잠깐 떴다 사라진다
// 재생 중에는 마우스가 멈추면 조작판이 숨는다
// 키보드(플레이어에 포커스): Space·K 재생/멈춤, ← → 5초, M 소리, F 전체 화면
const RATES = [1, 1.25, 1.5, 2]
const clock = s => Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00'
const player = src => `<div class="vp" data-state="paused" tabindex="0" role="group" aria-label="쇼츠 영상 — Space 재생, ← → 5초">` +
  `<video src="${src}" playsinline preload="metadata"></video>` +
  `<div class="vp-bar"><input class="vp-seek" type="range" min="0" max="1000" value="0" aria-label="재생 위치">` +
  `<div class="vp-row"><button type="button" class="vp-btn vp-play" data-vp="toggle" data-ic="play" aria-label="재생">${icon('play')}</button><span class="vp-time num">0:00 / 0:00</span>` +
  `<button type="button" class="vp-btn vp-rate" data-vp="rate" aria-label="재생 속도 1배">1×</button>` +
  `<button type="button" class="vp-btn" data-vp="mute" data-ic="volume" aria-label="소리 끄기">${icon('volume')}</button>` +
  `<button type="button" class="vp-btn" data-vp="full" data-ic="full" aria-label="전체 화면">${icon('full')}</button></div></div></div>`

function vpPaint(vp) {
  const v = vp.querySelector('video'), d = v.duration, t = v.currentTime
  const state = v.ended ? 'ended' : v.paused ? 'paused' : 'playing'
  // 아이콘은 바뀔 때만 다시 그린다 — 재생 중 1초에 몇 번씩 불려 아이콘 등장 움직임이 되풀이되지 않게
  const swap = (el, name, label) => { if (el.dataset.ic !== name) { el.dataset.ic = name; el.innerHTML = icon(name) } el.setAttribute('aria-label', label) }
  vp.dataset.state = state
  swap(vp.querySelector('.vp-play'), state === 'playing' ? 'pause' : state === 'ended' ? 'replay' : 'play', state === 'playing' ? '멈춤' : state === 'ended' ? '다시 보기' : '재생')
  const seek = vp.querySelector('.vp-seek')
  if (document.activeElement !== seek) seek.value = d ? Math.round(t / d * 1000) : 0
  vp.style.setProperty('--p', `${seek.value / 10}%`)
  vp.querySelector('.vp-time').textContent = `${clock(t)} / ${clock(d)}`
  swap(vp.querySelector('[data-vp="mute"]'), v.muted ? 'mute' : 'volume', v.muted ? '소리 켜기' : '소리 끄기')
  const full = document.fullscreenElement === vp
  swap(vp.querySelector('[data-vp="full"]'), full ? 'unfull' : 'full', full ? '전체 화면 끝내기' : '전체 화면')
}
function vpDo(vp, act) {
  const v = vp.querySelector('video')
  if (act === 'toggle') {
    const start = v.paused || v.ended
    if (v.ended) v.currentTime = 0
    start ? v.play().catch(() => {}) : v.pause()
    if (!calm()) { vp.querySelector('.vp-flash')?.remove(); vp.insertAdjacentHTML('beforeend', `<span class="vp-flash" aria-hidden="true">${icon(start ? 'play' : 'pause')}</span>`) } // 누른 것을 가운데에 잠깐 보여 준다(motion.css 가 0.6초에 지운다)
  }
  if (act === 'rate') {
    v.playbackRate = RATES[(RATES.indexOf(v.playbackRate) + 1) % RATES.length]
    const b = vp.querySelector('.vp-rate'); b.textContent = `${v.playbackRate}×`; b.setAttribute('aria-label', `재생 속도 ${v.playbackRate}배`)
  }
  if (act === 'mute') v.muted = !v.muted
  if (act === 'full') {
    if (document.fullscreenElement === vp) document.exitFullscreen()
    else if (vp.requestFullscreen) vp.requestFullscreen().catch(() => {})
    else v.webkitEnterFullscreen?.() // 아이폰 Safari 는 영상만 전체 화면이 된다
  }
  vpPaint(vp)
}
// 조작판 — 움직이면 보이고 1.8초 가만있으면 숨는다(멈춰 있을 때는 늘 보인다)
let vpIdle = null
function vpWake(vp) { vp.classList.add('awake'); clearTimeout(vpIdle); vpIdle = setTimeout(() => vp.classList.remove('awake'), 1800) }

detail.addEventListener('click', e => {
  const vp = e.target.closest('.vp')
  if (!vp) return
  const b = e.target.closest('[data-vp]')
  if (b) return vpDo(vp, b.dataset.vp)
  if (e.target.tagName === 'VIDEO') vpDo(vp, 'toggle') // 영상 아무 데나 눌러도 재생/멈춤
})
detail.addEventListener('input', e => {
  if (!e.target.matches('.vp-seek')) return
  const vp = e.target.closest('.vp'), v = vp.querySelector('video')
  if (v.duration) v.currentTime = e.target.value / 1000 * v.duration
  vpPaint(vp)
})
detail.addEventListener('pointermove', e => { const vp = e.target.closest('.vp'); if (vp) vpWake(vp) })
detail.addEventListener('keydown', e => {
  const vp = e.target.closest('.vp')
  if (!vp || e.metaKey || e.ctrlKey || e.altKey) return
  const v = vp.querySelector('video'), k = e.key.toLowerCase()
  if (e.target.matches('.vp-seek') && ['arrowleft', 'arrowright'].includes(k)) return // 위치 막대는 제 화살표를 쓴다
  if ((k === ' ' && !e.target.closest('button')) || k === 'k') vpDo(vp, 'toggle')
  else if (k === 'arrowleft' || k === 'arrowright') v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + (k === 'arrowleft' ? -5 : 5)))
  else if (k === 'm') vpDo(vp, 'mute')
  else if (k === 'f') vpDo(vp, 'full')
  else return
  e.preventDefault(); e.stopPropagation(); vpWake(vp)
})
// 영상 사건은 거품이 안 올라와 잡는 단계(capture)로 받는다. 하나를 틀면 다른 영상은 멈춘다
for (const ev of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'volumechange', 'seeked'])
  detail.addEventListener(ev, e => {
    const vp = e.target.closest?.('.vp')
    if (!vp) return
    if (ev === 'play') { for (const o of detail.querySelectorAll('.vp video')) if (o !== e.target) o.pause(); vpWake(vp) }
    vpPaint(vp)
  }, true)
document.addEventListener('fullscreenchange', () => detail.querySelectorAll('.vp').forEach(vpPaint))
