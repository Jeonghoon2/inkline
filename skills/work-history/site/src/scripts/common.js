// 공통 — build.mjs가 DATA 자리를 기록 JSON으로 바꾼다. 아래 파일들은 한 <script>에 이어 붙어 같은 범위를 쓴다
const DATA = /*__DATA__*/null
const TYPE_COLOR = { 기능: 'var(--t-feat)', 수정: 'var(--t-fix)', 성능: 'var(--t-perf)', 배포: 'var(--t-ship)', 문서: 'var(--t-doc)', 트러블슈팅: 'var(--t-trouble)' }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// 아이콘 — Lucide(ISC) 의 선 그림을 그대로 넣는다. 이모지·기호 글자는 글꼴·OS 마다 모양이 달라 쓰지 않는다
const ICON = {
  play: '<path class="f" d="M6 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L7.5 3.64A1 1 0 0 0 6 4.5Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  pause: '<rect class="f" x="6" y="4" width="4" height="16" rx="1"/><rect class="f" x="14" y="4" width="4" height="16" rx="1"/>',
  replay: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  volume: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.7"/>',
  mute: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="m22 9-6 6M16 9l6 6"/>',
  full: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  unfull: '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m8 0v-3a2 2 0 0 1 2-2h3"/>',
}
const icon = (name, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`
// 화면 전환 — 바뀌기 전·후를 브라우저가 이어 그린다(View Transitions). 지원 안 하거나 '동작 줄이기'면 바로 바꾼다
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const vt = fn => document.startViewTransition && !calm() && !document.hidden ? document.startViewTransition(fn) : fn() // 숨은 탭에서는 전환이 거절돼 오류만 남는다
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const entries = DATA?.entries ?? []
const cats = [...new Set(entries.map(e => e.category))].sort()

// 형광펜 — 기록의 '==보이는 글자|개념 이름==' (이름을 빼면 글자가 곧 이름). 올리면 concepts.md 의 원리가 뜬다
const concepts = DATA?.concepts ?? {}
const CONCEPT = /==([^=|]+?)(?:\|([^=]+?))?==/g
const plain = s => String(s ?? '').replace(CONCEPT, '$1')
const conceptKeys = s => [...new Set([...String(s ?? '').matchAll(CONCEPT)].map(m => (m[2] ?? m[1]).trim()))].filter(k => concepts[k])
const hl = html => html.replace(CONCEPT, (_, text, key = text) => `<mark class="cc" tabindex="0" data-c="${key.trim()}">${text}</mark>`) // esc 뒤에 부른다
const tip = Object.assign(document.createElement('div'), { id: 'tip', hidden: true })
tip.setAttribute('role', 'tooltip')
function showTip(m) {
  const c = concepts[m.dataset.c]
  if (!c) return
  tip.innerHTML = `<b>${esc(m.dataset.c)}</b>${c.why.split('\n').map(p => `<p>${esc(p)}</p>`).join('')}${c.qs.length ? `<small>면접 꼬리 질문 ${c.qs.length}개 — 상세 창 맨 아래</small>` : ''}`
  ;(m.closest('dialog') ?? document.body).append(tip) // 상세 창(dialog)은 맨 위 층이라 그 안에 붙여야 보인다
  tip.hidden = false
  m.setAttribute('aria-describedby', 'tip')
  const r = m.getBoundingClientRect()
  tip.style.left = Math.max(8, Math.min(r.left, innerWidth - tip.offsetWidth - 8)) + 'px'
  tip.style.top = (r.bottom + tip.offsetHeight + 12 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - tip.offsetHeight - 6)) + 'px'
}
const hideTip = () => { tip.hidden = true }
document.addEventListener('mouseover', e => { const m = e.target.closest?.('.cc'); if (m) showTip(m) })
document.addEventListener('focusin', e => { const m = e.target.closest?.('.cc'); if (m) showTip(m) })
document.addEventListener('mouseout', e => { if (e.target.closest?.('.cc')) hideTip() })
document.addEventListener('focusout', hideTip)
addEventListener('scroll', hideTip, true)

// 주간 보고 — 굵게(**), 목록(-), 들여쓴 줄만 간단히
function md(text) {
  const lines = text.split('\n')
  let out = '', inList = ''
  const inline = s => hl(esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'))
  const open = tag => { if (inList !== tag) { if (inList) out += `</${inList}>`; out += tag === 'ol' ? '<ol class="steps">' : '<ul>'; inList = tag } }
  for (const raw of lines) {
    const l = raw.trimEnd()
    if (/^\s*- /.test(l)) { open('ul'); out += `<li${/^\s{2,}- /.test(l) ? ' class="sub"' : ''}>${inline(l.replace(/^\s*- /, ''))}</li>`; continue } // 들여쓴 줄은 하위 줄(주간 보고의 참고 · 채택 · 이유 · 이점)
    if (/^\s*\d+\. /.test(l)) { open('ol'); out += `<li>${inline(l.replace(/^\s*\d+\. /, ''))}</li>`; continue } // 트러블슈팅 '해결 과정' 같은 번호 목록
    if (inList) { out += `</${inList}>`; inList = '' }
    if (/^# /.test(l)) out += `<h2>${inline(l.slice(2))}</h2>`
    else if (l.trim()) out += `<p>${inline(l)}</p>`
  }
  return out + (inList ? `</${inList}>` : '')
}
