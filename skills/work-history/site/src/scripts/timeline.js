// 타임라인 탭 — 개요(이번 주·활동 지도·숫자)·종류 탭·거르기·카드/압축 목록·상세 창
const TYPE_ORDER = ['기능', '배포', '수정', '문서', '성능', '트러블슈팅']
const types = [...new Set([...TYPE_ORDER, ...entries.map(e => e.type)].filter(t => t && entries.some(e => e.type === t)))]
const state = { cat: null, type: null, tag: null, day: null, q: '', view: 'card' }
try { if (localStorage.getItem('mh-view') === 'compact') state.view = 'compact' } catch { /* 저장소를 못 쓰면 카드로 */ }
const hasTag = (e, tag) => e.tags.some(t => t.major === tag || `${t.major} - ${t.minor}` === tag)
const badge = t => t ? `<span class="b" style="--t:${TYPE_COLOR[t] ?? 'var(--t-etc)'}">${esc(t)}</span>` : ''
const keysOf = e => conceptKeys([e.body, ...Object.values(e.sections)].join('\n'))
const toDay = s => new Date(s + 'T00:00:00')
const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const md2 = d => `${d.getMonth() + 1}.${d.getDate()}`
const tally = (xs, f) => xs.reduce((m, x) => (m[f(x)] = (m[f(x)] ?? 0) + 1, m), {})

// 개요 — 이번 주(월요일부터 오늘까지), 최근 8주 활동 지도(하루 기록 수), 숫자 4칸
function renderOverview() {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const mon = new Date(today); mon.setDate(today.getDate() - (today.getDay() + 6) % 7)
  const week = entries.filter(e => toDay(e.date) >= mon)
  const byType = tally(week, e => e.type), byCat = tally(week, e => e.category), perDay = tally(entries, e => e.date)
  const shade = n => `var(--heat${n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4})`
  const WEEKS = 8, cols = []
  for (let w = WEEKS - 1; w >= 0; w--) {
    const start = new Date(mon); start.setDate(mon.getDate() - w * 7)
    let cells = ''
    for (let d = 0; d < 7; d++) {
      const t = new Date(start); t.setDate(start.getDate() + d)
      const k = dkey(t), n = perDay[k] ?? 0, future = t > today
      cells += n && !future // 기록 있는 날은 단추 — 누르면 그날 기록만 본다(다시 누르면 풀림)
        ? `<button type="button" class="heat" data-day="${k}" aria-pressed="${state.day === k}" title="${md2(t)} · ${n}건 — 눌러서 이 날만 보기" aria-label="${md2(t)} ${n}건" style="background:${shade(n)};--c:${WEEKS - 1 - w + d}"></button>`
        : `<span class="${future ? 'heat future' : 'heat'}" title="${md2(t)} · ${future ? '아직' : `${n}건`}" style="--c:${WEEKS - 1 - w + d};${future ? '' : `background:${shade(n)}`}"></span>`
    }
    const prev = new Date(start); prev.setDate(start.getDate() - 7)
    const label = w === WEEKS - 1 || prev.getMonth() !== start.getMonth() ? `${start.getMonth() + 1}월` : '' // 달이 바뀌는 주에만 — 주마다 날짜를 적으면 칸이 좁아 겹친다
    cols.push(`<div class="heat-col">${cells}<span class="heat-label">${label}</span></div>`)
  }
  const [peakDay, peak] = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const stat = (n, l) => `<div class="ov-card ov-stat"><b class="mono">${n}</b><span>${l}</span></div>`
  document.getElementById('overview').innerHTML =
    `<div class="ov-card ov-week"><div class="ov-h"><span>이번 주</span><span class="num">${md2(mon)} – ${md2(today)}</span></div>` +
    `<div class="ov-big"><b class="mono">${week.length}</b><span>건${Object.entries(byCat).map(([c, n]) => ` · ${esc(c)} ${n}`).join('')}</span></div>` +
    `<div class="ov-chips">${types.filter(t => byType[t]).map(t => badge(t).replace('</span>', ` ${byType[t]}</span>`)).join('') || '<span class="ov-none">아직 기록이 없어요</span>'}</div></div>` +
    `<div class="ov-card ov-map"><div class="ov-h"><span>활동 지도</span><span class="num">최근 ${WEEKS}주 · 하루 기록 수</span></div>` +
    `<div class="heat-grid" role="group" aria-label="최근 ${WEEKS}주 하루 기록 수 — 칸을 누르면 그날만 본다"><div class="heat-col heat-days" aria-hidden="true"><span>월</span><span></span><span>수</span><span></span><span>금</span><span></span><span>일</span></div>${cols.join('')}</div>` +
    `<div class="heat-legend" aria-hidden="true">적음${[0, 1, 2, 3, 4].map(i => `<span style="background:var(--heat${i})"></span>`).join('')}많음${peak ? ` · ${md2(toDay(peakDay))} 하루 ${peak}건이 가장 많다` : ''}</div></div>` +
    `<div class="ov-stats">${stat(entries.length, '기록')}${stat(Object.keys(perDay).length, '작업한 날')}${stat(Object.keys(concepts).length, '면접 개념')}${stat(Object.keys(haveShort).length, '60초 쇼츠')}</div>`
}

function matches(e, skipType) {
  const q = state.q.trim().toLowerCase()
  return (!state.cat || e.category === state.cat) && (skipType || !state.type || e.type === state.type) && (!state.tag || hasTag(e, state.tag)) && (!state.day || e.date === state.day) &&
    (!q || `${e.title} ${plain(e.body)} ${e.tags.map(t => `${t.major} ${t.minor}`).join(' ')} ${keysOf(e).join(' ')}`.toLowerCase().includes(q))
}

// 거르기 — 종류 탭(건수는 지금 다른 거르기를 반영), 프로젝트, 분류(상세 창에서 누른 것), 검색, 카드/압축
function renderTypes() {
  const pool = entries.filter(e => matches(e, true)), n = tally(pool, e => e.type)
  const tab = (v, label, count) => `<button type="button" data-g="type" data-v="${esc(v ?? '')}" aria-pressed="${state.type === v}">${esc(label)} <span class="num">${count}</span></button>`
  document.getElementById('ftypes').innerHTML = tab(null, '전체', pool.length) + types.map(t => tab(t, t, n[t] ?? 0)).join('')
}
function renderFilters() {
  document.getElementById('filters').innerHTML =
    '<div class="ftypes" id="ftypes" role="group" aria-label="종류"></div><div class="fright">' +
    (state.day ? `<button type="button" class="ftag" data-g="day" data-v="" title="날짜 거르기 풀기">날짜: ${md2(toDay(state.day))} ${icon('x')}</button>` : '') +
    (state.tag ? `<button type="button" class="ftag" data-g="tag" data-v="" title="분류 거르기 풀기">분류: ${esc(state.tag)} ${icon('x')}</button>` : '') +
    `<label class="sr" for="fcat">프로젝트</label><select id="fcat"><option value="">모든 프로젝트</option>${cats.map(c => `<option${state.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` +
    `<label class="sr" for="q">검색</label><input id="q" type="search" placeholder="검색 — 제목·내용·개념  ( / )" aria-keyshortcuts="/" value="${esc(state.q)}">` +
    `<div class="fview" role="group" aria-label="보기"><button type="button" data-view="card" aria-pressed="${state.view === 'card'}">카드</button><button type="button" data-view="compact" aria-pressed="${state.view === 'compact'}">압축</button></div></div>`
  renderTypes()
  document.getElementById('q').addEventListener('input', e => { state.q = e.target.value; renderTypes(); renderList() })
  document.getElementById('fcat').addEventListener('change', e => { state.cat = e.target.value || null; renderTypes(); renderList() })
}
document.getElementById('filters').addEventListener('click', e => {
  const v = e.target.closest('[data-view]')
  if (v) { state.view = v.dataset.view; try { localStorage.setItem('mh-view', state.view) } catch { /* 저장 못 해도 이번엔 바뀐다 */ } return vt(() => { renderFilters(); renderList() }) }
  const b = e.target.closest('[data-g]')
  if (!b) return
  vt(() => {
    state[b.dataset.g] = b.dataset.v || null
    if (b.dataset.g === 'type') renderTypes(); else renderFilters()
    if (b.dataset.g === 'day') renderOverview()
    renderList()
  })
})

// 목록 — 달 → 날짜 칸(날짜·요일·건수) → 카드 또는 한 줄
function renderList() {
  const shown = entries.filter(e => matches(e))
  const list = document.getElementById('list')
  if (!shown.length) return void (list.innerHTML = '<div class="empty">맞는 기록이 없습니다</div>')
  const days = []
  for (const e of shown) (days.at(-1)?.date === e.date ? days.at(-1).items : (days.push({ date: e.date, items: [] }), days.at(-1).items)).push(e)
  const compact = state.view === 'compact'
  let html = '', month = ''
  for (const { date, items } of days) {
    if (date.slice(0, 7) !== month) { month = date.slice(0, 7); html += `<div class="month num">${month.replace('-', '년 ')}월</div>` }
    const d = toDay(date)
    html += `<div class="day${compact ? ' is-compact' : ''}"><div class="day-date"><b class="mono">${md2(d)}</b><small>${WEEK[d.getDay()]}요일 · ${items.length}건</small></div><div class="day-items">`
    for (const e of items) {
      const i = entries.indexOf(e), ks = keysOf(e), sh = ks.filter(k => haveShort[k]).length
      html += compact
        ? `<article class="row" tabindex="0" role="button" data-i="${i}" style="view-transition-name:e${i}"><span class="row-t">${esc(e.title)}</span><span class="cat">${esc(e.category)}</span>${badge(e.type)}</article>`
        : `<article class="item" tabindex="0" role="button" data-i="${i}" style="--t:${TYPE_COLOR[e.type] ?? 'var(--t-etc)'};view-transition-name:e${i}"><div class="item-head">${badge(e.type)}<span class="cat">${esc(e.category)}</span>` +
          `${ks.length ? `<span class="item-meta">개념 ${ks.length}${sh ? ` · ${icon('play')} 쇼츠 ${sh}` : ''}</span>` : ''}</div><h3>${esc(e.title)}</h3>${e.body ? `<p>${hl(esc(e.body))}</p>` : ''}</article>`
    }
    html += '</div></div>'
  }
  list.innerHTML = html
}

// 기록 상세 — 기사형 본문(라벨·제목·요약·쇼츠·섹션·면접 꼬리 질문) + 오른쪽(날짜·프로젝트·개념·같은 날 기록)
const detail = document.getElementById('detail')
const SECTIONS = ['수행 일지', '고민한 흔적', '성능 비교/평가/측정']
const TROUBLE_SECTIONS = ['상황', '문제', '해결 과정', '고민한 흔적', '성능 비교/평가/측정'] // 트러블슈팅은 상황 → 문제 → 해결 순
function openDetail(i) {
  const e = entries[i], keys = keysOf(e)
  const sameDay = entries.map((x, j) => [x, j]).filter(([x, j]) => j !== i && x.date === e.date)
  const base = e.type === '트러블슈팅' ? TROUBLE_SECTIONS : SECTIONS
  const order = [...base, ...Object.keys(e.sections).filter(k => !base.includes(k))]
  const tags = e.tags.map(t => { const v = t.minor ? `${t.major} - ${t.minor}` : t.major; return `<button type="button" class="d-tag" data-tag="${esc(v)}" title="이 분류로 거르기">${esc(t.major)}${t.minor ? ` · ${esc(t.minor)}` : ''}</button>` }).join('')
  // 면접 꼬리 질문 — 이 기록에 칠한 개념마다 원리와, 앞 질문을 파고드는 순서의 질문(답은 눌러서 펼침)
  const quiz = keys.map(k => `<div class="quiz"><div class="quiz-h"><h4><mark class="cc-h">${esc(k)}</mark></h4>${shortButton(k)}</div>${concepts[k].why.split('\n').map(p => `<p class="quiz-why">${esc(p)}</p>`).join('')}` +
    `<ol>${concepts[k].qs.map(q => `<li><details><summary>${icon('chevron')}${esc(q.q)}</summary><p>${esc(q.a)}</p></details></li>`).join('')}</ol></div>`).join('')
  // 이전·다음 기록 — 지금 목록(거르기 반영) 순서
  const shown = entries.filter(x => matches(x)), at = shown.indexOf(e)
  const step = (x, label, dir) => x ? `<button type="button" class="d-step" data-i="${entries.indexOf(x)}" title="${label} (${dir === 'prev' ? '←' : '→'} 키)">${dir === 'prev' ? icon('left') : ''}<span>${label}</span>${dir === 'next' ? icon('chevron') : ''}</button>` : '<span></span>'
  const d = toDay(e.date)
  detail.innerHTML = `<div class="d-progress" aria-hidden="true"></div><button class="close" type="button" aria-label="닫기">${icon('x')}</button><div class="detail-body">` +
    `<article class="d-main"><div class="d-badges">${badge(e.type)}${tags}</div><h2>${esc(e.title)}</h2>${e.body ? `<p class="d-lede">${hl(esc(e.body))}</p>` : ''}${shortsBand(keys)}` +
    order.filter(k => e.sections[k]?.trim()).map(k => `<section class="d-sec"><h3>${esc(k)}</h3>${md(e.sections[k])}</section>`).join('') +
    (quiz ? `<section class="d-quiz"><div class="d-quiz-h"><h3>면접 꼬리 질문</h3><span>개념 ${keys.length}개 · 질문을 누르면 답이 펼쳐진다</span></div>${quiz}</section>` : '') + '</article>' +
    `<aside class="d-rail"><dl class="d-meta"><dt>날짜</dt><dd class="num">${e.date.replaceAll('-', '.')} ${WEEK[d.getDay()]}요일</dd><dt>프로젝트</dt><dd><button type="button" class="d-link" data-cat="${esc(e.category)}">${esc(e.category)}</button></dd></dl>` +
    (keys.length ? `<div class="d-rail-sec"><h3>이 기록의 개념</h3><ul class="d-concepts">${keys.map(k => `<li><mark class="cc" tabindex="0" data-c="${esc(k)}">${esc(k)}</mark>${haveShort[k] ? `<span role="img" aria-label="쇼츠 있음">${icon('play')}</span>` : ''}</li>`).join('')}</ul></div>` : '') +
    (sameDay.length ? `<div class="d-rail-sec"><h3>같은 날 다른 기록</h3><ul class="d-same">${sameDay.map(([x, j]) => `<li>${badge(x.type)}<button type="button" data-i="${j}">${esc(x.title)}</button></li>`).join('')}</ul></div>` : '') +
    (at >= 0 && shown.length > 1 ? `<nav class="d-steps" aria-label="이전·다음 기록">${step(shown[at - 1], '이전 기록', 'prev')}${step(shown[at + 1], '다음 기록', 'next')}</nav>` : '') +
    '</aside></div>'
  if (!detail.open) detail.showModal()
  detail.querySelector('.detail-body').scrollTop = 0
  detail.querySelector('.close').focus()
}
detail.addEventListener('click', e => {
  if (e.target === detail || e.target.closest('.close')) return detail.close() // 바깥(배경) 클릭도 닫기
  const b = e.target.closest('[data-i], [data-cat], [data-tag]')
  if (!b) return
  if (b.dataset.i) return openDetail(+b.dataset.i)
  if (b.dataset.cat) state.cat = b.dataset.cat
  else state.tag = b.dataset.tag
  detail.close(); renderFilters(); renderList()
})
// 키보드 — 상세 창에서 ← → 로 이전·다음 기록, 목록에서 / 로 검색
detail.addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || e.target.closest('input, video, textarea, .vp') || e.altKey || e.metaKey) return
  const b = detail.querySelector(`.d-step[title^="${e.key === 'ArrowLeft' ? '이전' : '다음'}"]`)
  if (b) { e.preventDefault(); openDetail(+b.dataset.i) }
})
document.addEventListener('keydown', e => {
  if (e.key !== '/' || detail.open || e.target.closest('input, textarea, select') || document.getElementById('timeline').hidden) return
  e.preventDefault(); document.getElementById('q').focus()
})
// 활동 지도 칸 — 그날만 보기(다시 누르면 풀림)
document.getElementById('overview').addEventListener('click', e => {
  const c = e.target.closest('[data-day]')
  if (c) vt(() => { state.day = state.day === c.dataset.day ? null : c.dataset.day; renderOverview(); renderFilters(); renderList() })
})
const list = document.getElementById('list')
list.addEventListener('click', e => { const c = e.target.closest('[data-i]'); if (c) openDetail(+c.dataset.i) })
list.addEventListener('keydown', e => { const c = e.target.closest('[data-i]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(+c.dataset.i) } })
