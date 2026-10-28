import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEMES, isDarkTheme, isThemeName, resolveTheme } from '../src/shared/themes.ts'

const css = readFileSync('src/renderer/styles/tokens.css', 'utf8')
// :root[data-theme='<id>'] { … } 묶음의 --이름: 값
const block = (id: string): Record<string, string> => {
  const m = css.match(new RegExp(`(?:^|\\n)\\[data-theme='${id}'\\]\\s*\\{([^}]*)\\}`))
  assert.ok(m, `${id} 테마 묶음이 없다`)
  return Object.fromEntries([...m[1]!.matchAll(/(?:^|[\s;{])(?:--)?([\w-]+):\s*([^;]+);/g)].map(x => [x[1], x[2]!.trim()]))
}
const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }

const COLORS = ['rail', 'side', 'main', 'fg', 'sub', 'muted', 'line', 'field-line', 'hover', 'active', 'primary', 'on-primary', 'ok', 'bad', 'hl', 'accent', 'hl-soft', 't-feat', 't-fix', 't-perf', 't-ship', 't-doc', 't-trouble', 't-etc', 'heat0', 'heat1', 'heat2', 'heat3', 'heat4', 'shadow']

for (const t of THEMES) {
  test(`테마 ${t.label} — 토큰이 다 있고 글자가 바탕에서 읽힌다(4.5:1)`, () => {
    const v = block(t.id)
    for (const k of COLORS) assert.ok(v[k], `${t.id}: --${k} 없음`)
    assert.equal(v['color-scheme'], t.dark ? 'dark' : 'light')
    for (const fg of ['fg', 'sub', 'muted', 'accent', 'bad', 't-feat', 't-fix', 't-perf', 't-ship', 't-doc', 't-trouble', 't-etc'])
      for (const bg of ['main', 'side']) assert.ok(ratio(v[fg]!, v[bg]!) >= 4.5, `${t.id}: --${fg} / --${bg} = ${ratio(v[fg]!, v[bg]!).toFixed(2)}`)
    assert.ok(ratio(v.primary!, v['on-primary']!) >= 4.5, `${t.id}: 주 단추 글자 대비`)
    assert.ok(ratio(v.ok!, v.main!) >= 4.5, `${t.id}: --ok / --main = ${ratio(v.ok!, v.main!).toFixed(2)}`) // '정답' 글자
    for (const bg of ['main', 'side']) assert.ok(ratio(v['field-line']!, v[bg]!) >= 3, `${t.id}: 입력 칸 테두리 / --${bg} = ${ratio(v['field-line']!, v[bg]!).toFixed(2)}`)
    for (const bg of ['rail', 'side', 'active']) assert.ok(ratio(v.accent!, v[bg]!) >= 3, `${t.id}: 활성 막대 --accent / --${bg}`)
  })
}

test('어둡게는 시스템이 어두울 때의 첫 그림 값과 같다', () => {
  const m = css.match(/:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/)
  assert.ok(m)
  const first = Object.fromEntries([...m[1]!.matchAll(/(?:^|[\s;{])(?:--)?([\w-]+):\s*([^;]+);/g)].map(x => [x[1], x[2]!.trim()]))
  assert.deepEqual(first, block('dark'))
})

test('테마 고르기 — 시스템 설정은 맥 밝기에 따라 두 칸 중 하나', () => {
  assert.equal(resolveTheme('system', 'paper', 'nord', false), 'paper')
  assert.equal(resolveTheme('system', 'paper', 'nord', true), 'nord')
  assert.equal(resolveTheme('dracula', 'paper', 'nord', false), 'dracula')
  assert.equal(isDarkTheme('ink'), true); assert.equal(isDarkTheme('sky'), false)
  assert.equal(isThemeName('solarized-dark'), true); assert.equal(isThemeName('blue'), false)
})
