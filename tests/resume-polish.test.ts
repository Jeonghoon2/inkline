import { test } from 'node:test'
import assert from 'node:assert/strict'
import { polish, polishNote, polishPrompt, polishRejects, POLISH_SCHEMA } from '../src/main/resumePolish.ts'
import { validate } from '../src/main/ai/schema.ts'
import { runReview, runUpdate, type Ctx } from '../src/main/resumePipeline.ts'
import type { Entry, ResumeChange, ResumeStage } from '../src/shared/types.ts'
import type { Ask } from '../src/main/ai/run.ts'

const LINE = '- **응답 시간 86% 단축** (4.2초 → 0.6초) — 한 번에 읽던 목록을 나눠 읽는 방식을 통해 개선되어짐'
const GOOD = '- **응답 시간 86% 단축** (4.2초 → 0.6초) — 한 번에 읽던 목록을 나눠 읽도록 바꿈'
const ch = (p: Partial<ResumeChange>): ResumeChange => ({ kind: 'add', where: '프로젝트', before: '', after: LINE, anchor: '**What did I do**', why: 'w', shipped: true, evidence: [], ...p })

test('윤문 규칙 — 말투만 바뀌면 받고, 숫자 · 기술 이름 · 줄 꼴이 바뀌면 받지 않는다', () => {
  assert.equal(polishRejects(LINE, GOOD), null)
  assert.equal(polishRejects(LINE, GOOD.replace('86%', '85%')), '숫자가 달라짐')
  assert.equal(polishRejects(LINE, GOOD.replace('바꿈', '바꿈 — 확인')), '줄표(—)가 늘어남')
  assert.equal(polishRejects(LINE, GOOD.replace('0.6초', '0.6초 · 99%')), '숫자가 달라짐')
  assert.equal(polishRejects('- **React 화면 개선** — 첫 화면', '- **Vue 화면 개선** — 첫 화면'), '기술 이름이 달라짐')
  assert.equal(polishRejects('- **S3 보관** — 매일', '- **S3 와 EC2 보관** — 매일'), '숫자가 달라짐') // 이름 속 숫자(EC2)가 늘어도 걸린다
  assert.equal(polishRejects('- **Spark 처리** — 매일', '- **Spark 와 Kafka 처리** — 매일'), '기술 이름이 달라짐')
  assert.equal(polishRejects(LINE, `${GOOD}\n- 한 줄 더`), '줄 수가 달라짐')
  assert.equal(polishRejects(LINE, GOOD.replace('- **', '- ').replace('**', '')), '줄 꼴(목록 · 굵은 글)이 달라짐')
  assert.equal(polishRejects(LINE, GOOD.replace('- ', '')), '줄 꼴(목록 · 굵은 글)이 달라짐')
  assert.equal(polishRejects('', ''), '빈 글') // 빈 글
  assert.equal(polishRejects(LINE, '  '), '빈 글')
})

test('윤문 규칙 — 제목 · 소속 · 기간 줄은 한 글자도, (운영 배포 전) · 빈칸은 남긴다, 길이는 ±30%', () => {
  const head = '### 주문 앱 (운영 배포 전)\n소속: 회사 / 기간: 2026.09 - 현재\n\n**Description**\n\n고객이 쓰는 앱을 다양한 방법을 통해 만들었습니다.'
  assert.equal(polishRejects(head, head.replace('다양한 방법을 통해 만들었습니다', '직접 만들었습니다')), null)
  assert.equal(polishRejects(head, head.replace('주문 앱', '주문 서비스')), '꼴 줄(제목 · 소속 · 기간)을 고침')
  assert.equal(polishRejects(head, head.replace('회사', '예시회사')), '꼴 줄(제목 · 소속 · 기간)을 고침')
  assert.equal(polishRejects(head, head.replace('**Description**', '**설명**')), '기술 이름이 달라짐') // 영문 꼴 표시가 사라져도 걸린다
  assert.equal(polishRejects('- **성과 3건** — 운영 배포 전', '- **성과 3건** — 완료'), "'(운영 배포 전)' 표시가 사라짐")
  assert.equal(polishRejects('소속: [회사] / 기간: [YYYY.MM]\n설명 문장입니다 가나다라마바사', '소속: 회사 / 기간: YYYY.MM\n설명 문장입니다 가나다라마바사'), '꼴 줄(제목 · 소속 · 기간)을 고침')
  assert.equal(polishRejects('- [회사] 에서 일했습니다 가나다라', '- 회사에서 일했습니다 가나다라'), '[대괄호] 빈칸이 사라짐')
  assert.equal(polishRejects(LINE, GOOD + ' 그리고 이것은 매우 긴 덧붙임 문장으로 글을 크게 늘립니다 가나다라마바사아자차카타파하'), '글 길이가 너무 달라짐')
  assert.equal(polishRejects(LINE, '- **응답 시간 86% 단축** (4.2초 → 0.6초)'), '글 길이가 너무 달라짐')
})

const fakeAsk = (items: unknown, calls: string[] = []): Ask => (async (task: string) => { calls.push(task); return items === 'fail' ? { ok: false, error: { code: 'cli-error', message: '실패' } } : items === 'abort' ? { ok: false, error: { code: 'aborted', message: '취소했습니다' } } : { ok: true, value: { items } } }) as Ask

test('윤문 — 받은 글만 바꾸고, 규칙에 걸리거나 답이 없으면 원문 · 삭제와 같은 글은 부르지 않는다', async () => {
  const cs = [ch({}), ch({ after: '- **하나 3건** — 첫째 줄' }), ch({ after: '- **둘 5건** — 둘째 줄' }), ch({ kind: 'remove', before: '- 뺄 줄', after: '' }), ch({ after: '- **같음 1건** — 그대로' })]
  const calls: string[] = []
  const r = await polish(cs, fakeAsk([{ id: 0, after: GOOD }, { id: 1, after: '- **하나 4건** — 첫째 줄' }, { id: 3, after: '- **같음 1건** — 그대로' }], calls), '대상: 기본 이력서')
  assert.ok(r.ok)
  assert.deepEqual(calls, ['resume-polish'])
  assert.equal(r.changes[0]!.after, GOOD) // 받음
  assert.equal(r.changes[1]!.after, '- **하나 3건** — 첫째 줄') // 숫자가 달라 원문
  assert.equal(r.changes[2]!.after, '- **둘 5건** — 둘째 줄') // 답 없음 → 원문
  assert.equal(r.changes[3]!.kind, 'remove'); assert.equal(r.changes[4]!.after, '- **같음 1건** — 그대로')
  assert.deepEqual([r.polished, r.kept], [1, 2]); assert.deepEqual(r.why, ['숫자가 달라짐', '답이 없음'])
  assert.equal(polishNote(r), '다듬음 1개 · 원문 유지 2개(숫자가 달라짐 · 답이 없음)')
  assert.equal(cs[0]!.after, LINE) // 입력은 건드리지 않는다
})

test('윤문 — 보낼 글이 없으면 AI 를 부르지 않고, 실패해도 원문으로 계속하며, 취소만 알린다', async () => {
  const calls: string[] = []
  const none = await polish([ch({ kind: 'remove', before: '- x', after: '' })], fakeAsk([], calls), 't')
  assert.ok(none.ok && none.changes.length === 1 && calls.length === 0)
  const skipped = await polish([ch({})], fakeAsk([], calls), 't', () => true) // 보완할 경험 같은 건너뛸 제안
  assert.ok(skipped.ok && calls.length === 0)
  const failed = await polish([ch({})], fakeAsk('fail'), 't')
  assert.ok(failed.ok && failed.changes[0]!.after === LINE && failed.failed === '실패')
  assert.equal(polishNote(failed), '건너뜀 — 실패')
  const ab = await polish([ch({})], fakeAsk('abort'), 't')
  assert.ok(!ab.ok && ab.error.code === 'aborted')
})

test('윤문 지시 · 형식 — 번호별 새 글, 지킬 것을 말한다', () => {
  const p = polishPrompt('대상: 기본 이력서', [{ where: 'A', after: LINE }, { where: 'B', after: '- 둘' }])
  assert.match(p, /<proposals>\n## 0\n위치: A\n새 글:\n- \*\*응답 시간/)
  assert.match(p, /## 1\n위치: B/)
  assert.match(p, /번역투/); assert.match(p, /숫자 · 단위/); assert.match(p, /±30%/)
  assert.equal(validate({ items: [{ id: 0, after: 'x' }] }, POLISH_SCHEMA), null)
  assert.ok(validate({ items: [{ id: 0 }] }, POLISH_SCHEMA))
})

const E = (p: Partial<Entry>): Entry => ({ category: 'AppDesk', date: '2026-10-19', title: '새것', type: '기능', tags: [], body: '출력 99% 감소', sections: {}, ...p })
const CV = '# 이름\n\n## 프로젝트\n### A\n**What did I do**\n- **하나 3건** — 첫째\n\n## 기술\n- 언어: TS\n'
const ctx = (p: Partial<Ctx> = {}): Ctx => ({ resume: CV, guide: 'G', role: '', roleDocs: '', since: '2026-10-18', entries: [E({})], ...p })
const stages = (): { log: string[]; on: (s: ResumeStage) => void } => { const log: string[] = []; return { log, on: s => log.push(`${s.stage}:${s.state}${s.note ? ` ${s.note}` : ''}`) } }

test('최신화 흐름 — 윤문을 켜면 쓰기와 사실 검증 사이에서 다듬은 글이 검증을 거친다 · 끄면 부르지 않는다', async () => {
  const w = { changes: [{ kind: 'add', where: 'A', before: '', after: '- **출력 99% 감소** — 묶어 보내는 방식을 통해 개선되어짐', anchor: '**What did I do**', why: 'w', shipped: true, evidence: ['r1.q1'] }] }
  const answers: Record<string, unknown> = { 'resume-judge': { verdicts: [{ id: 'r1', verdict: 'use', why: 'ok' }], candidates: [{ title: 'c', ids: ['r1'], why: 'y' }] }, 'resume-write': w, 'resume-polish': { items: [{ id: 0, after: '- **출력 99% 감소** — 묶어 보내도록 바꿈' }] }, 'resume-screen': { items: [{ id: 0, verdict: 'ok', why: '', fix: '' }] } }
  const mk = (calls: string[]): Ask => (async (task: string) => { calls.push(task); return { ok: true, value: answers[task] } }) as Ask
  const calls: string[] = [], s = stages()
  const r = await runUpdate(ctx({ polish: true }), mk(calls), s.on)
  assert.deepEqual(calls, ['resume-judge', 'resume-write', 'resume-polish', 'resume-screen'])
  assert.ok(r.ok && r.changes[0]!.after === '- **출력 99% 감소** — 묶어 보내도록 바꿈')
  assert.deepEqual(s.log.filter(l => /^(write|polish|verify):done/.test(l)).map(l => l.split(' ')[0]), ['write:done', 'polish:done', 'verify:done'])
  assert.ok(s.log.includes('polish:done 다듬음 1개'))
  const off: string[] = []
  await runUpdate(ctx(), mk(off), () => {})
  assert.deepEqual(off, ['resume-judge', 'resume-write', 'resume-screen'])
})

test('최신화 흐름 — 윤문 AI 가 실패해도 [최신화]는 원문으로 끝난다 · 후보가 없으면 윤문도 완료로 표시한다', async () => {
  const answers: Record<string, unknown> = { 'resume-judge': { verdicts: [{ id: 'r1', verdict: 'use', why: 'ok' }], candidates: [{ title: 'c', ids: ['r1'], why: 'y' }] }, 'resume-write': { changes: [{ kind: 'add', where: 'A', before: '', after: '- **출력 99% 감소** — 묶어 보냄', anchor: '**What did I do**', why: 'w', shipped: true, evidence: ['r1.q1'] }] }, 'resume-screen': { items: [{ id: 0, verdict: 'ok', why: '', fix: '' }] } }
  const ask: Ask = (async (task: string) => (task in answers ? { ok: true, value: answers[task] } : { ok: false, error: { code: 'timeout', message: '240초 안에 답이 오지 않았습니다' } })) as Ask
  const s = stages()
  const r = await runUpdate(ctx({ polish: true }), ask, s.on)
  assert.ok(r.ok && r.changes[0]!.after === '- **출력 99% 감소** — 묶어 보냄')
  assert.ok(s.log.includes('polish:done 건너뜀 — 240초 안에 답이 오지 않았습니다'))
  const none = stages()
  await runUpdate(ctx({ polish: true }), (async () => ({ ok: true, value: { verdicts: [{ id: 'r1', verdict: 'small', why: 's' }], candidates: [] } })) as Ask, none.on)
  assert.deepEqual(none.log.slice(-4), ['write:done 후보 없음', 'polish:done 후보 없음', 'verify:done 후보 없음', 'screen:done 후보 없음'])
})

test('점검 흐름 — 고쳐 쓴 줄이 있으면 윤문을 거쳐 검사로 간다', async () => {
  const cv = '# 이름\n\n## 프로젝트\n### A\n**What did I do**\n- **남 탓에 늦은 배포** — 둘째\n'
  const flag = { lines: [{ id: 'L6', bad: true, why: '내부 사정' }] }
  const rw = { changes: [{ kind: 'replace', where: 'A', before: '- **남 탓에 늦은 배포** — 둘째', after: '- **잘못된 데이터 정리** — 통해 확인되어짐', anchor: '', why: '[불리] 내부 사정', shipped: true, evidence: [] }], skipped: [] }
  const mk = (calls: string[]): Ask => (async (task: string) => { calls.push(task); return { ok: true, value: task === 'resume-rewrite' ? rw : task === 'resume-polish' ? { items: [{ id: 0, after: '- **잘못된 데이터 정리** — 확인함' }] } : flag } }) as Ask
  const calls: string[] = [], s = stages()
  const r = await runReview(ctx({ resume: cv, polish: true }), mk(calls), s.on)
  assert.ok(calls.includes('resume-polish') && calls.indexOf('resume-polish') > calls.indexOf('resume-rewrite'))
  assert.ok(r.ok && r.changes[0]!.after === '- **잘못된 데이터 정리** — 확인함')
  assert.deepEqual(s.log.filter(l => /^(rewrite|polish|rules):done/.test(l)).map(l => l.split(' ')[0]), ['rewrite:done', 'polish:done', 'rules:done'])
  const clean = stages()
  await runReview(ctx({ resume: cv, polish: true }), (async () => ({ ok: true, value: { lines: [{ id: 'L6', bad: false, why: '' }] } })) as Ask, clean.on)
  assert.ok(clean.log.includes('polish:done 다듬을 글 없음'))
})
