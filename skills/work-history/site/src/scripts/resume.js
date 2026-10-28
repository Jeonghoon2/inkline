// 이력서 — resume.md: '# 이름', '> 소개', 그 아래 '- 항목: 값' 연락처, '## 구역',
// '### 회사'(경력 구역) 밑에 '#### 프로젝트', 각각 '기간:'·'역할:'·'기술:' 줄과 '- 성과'. [대괄호]는 아직 안 채운 칸
// 프로젝트 새 꼴(RESUME-GUIDE '프로젝트 쓰는 꼴'): '### 이름' → '소속: 회사 / 기간: YYYY.MM - 현재' → '**Description**' 문단 →
// '**What did I do**' 목록 → '***Skills***: a, b'. 옛 꼴(기간:·역할:·기술: 줄)도 그대로 그린다
// 원티드 이력서 같은 1단 문서 — 이름·연락처·소개 → 구역이 위에서 아래로. 기술 구역의 '- 분류: a, b' 는 칩
// 직무별 이력서 resume/<직무>.md 는 위 직무 칩으로 바꿔 보고, 그 파일의 '## 보완할 경험' 은 오른쪽 아래 말풍선으로만 보인다(아래 cvSplit)
const CV_SKILL = /기술|스킬/
// '2024.03 ~ 현재' → 달 수(시작·끝 달 포함). 못 읽으면 0
const cvMonths = p => {
  const m = String(p).match(/(\d{4})\.(\d{1,2})\s*[~-]\s*(?:(\d{4})\.(\d{1,2})|현재)/)
  if (!m) return 0
  const now = new Date(DATA?.built ?? Date.now())
  const [y, mo] = m[3] ? [+m[3], +m[4]] : [now.getFullYear(), now.getMonth() + 1]
  return Math.max(0, (y - m[1]) * 12 + (mo - m[2]) + 1)
}
const cvSpan = n => [n >= 12 && `${Math.floor(n / 12)}년`, n % 12 && `${n % 12}개월`].filter(Boolean).join(' ')
function renderResume(text, file = 'resume.md') {
  if (!text.trim()) return `<div class="empty">~/My-History/${esc(file)} 를 만들면 여기에 이력서가 보입니다</div>`
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]/g, '<span class="cv-blank">[$1]</span>')
  let name = '', intro = '', contact = [], sec = null, proj = null, list = []
  const secs = []
  const out = html => { if (proj) proj.html += html; else if (sec) sec.html += html }
  // 칩 사이 쉼표는 화면에서 숨기고 인쇄에서만 보인다 — PDF 글자 추출이 칩을 'React, TypeScript' 한 줄로 읽게(칩 칸만 있으면 단처럼 섞여 읽혔다)
  const chips = xs => `<ul class="cv-chips">${xs.map((t, i) => `<li>${inline(t)}${i < xs.length - 1 ? '<span class="cv-sep">, </span>' : ''}</li>`).join('')}</ul>`
  const flushList = () => {
    if (!list.length) return
    if (sec && CV_SKILL.test(sec.name) && !proj) {
      // 'a: x, y' 는 분류 이름 + 칩 한 줄, 콜론 없는 줄은 이름 없는 칩 한 줄로 모은다. 괄호 안 쉼표는 나누지 않는다
      const split = s => s.split(/,\s*(?![^()]*\))/).map(t => t.trim()).filter(Boolean)
      const kv = list.map(l => l.match(/^([^:]+):\s*(.+)/))
      const bare = list.filter((_, i) => !kv[i])
      out(kv.filter(Boolean).map(m => `<div class="cv-skill"><span class="cv-skill-k">${inline(m[1])}<span class="cv-sep">: </span></span>${chips(split(m[2]))}</div>`).join('') +
        (bare.length ? `<div class="cv-skill"><span class="cv-skill-k"></span>${chips(bare)}</div>` : ''))
    } else out(`<ul>${list.map(l => `<li>${inline(l)}</li>`).join('')}</ul>`)
    list = []
  }
  const flushProj = () => {
    flushList()
    if (!proj) return
    const n = cvMonths(proj.period)
    const used = proj.stack.length ? `<ul class="cv-used"><li>사용 기술: ${proj.stack.map(inline).join(', ')}</li></ul>` : ''
    if (proj.org) {
      // 회사 — 왼쪽 아이콘 칸 + 이름 / '기간 (n년 m개월) | 역할'
      const meta = [proj.period && `${inline(proj.period)}${n ? ` (${cvSpan(n)})` : ''}`, proj.role && inline(proj.role)].filter(Boolean)
      sec.html += `<div class="cv-org"><span class="cv-tile">${icon('briefcase')}</span><div class="cv-org-body"><h3>${inline(proj.title)}</h3>` +
        `${meta.length ? `<p class="cv-meta num">${meta.map(m => `<span>${m}</span>`).join(' ')}</p>` : ''}${used}${proj.html}</div></div>`
      sec.months = (sec.months ?? 0) + n // ponytail: 겹친 재직 기간은 두 번 센다, 겹치면 달 집합으로 세기
    } else {
      const h = proj.sub ? 'h4' : 'h3'
      // 새 꼴의 회색 머리 줄 '소속 예시회사 │ 2026.09 - 현재 (2개월)', 옛 꼴은 기간만
      const date = proj.at ? `<p class="cv-pmeta num"><span>${inline(proj.at[0])} ${inline(proj.at[1])}</span> <span>${inline(proj.period)}${n ? ` (${cvSpan(n)})` : ''}</span></p>`
        : proj.period ? `<p class="cv-date num">${inline(proj.period)}</p>` : ''
      const skills = proj.skills ? `<div class="cv-pskills"><p class="cv-part">Skills</p>${chips(proj.skills)}</div>` : ''
      sec.html += `<div class="cv-proj${proj.sub ? ' is-sub' : ''}"><${h}>${inline(proj.title)}</${h}>` +
        `${date}${proj.role ? `<p class="cv-role">${inline(proj.role)}</p>` : ''}${proj.html}${used}${skills}</div>`
    }
    proj = null
  }
  for (const raw of text.split('\n')) {
    const l = raw.trimEnd()
    if (/^# /.test(l)) { name = `<h1 class="cv-name">${inline(l.slice(2))}</h1>`; continue }
    if (/^> /.test(l)) { intro += `<p class="cv-intro">${inline(l.slice(2))}</p>`; continue }
    if (/^## /.test(l)) { flushProj(); sec = { name: l.slice(3).trim(), html: '' }; secs.push(sec); continue }
    if (/^#{3,4} /.test(l)) {
      flushProj()
      const sub = l.startsWith('#### ')
      proj = { title: l.replace(/^#{3,4} /, ''), sub, org: !sub && /경력/.test(sec?.name ?? ''), period: '', role: '', stack: [], html: '' }
      continue
    }
    const at = proj && l.match(/^(소속|고객사|회사):\s*(.+?)\s*\/\s*기간:\s*(.+)$/)
    if (at) { proj.at = [at[1], at[2]]; proj.period = at[3]; continue }
    const part = proj && l.match(/^\*\*(Description|What did I do)\*\*\s*$/)
    if (part) { flushList(); proj.part = part[1]; out(`<p class="cv-part">${part[1]}</p>`); continue }
    const sk = proj && l.match(/^\*{2,3}Skills\*{2,3}:\s*(.*)/)
    if (sk) { flushList(); proj.skills = sk[1].split(/,\s*(?![^()]*\))/).map(t => t.trim()).filter(Boolean); continue }
    const kv = proj && l.match(/^(기간|역할|기술):\s*(.*)/)
    if (kv) { if (kv[1] === '기술') proj.stack = kv[2].split(',').map(s => s.trim()).filter(Boolean); else proj[kv[1] === '기간' ? 'period' : 'role'] = kv[2]; continue }
    if (/^- /.test(l)) {
      if (!sec) {
        const m = l.slice(2).match(/^([^:]+):\s*(.*)/)
        const k = m ? m[1].trim() : ''
        // 항목 이름(GitHub 등)은 화면에선 아이콘, 인쇄에선 글자 — 아이콘만 있으면 PDF 에 이름이 남지 않는다
        contact.push(`<li>${k ? `<span role="img" aria-label="${esc(k)}" title="${esc(k)}">${icon(/메일|mail/i.test(k) ? 'mail' : 'link')}</span><span class="cv-ck">${esc(k)}: </span>` : ''}${inline(m ? m[2] : l.slice(2))}</li>`)
      } else list.push(l.slice(2))
      continue
    }
    if (l.trim()) { flushList(); out(`<p${proj?.part === 'Description' ? ' class="cv-desc"' : ''}>${inline(l)}</p>`) }
  }
  flushProj()
  const body = secs.map(s => `<section class="cv-sec"><h2>${inline(s.name)}${s.months ? ` <small class="num">${cvSpan(s.months)}</small>` : ''}</h2>${s.html}</section>`).join('')
  return `<div class="cv-tools"><span>~/My-History/${esc(file)} 를 고치고 build.mjs 를 다시 돌리면 바뀝니다</span><button type="button" onclick="window.print()">PDF로 저장</button></div>` +
    `<article class="cv"><header class="cv-head">${name}${contact.length ? `<ul class="cv-contact">${contact.join('')}</ul>` : ''}${intro}</header>${body}</article>`
}
// 직무별 이력서 — resume/<직무>.md. 이름·연락처가 없으면 resume.md 의 것을 쓴다(연락처를 한 곳에서만 고치게)
const CV_ROLES = { backend: '백엔드', frontend: '프론트엔드', 'data-engineer': '데이터 엔지니어', 'ai-engineer': 'AI 엔지니어' }
// '## 보완할 경험' 구역은 이력서(화면·인쇄)에 그리지 않고 오른쪽 아래 말풍선으로 — '### 무리' 아래 '- 항목'
function cvSplit(text) {
  let gap = false
  const doc = [], groups = []
  for (const l of text.split('\n')) {
    if (/^## /.test(l)) gap = /^## 보완할 경험\s*$/.test(l)
    if (!gap) { doc.push(l); continue }
    const h = l.match(/^### (.+)/)
    if (h) groups.push({ name: h[1].trim(), items: [] })
    else if (/^- /.test(l)) { if (!groups.length) groups.push({ name: '', items: [] }); groups.at(-1).items.push(l.slice(2)) }
  }
  return [doc.join('\n'), groups.filter(g => g.items.length)]
}
const cvBase = DATA?.resume ?? ''
const cvHead = cvBase.split(/^## /m)[0].split('\n').filter(l => /^(# |- )/.test(l)).join('\n')
const cvList = [{ slug: '', label: '기본', file: 'resume.md', text: cvBase }, ...(DATA?.roles ?? [])
  .map(r => ({ slug: r.slug, label: CV_ROLES[r.slug] ?? r.slug, file: `resume/${r.slug}.md`, text: /^# /m.test(r.text) ? r.text : `${cvHead}\n${r.text}` }))
  .sort((a, b) => (Object.keys(CV_ROLES).indexOf(a.slug) + 1 || 99) - (Object.keys(CV_ROLES).indexOf(b.slug) + 1 || 99) || a.slug.localeCompare(b.slug))]
function gapHtml(role, groups) {
  if (!groups.length) return ''
  const lack = groups.find(g => /부족/.test(g.name)) ?? groups[0]
  const li = s => `<li>${esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`
  return `<div class="gap-panel" id="gapPanel" role="region" aria-label="보완할 경험 — ${esc(role.label)}" hidden>` +
    `<p class="gap-head"><b>보완할 경험</b><span>${esc(role.label)}</span></p><p class="gap-note">기록에서 근거를 찾지 못한 점검표 항목과, 지금 프로젝트로 해 볼 만한 다음 걸음</p>` +
    groups.map(g => `<section>${g.name ? `<h3>${esc(g.name)} <span class="num">${g.items.length}</span></h3>` : ''}<ul>${g.items.map(li).join('')}</ul></section>`).join('') +
    `</div><button type="button" class="gap-btn" aria-expanded="false" aria-controls="gapPanel" aria-label="보완할 경험 ${lack.items.length}개 보기">${icon('bulb')}<span class="gap-label">보완할 경험</span><b class="num">${lack.items.length}</b></button>`
}
const resumeEl = document.getElementById('resume')
let cvPick = ''
try { cvPick = localStorage.getItem('mh-cv-role') ?? '' } catch {}
const cvHash = location.hash.match(/^#cv=([a-z0-9-]*)$/) // 주소 끝 '#cv=backend' 로 직무를 바로 연다(링크·머리 없는 Chrome 인쇄용)
if (cvHash) cvPick = cvHash[1]
if (!cvList.some(r => r.slug === cvPick)) cvPick = ''
function showResume() {
  const role = cvList.find(r => r.slug === cvPick)
  const [doc, groups] = cvSplit(role.text)
  resumeEl.querySelector('.cv-doc').innerHTML = renderResume(doc, role.file)
  gapBox.innerHTML = gapHtml(role, groups)
  gapBox.hidden = !groups.length
  resumeEl.querySelectorAll('.cv-roles button').forEach(b => b.setAttribute('aria-pressed', b.dataset.role === cvPick))
}
resumeEl.innerHTML = (cvList.length > 1 ? `<div class="cv-roles" role="group" aria-label="직무별 이력서">${cvList.map(r => `<button type="button" data-role="${esc(r.slug)}">${esc(r.label)}</button>`).join('')}</div>` : '') +
  '<div class="cv-doc"></div><div class="gap" id="gap" hidden></div>'
const gapBox = resumeEl.querySelector('.gap')
resumeEl.querySelector('.cv-roles')?.addEventListener('click', e => {
  const b = e.target.closest('button')
  if (!b || b.dataset.role === cvPick) return
  cvPick = b.dataset.role
  try { localStorage.setItem('mh-cv-role', cvPick) } catch {}
  vt(showResume)
})
// 보완할 경험 말풍선 — 마우스를 올리면 열리고(떼면 0.25초 뒤 닫힘), 누르면 고정, 다시 누르거나 Esc·바깥을 누르면 닫힌다
let gapPinned = false, gapTimer
const gapSet = open => { const p = gapBox.querySelector('.gap-panel'); if (!p) return; p.hidden = !open; gapBox.querySelector('.gap-btn').setAttribute('aria-expanded', open) }
if (matchMedia('(hover: hover)').matches) {
  gapBox.addEventListener('mouseenter', () => { clearTimeout(gapTimer); gapSet(true) })
  gapBox.addEventListener('mouseleave', () => { if (!gapPinned) gapTimer = setTimeout(() => gapSet(false), 250) })
}
gapBox.addEventListener('click', e => { if (!e.target.closest('.gap-btn')) return; gapPinned = !gapPinned; gapSet(gapPinned) })
gapBox.addEventListener('keydown', e => { if (e.key === 'Escape') { gapPinned = false; gapSet(false); gapBox.querySelector('.gap-btn')?.focus() } })
document.addEventListener('click', e => { if (gapPinned && !gapBox.contains(e.target)) { gapPinned = false; gapSet(false) } })
showResume()
