import type { editor as E } from 'monaco-editor'

import { t } from '../../shared/i18n.ts'

type Ed = E.IStandaloneCodeEditor
type M = typeof import('monaco-editor')
type St = { key: { set(v: boolean): void }; zone: string | null }
const states = new WeakMap<Ed, St>() // 편집기마다 context key · Esc 명령은 한 번만 만든다

const LIGHTBULB = ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4']

function icon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [k, v] of Object.entries({ width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
  for (const d of LIGHTBULB) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); svg.append(p) }
  return svg
}

export function hideBand(ed: Ed): void {
  const s = states.get(ed)
  if (!s) return
  s.key.set(false)
  const id = s.zone
  s.zone = null
  if (id) try { ed.changeViewZones(a => a.removeZone(id)) } catch { /* 이미 닫힌 편집기 */ }
}

// 커서 줄 아래에 띠를 보인다. 글은 textContent 로만 넣는다
export function showBand(ed: Ed, monaco: M, text: string): void {
  let s = states.get(ed)
  if (!s) {
    s = { key: ed.createContextKey('inklineNudge', false), zone: null }
    states.set(ed, s)
    ed.addCommand(monaco.KeyCode.Escape, () => hideBand(ed), 'inklineNudge && !findWidgetVisible && !suggestWidgetVisible && !parameterHintsVisible')
  }
  hideBand(ed)
  const dom = document.createElement('div')
  dom.className = 'nudge-band'
  dom.setAttribute('role', 'status')
  const card = document.createElement('div')
  card.className = 'nudge-card'
  const msg = document.createElement('span')
  msg.className = 'nudge-text'
  msg.textContent = text
  const esc = document.createElement('kbd')
  esc.textContent = 'Esc'
  esc.title = t('Esc 로 닫기')
  card.append(icon(), msg, esc)
  dom.append(card)
  // 띠 높이는 미리 정해야 한다 — 한글 13px 글자 폭으로 줄 수를 어림한다
  const room = Math.max(200, ed.getLayoutInfo().contentWidth - 120)
  const lines = Math.max(1, Math.ceil((text.length * 13) / room))
  const st = s
  ed.changeViewZones(a => { st.zone = a.addZone({ afterLineNumber: ed.getPosition()?.lineNumber ?? 1, heightInPx: 20 * lines + 28, domNode: dom }) })
  s.key.set(true)
}
