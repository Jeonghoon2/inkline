import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validate } from '../src/main/ai/schema.ts'
import { RESUME_SCHEMA, nextDay, sinceDate, recRef, hiringGist, sameWork, droppedNumbers, riskyLines, applyChange, applyChanges, jargonIn, checkChanges, saveResume, listBackups, restoreBackup, cvSlug, cvKey, resumeFile, cvHead, setCvHead, writeCvHead, CV_SKELETON, CV_ROLE_SKELETON, writeRoleSkeleton, careerOf } from '../src/main/resumeUpdate.ts'
import type { Entry, ResumeChange } from '../src/shared/types.ts'

const E = (p: Partial<Entry>): Entry => ({ category: 'AppDesk', date: '2026-10-18', title: 't', type: '기능', tags: [], body: '', sections: {}, ...p })
const C = (p: Partial<ResumeChange>): ResumeChange => ({ kind: 'add', where: 'w', before: '', after: '', anchor: '', why: 'y', shipped: true, evidence: [], ...p })
const CV = '# 이름\n\n## 프로젝트\n### A\n- **하나** — 첫째\n- **둘** — 둘째\n\n## 기술\n- 언어: TS\n'

test('날짜 — 다음 날 · 기준일 · 기록 고르기', () => {
  assert.equal(nextDay('2026-10-31'), '2026-11-01')
  assert.equal(nextDay('2026-12-31'), '2027-01-01')
  assert.equal(sinceDate('2026-10-18', new Date(2026, 9, 1)), '2026-10-19') // 기록해 둔 날 다음 날부터
  assert.equal(sinceDate(undefined, new Date(2026, 9, 17, 14, 25)), '2026-10-17') // 처음이면 파일 수정일 그날부터
  assert.equal(recRef(E({ category: 'Billing', date: '2026-09-30' })), 'Billing/2026-09.md#2026-09-30')
})

test('slug · 설정 키 · 파일', () => {
  assert.equal(cvSlug(''), ''); assert.equal(cvSlug('backend'), 'backend')
  assert.throws(() => cvSlug('../x')); assert.throws(() => cvSlug(3)); assert.throws(() => cvSlug('A'))
  assert.equal(cvKey(''), 'base'); assert.equal(cvKey('frontend'), 'frontend')
  assert.equal(resumeFile('/r', ''), '/r/resume.md'); assert.equal(resumeFile('/r', 'backend'), '/r/resume/backend.md')
})

test('스키마 — 고칠 곳 · 넣지 않은 기록', () => {
  assert.equal(validate({ changes: [C({ evidence: [{ ref: 'a/2026-10.md#2026-10-18', quote: 'q' }] })], skipped: [{ title: 't', why: 'w' }] }, RESUME_SCHEMA), null)
  assert.notEqual(validate({ changes: [{ ...C({}), kind: 'rewrite' }], skipped: [] }, RESUME_SCHEMA), null)
})

test('적용 — 더하기 · 바꾸기 · 빼기 · 못 찾음 · 두 번', () => {
  assert.equal(applyChange(CV, C({ kind: 'add', anchor: '- **둘** — 둘째', after: '- **셋** — 셋째' })), CV.replace('- **둘** — 둘째\n', '- **둘** — 둘째\n- **셋** — 셋째\n'))
  assert.equal(applyChange(CV, C({ kind: 'replace', before: '- **하나** — 첫째', after: '- **하나** — 1st' })), CV.replace('첫째', '1st'))
  assert.equal(applyChange(CV, C({ kind: 'remove', before: '- **하나** — 첫째' })), CV.replace('- **하나** — 첫째\n', ''))
  assert.equal(applyChange(CV, C({ kind: 'replace', before: '없는 줄', after: 'x' })), null)
  assert.equal(applyChange(CV, C({ kind: 'add', anchor: '- **', after: 'x' })), null) // 두 번 나오는 줄은 어디인지 모른다
  assert.equal(applyChange(CV, C({ kind: 'add', anchor: '- **둘** — 둘째', after: '  ' })), null) // 빈 내용
  const r = applyChanges(CV, [C({ kind: 'replace', before: '- **하나** — 첫째', after: '- **하나** — 1st' }), C({ kind: 'replace', before: '- **하나** — 첫째', after: 'again' }), C({ kind: 'add', anchor: '- 언어: TS', after: '- 도구: Vite' })])
  assert.equal(r.applied, 2); assert.equal(r.skipped, 1)
  assert.match(r.text, /1st/); assert.match(r.text, /- 언어: TS\n- 도구: Vite\n$/)
})

test('바꾸기 · 빼기는 줄 전체만 — 줄 가운데 · 앞 줄바꿈은 적용 불가', () => {
  assert.equal(applyChange(CV, C({ kind: 'replace', before: '**하나** — 첫째', after: '- **하나** — 1st' })), null)
  assert.equal(applyChange(CV, C({ kind: 'remove', before: '**하나** — 첫째' })), null)
  assert.equal(applyChange(CV, C({ kind: 'remove', before: '\n- **하나** — 첫째' })), null)
  assert.equal(applyChange(CV, C({ kind: 'replace', before: '- **하나** — 첫째\n- **둘** — 둘째', after: '- **합침**' })), CV.replace('- **하나** — 첫째\n- **둘** — 둘째', '- **합침**')) // 여러 줄은 된다
})

test('개발자 용어 — 7가지', () => {
  assert.deepEqual(jargonIn('외부 연동 (/partner/apply) 추가').length, 1)
  assert.equal(jargonIn('dev/1.3.0 배포')[0]?.startsWith('내부 버전'), true)
  assert.equal(jargonIn('MR !42 병합')[0]?.startsWith('커밋·MR 번호'), true)
  assert.equal(jargonIn('`npm test` 통과')[0]?.startsWith('코드 글자'), true)
  assert.equal(jargonIn('sync.py 수정')[0]?.startsWith('파일 이름'), true)
  assert.equal(jargonIn('미리 보기 --dry-run')[0]?.startsWith('명령 옵션'), true)
  assert.equal(jargonIn('API_BASE_URL 설정')[0]?.startsWith('코드 이름'), true)
  assert.deepEqual(jargonIn('Node.js·Vite 로 관리 화면 개선 (React, TypeScript)'), [])
})

test('검사 — 적용 불가 · 근거 대조 · 용어 · 빼기는 근거 없어도', () => {
  const es = [E({ category: 'AppDesk', date: '2026-10-18', title: '알림 묶기', body: '알림 ==99% 감소|배치== (약 3.1만 →  260건)', sections: { '수행 일지': '- 알림을 묶어 보냈다' } })]
  const ok = C({ kind: 'add', anchor: '- **둘** — 둘째', after: '- **알림 99% 감소**', evidence: [{ ref: 'AppDesk/2026-10.md#2026-10-18', quote: '99% 감소 (약 3.1만 → 260건)' }] })
  const [a, b, c, d, e] = checkChanges(CV, [
    ok,
    C({ ...ok, evidence: [{ ref: 'AppDesk/2026-10.md#2026-10-17', quote: '99% 감소' }] }), // 다른 날짜
    C({ ...ok, evidence: [] }),
    C({ ...ok, after: '- 1.3.0 배포' }),
    C({ kind: 'remove', before: '없는 줄' })
  ], es)
  assert.deepEqual([a!.id, a!.blocked, a!.warnings], [0, null, []])
  assert.deepEqual([b!.warnings, b!.evidence[0]!.ref], [[], 'AppDesk/2026-10.md#2026-10-18']) // 날짜를 잘못 대도 같은 글귀가 있는 기록으로 바로잡는다
  assert.match(c!.warnings[0]!, /근거 없음/)
  assert.match(d!.warnings.at(-1)!, /개발자 용어/)
  assert.notEqual(e!.blocked, null)
  assert.deepEqual(checkChanges(CV, [C({ kind: 'remove', before: '- **하나** — 첫째' })], es)[0]!.warnings, [])
  assert.deepEqual(checkChanges(CV, [C({ ...ok, evidence: [{ ref: '(AppDesk/2026-10.md#2026-10-18)', quote: '99% 감소' }] })], es)[0]!.warnings, []) // 괄호째 낸 ref 도 같은 기록
})

test('검사 — 빈 인용은 못 찾은 것 · 빈 after 는 비었다고 알림', () => {
  const es = [E({ body: '본문' })]
  const ev = [{ ref: 'AppDesk/2026-10.md#2026-10-18', quote: '  ' }]
  assert.equal(checkChanges(CV, [C({ kind: 'add', anchor: '- **둘** — 둘째', after: '- x', evidence: ev })], es)[0]!.warnings[0], '근거 못 찾음: AppDesk/2026-10.md#2026-10-18 "  "')
  assert.equal(checkChanges(CV, [C({ kind: 'replace', before: '첫째', after: ' ' })], es)[0]!.blocked, '넣을 내용이 비어 있습니다')
  assert.equal(checkChanges(CV, [C({ kind: 'add', anchor: '- **둘** — 둘째', after: '' })], es)[0]!.blocked, '넣을 내용이 비어 있습니다')
})

test('저장 — 백업 · 차례 적용 · 못 찾은 것 건너뜀 · 적용 0개면 파일 그대로', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cv-'))
  const file = join(dir, 'resume.md'), backupDir = join(dir, 'bk')
  await writeFile(file, CV)
  const r = await saveResume({ file, backupDir, now: new Date(2026, 9, 19, 9, 5, 7), changes: [C({ kind: 'replace', before: '- **하나** — 첫째', after: '- **하나** — 1st' }), C({ kind: 'replace', before: '없음', after: 'x' })] })
  assert.deepEqual(r, { applied: 1, skipped: 1, backup: 'resume-20261019-090507.md' })
  assert.match(await readFile(file, 'utf8'), /1st/)
  assert.deepEqual(await readdir(backupDir), ['resume-20261019-090507.md'])
  assert.equal(await readFile(join(backupDir, 'resume-20261019-090507.md'), 'utf8'), CV)
  assert.deepEqual(await readdir(dir).then(xs => xs.filter(x => x.endsWith('.tmp'))), [])
  const r2 = await saveResume({ file, backupDir, now: new Date(), changes: [] })
  assert.deepEqual(r2, { applied: 0, skipped: 0, backup: null })
  assert.equal((await readdir(backupDir)).length, 1) // 바뀐 게 없으면 백업도 없다
  // 같은 초에 또 저장하면 덮지 않고 -2
  const r3 = await saveResume({ file, backupDir, now: new Date(2026, 9, 19, 9, 5, 7), changes: [C({ kind: 'replace', before: '- **하나** — 1st', after: '- **하나** — 첫째' })] })
  assert.equal(r3.backup, 'resume-20261019-090507-2.md')
  assert.equal(await readFile(join(backupDir, 'resume-20261019-090507.md'), 'utf8'), CV)
  assert.deepEqual((await listBackups(backupDir, file)).map(b => b.name), ['resume-20261019-090507-2.md', 'resume-20261019-090507.md'])
})

test('이전 판 — 목록은 이 파일 것만 최신순, 되돌리기는 지금 판을 먼저 백업', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cv-'))
  const file = join(dir, 'resume.md'), backupDir = join(dir, 'bk')
  assert.deepEqual(await listBackups(backupDir, file), []) // 폴더가 없어도 빈 목록
  await mkdir(backupDir)
  for (const n of ['resume-20261018-100000.md', 'resume-20261019-090507.md', 'backend-20261019-100000.md', 'resume-2026.md', 'resume-20261019-090507.md.bak']) await writeFile(join(backupDir, n), `v:${n}`)
  const l = await listBackups(backupDir, file)
  assert.deepEqual(l.map(b => b.name), ['resume-20261019-090507.md', 'resume-20261018-100000.md'])
  assert.equal(l[0]!.at, new Date(2026, 9, 19, 9, 5, 7).toISOString())
  await writeFile(file, 'NOW')
  await restoreBackup({ file, backupDir, name: 'resume-20261018-100000.md', now: new Date(2026, 9, 20, 8, 0, 0) })
  assert.equal(await readFile(file, 'utf8'), 'v:resume-20261018-100000.md')
  assert.equal(await readFile(join(backupDir, 'resume-20261020-080000.md'), 'utf8'), 'NOW')
  assert.deepEqual(await readdir(dir).then(xs => xs.filter(x => x.endsWith('.tmp'))), [])
  for (const name of ['../x.md', 'backend-20261019-100000.md', 'bk/resume-20261018-100000.md', 'resume-20261018-100000.md/../../x']) await assert.rejects(restoreBackup({ file, backupDir, name, now: new Date() }), /백업 이름/)
  assert.equal(await readFile(file, 'utf8'), 'v:resume-20261018-100000.md') // 거절하면 파일은 그대로
})

test('채용 자료 요점 · 같은 일 판정', () => {
  assert.equal(hiringGist('# 제목\n\n## 요점 — 이렇게\n- 하나\n- 둘\n\n## 출처\n1. x'), '- 하나\n- 둘')
  assert.equal(hiringGist('## 요점\n- 끝까지'), '- 끝까지')
  assert.equal(hiringGist('요점 없음'), '')
  assert.equal(sameWork('- **알림 발송 99% 감소** (약 3.1만 → 260건) — 알림을 묶어 보냄', '- **알림 발송 99.2% 감소** (약 3.2만 → 250건) — 알림을 묶어 보냄'), true)
  assert.equal(sameWork('- **재고 수치 오판 방지** — 늘어난 재고가 오류가 아닌 반품 대기분임을 확인해 불필요한 코드 수정 회피', '- **공용 PC에서 사용자 간 장바구니 오표시 차단** — 사용자가 바뀌면 대기 기록을 비우도록 수정하고 전체 사용 흐름 점검'), false)
})

test('검사 — 수치 없음 · 운영 배포 전 표시 · 다른 일로 바꾸기', () => {
  const es = [E({ body: '쿠폰 세트를 버린다 99%' })]
  const ev = [{ ref: 'AppDesk/2026-10.md#2026-10-18', quote: '쿠폰 세트를 버린다 99%' }]
  const w = (c: Partial<ResumeChange>): string[] => checkChanges(CV, [C({ kind: 'add', anchor: '- **둘** — 둘째', evidence: ev, ...c })], es)[0]!.warnings
  assert.deepEqual(w({ after: '- **세트 99% 제외** — 다시 생성' }), [])
  assert.match(w({ after: '- **세트 자동 제외** — 다시 생성' })[0]!, /^수치 없음: '세트 자동 제외'/)
  assert.deepEqual(w({ after: '- 사용 기술: Python' }), []) // 성과 줄(- **…**)만 본다
  assert.match(w({ after: '- **세트 99% 제외**', shipped: false })[0]!, /운영 배포 전/)
  assert.deepEqual(w({ after: '- **세트 99% 제외** (운영 배포 전)', shipped: false }), [])
  const r = checkChanges(CV, [C({ kind: 'replace', before: '- **하나** — 첫째', after: '- **전혀 다른 일 3건** — 새로', evidence: ev })], es)[0]!
  assert.match(r.warnings.at(-1)!, /다른 일로 바꿉니다/)
  assert.deepEqual(checkChanges(CV, [C({ kind: 'remove', before: '- **하나** — 첫째', shipped: false })], es)[0]!.warnings, []) // 빼기는 배포 표시와 무관
})

test('빠지는 수치 — 고쳐 쓰다 다른 성과를 함께 지우면', () => {
  const before = '- 보관 건수와 DB 건수 일치(첫 30일치, 파일 8,315개), 메모리 75% 절감, 오래된 로그 약 118만 행 정리, 조회 4.2초 → 0.6~0.7초'
  assert.deepEqual(droppedNumbers(before, '- 메모리 75% 절감, 조회 4.2초 → 0.6~0.7초'), ['30', '8,315', '118'])
  assert.deepEqual(droppedNumbers('- 파일 8,315개', '- 파일 8315개'), []) // 쉼표만 다르면 같은 수
  const w = checkChanges('- a 3건\n', [C({ kind: 'replace', before: '- a 3건', after: '- a 건' })], [E({})], { review: true })[0]!.warnings
  assert.match(w[0]!, /^빠지는 수치: 3/)
})

test('규칙 그물 — S3 같은 기술 이름 숫자는 세지 않고, 고치지 않은 불리한 줄을 알린다', () => {
  assert.deepEqual(droppedNumbers('- 오래된 로그 118만 행 삭제', '- 원인 데이터 정리'), ['118'])
  const cv = '# n\n- 어쩔 수 없이 한 정리가 대표 성과\n- **장애 3건 정리** — 겨우 막음\n- 조회 13초'
  const fixed = [C({ kind: 'replace', before: '- **장애 3건 정리** — 겨우 막음', after: '- **원인 데이터 3건 정리**' })]
  assert.deepEqual(riskyLines(cv, fixed), [{ line: '- 어쩔 수 없이 한 정리가 대표 성과', words: ['어쩔 수 없이'] }])
  assert.deepEqual(riskyLines('- 조회 13초', []), [])
})

test('검사 — 점검의 고쳐 쓰기는 근거 없어도 되고, 불리할 수 있는 말은 알린다', () => {
  const es = [E({})]
  const re = C({ kind: 'replace', before: '- **하나 3건** — 첫째', after: '- **하나 3건** — 첫째를 고침' })
  assert.deepEqual(checkChanges('# n\n- **하나 3건** — 첫째\n', [re], es, { review: true })[0]!.warnings, [])
  assert.match(checkChanges('# n\n- **하나 3건** — 첫째\n', [re], es)[0]!.warnings[0]!, /근거 없음/) // 최신화에서는 근거가 있어야 한다
  const risky = checkChanges(CV, [C({ ...re, before: '- **하나** — 첫째', after: '- **남 탓에 겨우 막은 장애** — 첫째 하나' })], es, { review: true })[0]!.warnings
  assert.deepEqual(risky.filter(w => w.startsWith('불리할 수 있는 말')).map(w => w.split("'")[1]), ['탓에', '겨우'])
})

test('검사 — 근거에 없는 수치(지어낸 · 잘못 옮긴 숫자), 연도 · 기간은 빼고', () => {
  const es = [E({ body: '실제로 10세트(쿠폰 30장)를 만들었다' })]
  const w = (after: string, quote: string): string[] => checkChanges(CV, [C({ kind: 'add', anchor: '- **둘** — 둘째', after, evidence: [{ ref: 'AppDesk/2026-10.md#2026-10-18', quote }] })], es)[0]!.warnings
  assert.deepEqual(w('- **쿠폰 30장 생성** (2026.10) — 10세트', '10세트(쿠폰 30장)'), [])
  assert.match(w('- **쿠폰 54장 생성** — 10세트', '10세트(쿠폰 30장)').at(-1)!, /^근거에 없는 수치: 54/)
  assert.match(w('- **쿠폰 3장** — 10세트', '10세트(쿠폰 3장)').join(' / '), /근거 못 찾음.*근거에 없는 수치: 3/) // 못 찾은 인용의 숫자는 근거가 아니다
})

test('근거 대조 — 기록의 괄호 덧붙임만 뺀 인용은 통과, 괄호 안을 잘못 옮기면 못 찾음', () => {
  const es = [E({ body: '세트를 버리고 다시 만들게 했다(MR !61, CI 성공). 실제로 10세트(쿠폰 30장)를 만들었다' })]
  const ev = (quote: string): string[] => checkChanges(CV, [C({ kind: 'add', anchor: '- **둘** — 둘째', after: '- **10세트 생성**', evidence: [{ ref: 'AppDesk/2026-10.md#2026-10-18', quote }] })], es)[0]!.warnings.filter(w => w.startsWith('근거 못 찾음'))
  assert.deepEqual(ev('세트를 버리고 다시 만들게 했다.'), [])
  assert.match(ev('10세트(쿠폰 3장)').join(), /근거 못 찾음/)
  assert.match(ev('없는 글귀').join(), /근거 못 찾음/)
})

test('이력서 머리 — 읽기(빈칸은 빈 값) · 바꾸기(소개 · 모르는 연락처 유지, 건너뛴 칸은 줄째 빼기) · 새 파일은 뼈대', async () => {
  const cv = '# 홍길동\n> 한 줄 소개\n- 이메일: a@b.c\n- GitHub: [GitHub 주소]\n- 블로그: https://blog\n\n## 자기소개\n- 하나\n'
  assert.deepEqual(cvHead(cv), { name: '홍길동', email: 'a@b.c', phone: '', github: '', portfolio: '', company: '', title: '', start: '', end: '' })
  assert.equal(setCvHead(cv, { name: '홍길동', email: 'x@y.z', phone: '010-1234-5678', github: '', portfolio: 'https://p', company: '', title: '', start: '', end: '' }),
    '# 홍길동\n> 한 줄 소개\n- 이메일: x@y.z\n- 전화: 010-1234-5678\n- 포트폴리오: https://p\n- 블로그: https://blog\n\n## 자기소개\n- 하나\n')
  assert.equal(setCvHead('', { name: '홍길동', email: 'h@g.d', phone: '', github: '', portfolio: '', company: '', title: '', start: '', end: '' }), `# 홍길동\n- 이메일: h@g.d\n\n${CV_SKELETON}`)
  const dir = await mkdtemp(join(tmpdir(), 'cvhead-')), file = join(dir, 'resume.md'), bk = join(dir, 'bk')
  await writeCvHead({ file, backupDir: bk, head: cvHead(cv), now: new Date(2026, 9, 20, 9, 0, 0) }) // 새 파일 — 백업 없음
  assert.match(await readFile(file, 'utf8'), /^# 홍길동\n- 이메일: a@b.c\n\n## 자기소개/)
  await writeCvHead({ file, backupDir: bk, head: { ...cvHead(cv), name: '홍길동2' }, now: new Date(2026, 9, 20, 9, 0, 1) })
  assert.deepEqual(await readdir(bk), ['resume-20261020-090001.md'])
})

test('직무 이력서 뼈대 — 새로 만들고, 있으면 덮지 않고, 기본(빈 이름)은 거절 · 보완할 경험 줄은 근거를 묻지 않는다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'role-'))
  assert.equal(await writeRoleSkeleton(root, 'backend'), true)
  assert.equal(await readFile(join(root, 'resume', 'backend.md'), 'utf8'), CV_ROLE_SKELETON)
  await writeFile(join(root, 'resume', 'backend.md'), '## 자기소개\n- 내 글\n')
  assert.equal(await writeRoleSkeleton(root, 'backend'), false)
  assert.equal(await readFile(join(root, 'resume', 'backend.md'), 'utf8'), '## 자기소개\n- 내 글\n')
  await assert.rejects(writeRoleSkeleton(root, ''))
  await assert.rejects(writeRoleSkeleton(root, '../x'))
  const gap = checkChanges(CV_ROLE_SKELETON, [C({ kind: 'add', anchor: '### 부족한 경험', after: '- **Spark** — 분산 처리 기록이 없다', evidence: [] })], [E({})])[0]!
  assert.deepEqual([gap.blocked, gap.warnings], [null, []])
  assert.match(checkChanges(CV_ROLE_SKELETON, [C({ kind: 'add', anchor: '## 기술', after: '- **Spark** — 쓴다', evidence: [] })], [E({})])[0]!.warnings.join(), /근거 없음/) // 다른 구역은 그대로
})

test('경력 — 첫 회사 읽기, 같은 회사면 제목 · 기간만 고치고(역할 줄 유지), 없으면 경력 맨 위에, 회사가 비면 그대로', () => {
  const cv = '# n\n- 이메일: a@b.c\n\n## 경력\n### 예시회사 · 개발자\n기간: 2024.03 - 현재\n역할: 개발\n\n### 옛회사\n기간: 2023.03 - 2024.12\n\n## 프로젝트\n- p\n'
  const h = cvHead(cv)
  assert.deepEqual([h.company, h.title, h.start, h.end], ['예시회사', '개발자', '2024.03', ''])
  assert.equal(setCvHead(cv, { ...h, title: '선임', end: '2026.09' }), cv.replace('### 예시회사 · 개발자\n기간: 2024.03 - 현재', '### 예시회사 · 선임\n기간: 2024.03 - 2026.09'))
  const added = setCvHead(cv, { ...h, company: '새회사', title: '', start: '2026.10', end: '' })
  assert.match(added, /## 경력\n### 새회사\n기간: 2026\.10 - 현재\n\n### 예시회사 · 개발자/)
  assert.equal(setCvHead(cv, { ...h, company: '' }), cv) // 경력 없음 — 경력 칸은 건드리지 않는다
  assert.match(setCvHead('', { ...h, name: '홍', company: '새회사', title: '서버 개발자', start: '2024.05' }), /## 경력\n### 새회사 · 서버 개발자\n기간: 2024\.05 - 현재\n\n## 프로젝트/)
})

test('검사 — 프로젝트 대조: 근거 기록이 말하지 않는 프로젝트 이름은 경고, 기록이 그 프로젝트를 말하면 통과', () => {
  const es = [E({ category: 'DataHub', date: '2026-10-14', body: '운영 대시보드에서 AppDesk 주문 목록 조회가 4.2초 → 0.6초' }), E({ category: 'Billing', date: '2026-10-15', body: '리포트 화면' })]
  const w = (after: string): string[] => checkChanges(CV, [C({ kind: 'add', anchor: '- **둘** — 둘째', after, evidence: [{ ref: 'DataHub/2026-10.md#2026-10-14', quote: '4.2초 → 0.6초' }] })], es)[0]!.warnings
  assert.deepEqual(w('- **AppDesk 조회 4.2초 → 0.6초** — 보관 파일에서 읽음'), []) // 근거 기록이 AppDesk 를 말한다
  assert.deepEqual(w('- **DataHub 조회 4.2초 → 0.6초**'), []) // 근거 기록의 카테고리
  assert.match(w('- **Billing 조회 4.2초 → 0.6초**')[0]!, /^다른 프로젝트 이름: Billing — 근거 기록\(DataHub\)/)
  assert.deepEqual(w('- **Billings 조회 4.2초 → 0.6초**'), []) // 다른 낱말 속 글자는 아니다
})

test('검사 — 소속 대조: 개인 작업만 근거인데 회사 소속이거나, 회사 일만 근거인데 개인이면', () => {
  const es = [E({ category: 'Inkline', date: '2026-10-19', body: '앱 시작 1.2초' }), E({ category: 'Billing', date: '2026-10-19', body: '리포트 2초' })]
  const w = (after: string, ref: string, quote: string): string[] => checkChanges(CV, [C({ kind: 'add', anchor: '- **둘** — 둘째', after, evidence: [{ ref, quote }] })], es, { personal: ['Inkline'] })[0]!.warnings.filter(x => x.startsWith('소속'))
  assert.match(w('### 앱\n소속: 예시회사 / 기간: 2026.10\n- **시작 1.2초**', 'Inkline/2026-10.md#2026-10-19', '앱 시작 1.2초')[0]!, /개인 작업\(Inkline\)인데 소속이 '예시회사'/)
  assert.deepEqual(w('### 앱\n소속: 개인 / 기간: 2026.10\n- **시작 1.2초**', 'Inkline/2026-10.md#2026-10-19', '앱 시작 1.2초'), [])
  assert.match(w('### 리포트\n소속: 개인 / 기간: 2026.10\n- **2초**', 'Billing/2026-10.md#2026-10-19', '리포트 2초')[0]!, /회사 일\(Billing\)인데 소속이 '개인'/)
})

test('경력 구역 꺼내기', () => {
  assert.equal(careerOf('# n\n\n## 경력\n### 회사 · 직책\n기간: 2024.03 - 현재\n\n## 프로젝트\n- p'), '### 회사 · 직책\n기간: 2024.03 - 현재')
  assert.equal(careerOf('## 자기소개\n\n## 경력\n\n## 프로젝트\n'), '')
  assert.equal(careerOf('## 경력\n### 끝 회사'), '### 끝 회사')
})
