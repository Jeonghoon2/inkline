// 시작 — 갱신 시각, 탭 전환, 첫 화면 그리기
if (DATA) {
  const b = new Date(DATA.built)
  document.getElementById('built').textContent = `MY HISTORY · 마지막 갱신 ${b.getMonth() + 1}.${b.getDate()} ${String(b.getHours()).padStart(2, '0')}:${String(b.getMinutes()).padStart(2, '0')}`
}
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button')
  if (!b) return
  vt(() => {
    document.querySelectorAll('.tabs button').forEach(x => { x.classList.toggle('on', x === b); x.toggleAttribute('aria-current', x === b) })
    for (const id of ['timeline', 'reports', 'resume']) document.getElementById(id).hidden = b.dataset.tab !== id
  })
})
// 라이트/다크 — 누르면 바꾸고 기억한다
const themeBtn = document.getElementById('theme')
const showTheme = () => {
  const dark = document.documentElement.dataset.theme === 'dark'
  themeBtn.innerHTML = icon(dark ? 'sun' : 'moon')
  themeBtn.setAttribute('aria-label', dark ? '라이트 테마로' : '다크 테마로')
  themeBtn.title = themeBtn.getAttribute('aria-label')
}
themeBtn.addEventListener('click', () => {
  const root = document.documentElement, next = root.dataset.theme === 'dark' ? 'light' : 'dark'
  try { localStorage.setItem('mh-theme', next) } catch {}
  const apply = () => { root.dataset.theme = next; showTheme() }
  if (!document.startViewTransition || calm() || document.hidden) return apply()
  // 단추 가운데서 원이 퍼지며 새 테마가 덮는다
  const r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  root.classList.add('vt-theme')
  const t = document.startViewTransition(apply)
  t.ready.then(() => root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] }, { duration: 500, easing: 'cubic-bezier(.2, .8, .2, 1)', pseudoElement: '::view-transition-new(root)' }))
  t.finished.finally(() => root.classList.remove('vt-theme'))
})
showTheme()
renderOverview(); renderFilters(); renderList()
// 첫 화면 — 머리말·개요·거르기가 차례로 떠오르고 활동 지도가 물결처럼 돋는다(motion.css 의 .intro). 끝나면 떼어 다시 그릴 때 되풀이하지 않는다
if (!calm()) { document.body.classList.add('intro'); setTimeout(() => document.body.classList.remove('intro'), 1600) }
// 맨 위로
const toTop = document.getElementById('toTop')
toTop.innerHTML = icon('up')
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }))
// 첫 화면 숫자 — 0 에서 제 값까지 올라간다(처음 한 번만)
if (!calm()) for (const b of document.querySelectorAll('.ov-big b, .ov-stat b')) {
  const to = +b.textContent, t0 = performance.now()
  if (!to) continue
  const tick = t => { const k = Math.min(1, (t - t0) / 700); b.textContent = Math.round(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}
