import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validate } from '../src/main/ai/schema.ts'
import { hiringGist } from '../src/main/resumeUpdate.ts'
import { RESEARCH_SCHEMA, gatherRole, materialOf, researchPrompt, type Ask, type Research } from '../src/main/roleResearch.ts'

const R: Research = {
  label: 'DevOps 엔지니어', points: ['배포 자동화와 장애 대응을 먼저 본다'], postings: [{ item: 'Kubernetes 운영', kind: '자격요건', seen: 'A사' }, { item: 'Terraform', kind: '우대사항', seen: 'B사' }],
  resume: ['배포 시간 · 장애 복구 시간을 수치로'], cover: [{ question: '지원 동기', how: '운영 문제를 푼 경험으로' }],
  checklist: [{ item: 'CI/CD | 파이프라인', evidence: 'GitLab CI, 배포', why: 'A사 공고' }],
  sources: [{ title: '글 하나', url: 'https://a.example/x', kind: '채용 쪽', note: '요점' }, { title: '지어낸 글', url: 'https://nope.example/y', kind: '블로그', note: '없음' }, { title: '주소 아님', url: 'not-a-url', kind: '기사', note: '' }]
}
const ask = (v: unknown): Ask => (async () => ({ ok: true, value: v })) as Ask

test('직무 자료 — 출처를 열어 보고 지금 직무 자료와 같은 파일로, 요점은 최신화가 읽는 꼴', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'role-')), 'devops')
  const r = await gatherRole({ dir, slug: 'devops', label: '', ask: ask(R), probe: async u => u.startsWith('https://a.'), now: new Date(2026, 9, 21) })
  assert.deepEqual(r, { ok: true, sources: 2, opened: 1, label: 'DevOps 엔지니어', backup: null }) // 주소가 아닌 출처는 버린다
  assert.deepEqual((await readdir(dir)).sort(), ['checklist.md', 'cover-letter-patterns.md', 'hiring-side.md', 'job-posting-patterns.md', 'resume-patterns.md'])
  const hs = await readFile(join(dir, 'hiring-side.md'), 'utf8')
  assert.equal(hiringGist(hs), '- 배포 자동화와 장애 대응을 먼저 본다')
  assert.match(hs, /1\. 글 하나 — https:\/\/a\.example\/x · 채용 쪽 · 열어 봄\(앱 확인\)/)
  assert.match(hs, /2\. 지어낸 글 — https:\/\/nope\.example\/y · 블로그 · 열리지 않음/)
  assert.match(await readFile(join(dir, 'checklist.md'), 'utf8'), /\| CI\/CD \/ 파이프라인 \| GitLab CI, 배포 \| A사 공고 \|/) // 표를 깨는 | 는 바꾼다
  const m = await materialOf(dir)
  assert.equal(m?.sources, 2)
  assert.equal(await materialOf(join(dir, '..', 'none')), null)
})

test('직무 자료 — 출처가 하나도 안 열리면 쓰지 않고, AI 오류는 그대로', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'role-')), 'devops')
  const r = await gatherRole({ dir, slug: 'devops', label: '', ask: ask(R), probe: async () => false, now: new Date() })
  assert.equal(r.ok, false)
  assert.equal(await materialOf(dir), null)
  const e = await gatherRole({ dir, slug: 'devops', label: '', ask: (async () => ({ ok: false, error: { code: 'timeout', message: 't' } })) as Ask, probe: async () => true, now: new Date() })
  assert.deepEqual(e, { ok: false, error: { code: 'timeout', message: 't' } })
})

test('직무 자료 — 지시 · 가짜 응답 형식 · 있는 자료 알아보기', async () => {
  const p = researchPrompt('devops', '')
  assert.match(p, /직무: devops/); assert.match(p, /자기소개서/); assert.match(p, /지어내지 않는다/)
  assert.match(researchPrompt('backend', '백엔드 엔지니어'), /직무: 백엔드 엔지니어/)
  assert.equal(validate(JSON.parse(await readFile('tests/fixtures/ai/resume-research.json', 'utf8')), RESEARCH_SCHEMA), null)
  const dir = await mkdtemp(join(tmpdir(), 'role-')); await mkdir(join(dir, 'x')); await writeFile(join(dir, 'x', 'checklist.md'), '# 점검표')
  assert.equal((await materialOf(join(dir, 'x')))?.sources, 0) // 점검표만 있어도 자료가 있는 것
})

test('직무 자료 다시 모으기 — 있던 파일은 덮기 전에 _backup-<시각>/ 으로', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'role-')), 'backend')
  await mkdir(dir); await writeFile(join(dir, 'checklist.md'), '# 손으로 모은 점검표'); await writeFile(join(dir, 'what-hiring-looks-for.md'), '# 그대로')
  const r = await gatherRole({ dir, slug: 'backend', label: '', ask: ask(R), probe: async () => true, now: new Date(Date.UTC(2026, 9, 21, 3, 4, 5)) })
  assert.ok(r.ok && r.backup?.endsWith('_backup-20261021-030405'))
  assert.equal(await readFile(join(dir, '_backup-20261021-030405', 'checklist.md'), 'utf8'), '# 손으로 모은 점검표')
  assert.match(await readFile(join(dir, 'checklist.md'), 'utf8'), /경험 점검표/)
  assert.equal(await readFile(join(dir, 'what-hiring-looks-for.md'), 'utf8'), '# 그대로') // 모으지 않는 파일은 손대지 않는다
})
