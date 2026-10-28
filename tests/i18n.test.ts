import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EN, getLang, resolveLang, setLang, t } from '../src/shared/i18n.ts'

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : []
  })
const HANGUL = /[가-힣]/
// t('…') · t("…") · t(`…`) 의 첫 인자(한국어 원문)
const KEY = /\bt\((['"`])((?:\\.|(?!\1).)*)\1/g
const unescape = (s: string): string => s.replace(/\\(['"`\\])/g, '$1')
const slots = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')

test('t — 영어 사전에 있으면 영어, 없으면 한국어 그대로, {자리표시}는 채운다', () => {
  const was = getLang()
  try {
    setLang('ko')
    assert.equal(t('없는 문장 {n}개', { n: 3 }), '없는 문장 3개')
    setLang('en')
    assert.equal(t('없는 문장'), '없는 문장')
    const [ko, en] = Object.entries(EN).find(([k]) => !k.includes('{')) ?? ['', '']
    if (ko) assert.equal(t(ko), en)
    // 영어 복수형: 값이 1이면 단수
    const plural = Object.entries(EN).find(([, v]) => v.includes('{n} entries'))
    if (plural) {
      assert.match(t(plural[0], { n: 1 }), /1 entry\b/)
      assert.match(t(plural[0], { n: 3 }), /3 entries\b/)
    }
  } finally { setLang(was) }
})

test('시스템 설정이면 운영체제 언어를 따른다 — 한국어만 한국어, 그 밖은 영어', () => {
  assert.equal(resolveLang('system', 'ko-KR'), 'ko')
  assert.equal(resolveLang('system', 'ko'), 'ko')
  assert.equal(resolveLang('system', 'en-US'), 'en')
  assert.equal(resolveLang('system', 'ja-JP'), 'en')
  assert.equal(resolveLang('ko', 'en-US'), 'ko')
  assert.equal(resolveLang('en', 'ko-KR'), 'en')
})

test('코드에서 t() 로 쓰는 한국어 원문은 모두 영어 사전에 있고, 자리표시가 같다', () => {
  const missing: string[] = [], slot: string[] = []
  for (const f of [...files('src/renderer'), ...files('src/main'), ...files('src/shared')]) {
    for (const m of readFileSync(f, 'utf8').matchAll(KEY)) {
      const ko = unescape(m[2]!)
      if (!HANGUL.test(ko) || ko.includes('${')) continue
      if (!(ko in EN)) missing.push(`${f}: ${ko}`)
      else if (slots(ko) !== slots(EN[ko]!)) slot.push(`${f}: ${ko} → ${EN[ko]}`)
    }
  }
  assert.deepEqual(missing, [], `영어 사전에 없는 문장 ${missing.length}개`)
  assert.deepEqual(slot, [], '자리표시가 다른 번역')
})

test('영어 번역에는 한글이 남지 않는다', () => {
  const bad = Object.entries(EN).filter(([, v]) => HANGUL.test(v)).map(([k]) => k)
  assert.deepEqual(bad, [])
})

// 한 줄에서 주석을 지운다 — 따옴표 안의 // (주소 등)는 남긴다
function stripComment(line: string): string {
  let q = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue }
    if (c === "'" || c === '"' || c === '`') q = c
    else if (c === '/' && line[i + 1] === '/') return line.slice(0, i)
  }
  return line
}

test('화면 코드에 t() 로 감싸지 않은 한국어 문구가 없다 — 데이터로 쓰는 한국어는 줄 끝에 // i18n-ok', () => {
  const left: string[] = []
  const only = process.env.I18N_ONLY?.split(',') // 영역만 볼 때: I18N_ONLY=src/renderer/cert,src/renderer/tabs/Knowledge.tsx
  for (const f of files('src/renderer').filter(f => !only || only.some(o => f.startsWith(o)))) {
    let block = false
    readFileSync(f, 'utf8').split('\n').forEach((raw, i) => {
      if (raw.includes('i18n-ok') || raw.includes('console.')) return // 개발자용 로그는 번역하지 않는다
      let line = raw
      if (block) { const e = line.indexOf('*/'); if (e < 0) return; line = line.slice(e + 2); block = false }
      line = line.replace(/\{?\/\*.*?\*\/\}?/g, '')
      const s = line.indexOf('/*'); if (s >= 0) { line = line.slice(0, s); block = true }
      line = stripComment(line).replace(KEY, '')
      if (HANGUL.test(line)) left.push(`${f}:${i + 1}: ${raw.trim().slice(0, 80)}`)
    })
  }
  assert.equal(left.length, 0, `감싸지 않은 한국어 ${left.length}줄\n${left.slice(0, only ? left.length : 40).join('\n')}`)
})
