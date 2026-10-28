import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseEntries, parseConcepts, slug, loadHistory } from '../src/main/history.ts'

const ROOT = join(import.meta.dirname, 'fixtures/history')

test('기록: 날짜 내림차순, 제목은 "종류 — " 를 뗀다, 분류는 대분류 - 소분류', () => {
  const es = parseEntries(ROOT)
  assert.deepEqual(es.map(e => [e.category, e.date, e.title]), [
    ['AppDesk', '2026-10-08', '작업이 메모리 부족으로 멈춘 문제 해결'],
    ['AppDesk', '2026-10-07', '화면 분할'],
    ['Billing', '2026-09-30', '설계 문서 초안']
  ])
  const e = es[1]
  assert.equal(e.type, '기능')
  assert.deepEqual(e.tags, [{ major: '데스크톱 앱', minor: 'Electron' }, { major: '프론트엔드', minor: 'React' }])
  assert.equal(e.body, '편집기를 ==둘로 나눠|화면 분할== 보게 했다.')
  assert.deepEqual(Object.keys(e.sections), ['수행 일지', '고민한 흔적'])
  assert.equal(e.sections['고민한 흔적'], '- **겹침** 문제를 먼저 풀었다')
})

test('기록: 트러블슈팅 섹션과 번호 목록을 그대로 담는다', () => {
  const t = parseEntries(ROOT)[0]
  assert.equal(t.type, '트러블슈팅')
  assert.deepEqual(Object.keys(t.sections), ['상황', '해결 과정'])
  assert.equal(t.sections['해결 과정'], '1. **원인 찾기** — 로그를 봤다\n2. **수정** — 5천 줄씩 읽었다')
})

test('개념 사전: 원리 문단 · 꼬리 질문, 후속 주석은 건너뛴다', () => {
  const c = parseConcepts(ROOT)
  assert.deepEqual(Object.keys(c), ['종료 코드 137', '화면 분할'])
  assert.equal(c['종료 코드 137'].why, '메모리를 다 써서 시스템이 강제로 끈 경우의 번호다.\n두 번째 문단.')
  assert.deepEqual(c['종료 코드 137'].qs, [
    { q: '137 은 어떻게 나오나?', a: '128 + 9(SIGKILL).' },
    { q: '막으려면?', a: '나눠 읽는다.' }
  ])
  assert.equal(c['화면 분할'].why, '한 창을 둘로 나눈다.')
})

test('slug 는 경로에 못 쓰는 글자와 공백을 _ 로', () => {
  assert.equal(slug('종료 코드 137'), '종료_코드_137')
  assert.equal(slug('a/b:c'), 'a_b_c')
})

test('loadHistory: 보고 · 이력서 · 직무 · 쇼츠를 모은다', () => {
  const h = loadHistory(ROOT)
  assert.equal(h.exists, true)
  assert.equal(h.root, ROOT)
  assert.equal(h.entries.length, 3)
  assert.deepEqual(h.reports.map(r => r.name), ['2026-W41'])
  assert.match(h.resume, /^# 홍길동/)
  assert.deepEqual(h.roles.map(r => r.slug), ['backend'])
  assert.deepEqual(h.shorts, ['종료 코드 137'])
  assert.ok(!Number.isNaN(Date.parse(h.loadedAt)))
})

test('loadHistory: 폴더가 없으면 exists=false 와 빈 값', () => {
  const h = loadHistory(join(ROOT, 'nope'))
  assert.equal(h.exists, false)
  assert.deepEqual([h.entries, h.reports, h.roles, h.shorts, h.resume], [[], [], [], [], ''])
})

test('실제 ~/My-History 를 오류 없이 읽는다 (있을 때만)', { skip: !process.env.HOME }, () => {
  const h = loadHistory(join(process.env.HOME!, 'My-History'))
  if (h.exists) assert.ok(h.entries.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.title))
})

test('loadHistory: 보고는 주차 숫자 순으로 최신이 먼저 (W10 이 W9 앞)', () => {
  const root = mkdtempSync(join(tmpdir(), 'mh-'))
  mkdirSync(join(root, 'reports'))
  writeFileSync(join(root, 'reports', '2027-W9.md'), 'a')
  writeFileSync(join(root, 'reports', '2027-W10.md'), 'b')
  assert.deepEqual(loadHistory(root).reports.map(r => r.name), ['2027-W10', '2027-W9'])
})
