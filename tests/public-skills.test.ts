import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 공개 저장소 · Windows 설치 파일에 개인 · 회사 이름이 섞이지 않게 막는다.
// 금지어 목록은 그 자체가 개인 정보라 저장소에 두지 않는다 — 짧은 낱말의 해시는 사전 대입으로 풀린다.
// 로컬 전용 규칙 파일(.gitignore)의 BANNED(낱말을 소문자로 바꾼 SHA-256 앞 16자)를 쓰고, 그 파일이 없으면 이 검사는 건너뛴다
const RULES = 'scripts/public-skills.rules.local.mjs'
const BANNED = new Set<string>(existsSync(RULES) ? ((await import(pathToFileURL(RULES).href)).BANNED ?? []) : [])
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16)
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : files(p)) : [p] })
// 한글 낱말은 조사가 붙어도 잡게 앞 2~6자를, 영문은 하이픈으로 이은 낱말과 그 조각을 본다
const hits = (line: string): boolean => (line.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*|[가-힣]+/g) ?? []).some(w =>
  /^[가-힣]/.test(w) ? [2, 3, 4, 5, 6].some(n => w.length >= n && BANNED.has(sha(w.slice(0, n)))) : [w, ...w.split('-')].some(p => BANNED.has(sha(p))))

test('저장소와 공개용 스킬에 개인 · 회사 이름이 없다', { skip: BANNED.size === 0 && '로컬 금지어 목록이 없다' }, () => {
  // 공개되는 것은 git 이 다루는 파일이다(무시 목록의 로컬 평가 자료 · 규칙 파일은 빼고, 아직 커밋 전인 새 파일은 넣는다)
  const all = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n')
    .filter(f => f && existsSync(f) && !/\.(jpe?g|png|gif|mp4|ico|icns|bmp|wav|mp3|db)$/i.test(f))
  const left: string[] = []
  for (const f of all) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (hits(l)) left.push(`${f}:${i + 1}`) })
  assert.deepEqual(left, [], '개인 · 회사 이름이 남은 곳 — 스킬이면 scripts/public-skills.rules.local.mjs 의 규칙을 고친다')
})

test('공개용 스킬에 개인 폴더 · 사용자 설정이 없다', () => {
  for (const p of ['work-history/Knowledge/resume/_trace', 'work-history/site/mockups', 'work-history/rules.json'])
    assert.equal(existsSync(join('skills', p)), false, p)
  // 예시는 저장소에 둔 가짜 기록만
  assert.deepEqual(readdirSync(join('skills', 'concept-shorts', 'examples')).sort(), ['ShopAPI', 'concepts.md', 'shorts'])
})
