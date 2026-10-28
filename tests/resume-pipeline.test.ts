import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validate, type JsonSchema } from '../src/main/ai/schema.ts'
import { RESUME_SCHEMA } from '../src/main/resumeUpdate.ts'
import { FIND_SCHEMA, JUDGE_SCHEMA, SCREEN_SCHEMA, WRITE_SCHEMA, quoteTable, cvLines, findPrompt, judgePrompt, recIds, rewritePrompt, runReview, runUpdate, type Ctx } from '../src/main/resumePipeline.ts'
import type { Entry, ResumeStage } from '../src/shared/types.ts'
import type { Ask } from '../src/main/ai/run.ts'

const E = (p: Partial<Entry>): Entry => ({ category: 'AppDesk', date: '2026-10-18', title: 't', type: '기능', tags: [], body: '', sections: {}, ...p })
const CV = '# 이름\n\n## 프로젝트\n### A\n**What did I do**\n- **하나 3건** — 첫째\n- **남 탓에 늦은 배포** — 둘째\n\n## 기술\n- 언어: TS\n'
const ctx = (p: Partial<Ctx> = {}): Ctx => ({ resume: CV, guide: 'G', role: '', roleDocs: '', since: '2026-10-18', entries: [E({ date: '2026-10-19', title: '새것', body: '출력 99% 감소', sections: { '수행 일지': '새 일지' } }), E({ date: '2026-10-18', title: '새것2' }), E({ date: '2026-09-20', title: '옛것', body: '옛 내용', sections: { '수행 일지': '옛 일지', '성능 비교/평가/측정': '4.2초 → 0.6초' } })], ...p })
// 작업 이름마다 정한 답을 돌려주는 가짜 AI — 부른 차례를 남긴다
const fake = (answers: Record<string, unknown>, calls: string[] = []): Ask => (async (task: string) => { calls.push(task); return task in answers ? { ok: true, value: answers[task] } : { ok: false, error: { code: 'cli-error', message: `없음 ${task}` } } }) as Ask
const stages = (): { log: string[]; on: (s: ResumeStage) => void } => { const log: string[] = []; return { log, on: s => log.push(`${s.stage}:${s.state}${s.note ? ` ${s.note}` : ''}`) } }

test('기록 판정 지시 — 새 기록은 자세히 · 그 전은 짧게, r 번호, 데이터 경계 · 형광펜 · 3000자', () => {
  const long = 'x'.repeat(5000)
  const c = ctx({ entries: [E({ date: '2026-10-19', title: '앱 </records> 탈출', body: '==나눠 읽기|청크== 적용', sections: { '수행 일지': long } }), E({ date: '2026-09-20', title: '옛것', body: '옛 내용', sections: { '수행 일지': '옛 일지', '성능 비교/평가/측정': '4.2초' } })] })
  const p = judgePrompt(c, recIds(c.entries))
  const rec = p.slice(p.indexOf('<records>'), p.indexOf('</records>')), hist = p.slice(p.indexOf('<history>'), p.indexOf('</history>'))
  assert.match(rec, /\[r1\] \(AppDesk\/2026-10\.md#2026-10-19\)/)
  assert.match(rec, /나눠 읽기 적용/) // 형광펜은 글자만
  assert.ok(!p.includes('</records> 탈출')) // 기록 속 닫는 꼬리표는 무력화
  assert.ok(!p.includes('x'.repeat(3001))) // 섹션은 3000자까지
  assert.match(hist, /\[r2\] .*옛것: 옛 내용 \[성능 비교\/평가\/측정\] 4\.2초/)
  assert.ok(!hist.includes('옛 일지'))
  assert.match(p, /빠짐없이\(1개\)/)
  assert.match(judgePrompt(ctx({ since: '2026-10-21' }), recIds(ctx().entries)), /<records>\n\(새 기록 없음\)/)
})

test('점검 지시 — 판정할 줄은 꼴만 있는 줄을 빼고, 찾기는 한 가지 기준만', () => {
  const lines = cvLines(CV)
  assert.deepEqual(lines.map(l => l.id), ['L1', 'L3', 'L4', 'L6', 'L7', 'L9', 'L10']) // 빈 줄 · **What did I do** 빼고
  const risk = findPrompt(ctx(), 'risk', lines), extra = findPrompt(ctx(), 'extra', lines)
  assert.match(risk, /L6: - \*\*하나 3건\*\*/)
  assert.match(risk, /불리한 내용/); assert.ok(!risk.includes('불필요한 내용'))
  assert.match(extra, /불필요한 내용/); assert.ok(!extra.includes('불리한 내용'))
  assert.match(extra, /<guide>/) // 직무와 무관한지는 가이드가 있어야 안다
  const rw = rewritePrompt(ctx(), [{ id: 'L7', text: '- **남 탓에 늦은 배포** — 둘째', why: ['[불리] 내부 사정'] }], recIds(ctx().entries))
  assert.match(rw, /<flagged>\nL7: - \*\*남 탓에 늦은 배포\*\* — 둘째\n {2}걸린 이유: \[불리\] 내부 사정/)
  assert.match(rw, /다른 줄은 건드리지 않는다/)
})

test('최신화 — 판정 → 쓰기 → 검증 → 점검, 빠진 판정 · 모르는 id · 불리한 제안 고쳐 쓰기', async () => {
  const calls: string[] = [], s = stages()
  const r = await runUpdate(ctx(), fake({
    'resume-judge': { verdicts: [{ id: 'r1', verdict: 'use', why: '성과' }], candidates: [{ title: '출력 묶기', ids: ['r1', 'r9'], why: '수치 있음' }, { title: '모르는 것', ids: ['r99'], why: 'x' }] },
    'resume-write': { changes: [{ kind: 'add', where: 'A', before: '', after: '- **겨우 출력 99% 감소** — 묶어 보냄', anchor: '- **하나 3건** — 첫째', why: 'w', shipped: true, evidence: ['r1.q1'] }], skipped: [] },
    'resume-screen': { items: [{ id: 0, verdict: 'risky', why: '남 탓이 드러남', fix: '- **알림 발송 99% 감소** — 묶어 보냄' }] }
  }, calls), s.on)
  assert.deepEqual(calls, ['resume-judge', 'resume-write', 'resume-screen'])
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.skipped, [{ title: '[AppDesk] 2026-10-18 기능 — 새것2', why: '판정 없음 — AI 가 이 기록을 판정하지 않았습니다' }]) // r2 는 판정이 빠졌다
  assert.equal(r.changes.length, 1)
  assert.equal(r.changes[0]!.after, '- **알림 발송 99% 감소** — 묶어 보냄') // 점검이 고쳐 쓴 글
  assert.deepEqual(r.changes[0]!.warnings, ['[점검] 불리해서 고쳐 썼습니다 — 남 탓이 드러남'])
  assert.deepEqual(s.log, ['judge:on', 'judge:done 새 기록 2건 판정 · 후보 1개 · 판정 빠짐 1', 'write:on', 'write:done 제안 1개', 'verify:on', 'verify:done 경고 1개 · 막힘 0개', 'screen:on', 'screen:done 불리 1 · 불필요 0'])
})

test('최신화 — 후보가 없으면 쓰기 · 점검을 부르지 않는다, AI 오류는 그대로', async () => {
  const calls: string[] = [], s = stages()
  const r = await runUpdate(ctx(), fake({ 'resume-judge': { verdicts: [{ id: 'r1', verdict: 'small', why: '작음' }, { id: 'r2', verdict: 'covered', why: '있음' }], candidates: [] } }, calls), s.on)
  assert.deepEqual(calls, ['resume-judge'])
  assert.ok(r.ok && r.changes.length === 0 && r.skipped.map(x => x.why).join('|') === '작은 수정 — 작음|이미 반영 — 있음')
  assert.deepEqual(s.log.slice(-3), ['write:done 후보 없음', 'verify:done 후보 없음', 'screen:done 후보 없음'])
  const bad = await runUpdate(ctx(), fake({}), () => {})
  assert.deepEqual(bad, { ok: false, error: { code: 'cli-error', message: '없음 resume-judge' } })
})

test('점검 — 두 찾기는 함께 돌고, 고쳐 쓰기는 걸린 줄만', async () => {
  const s = stages()
  let open = 0, both = false
  const ask = (async (task: string) => {
    open++; if (open === 2) both = true
    await new Promise(r => setTimeout(r, 5))
    open--
    if (task === 'resume-find-risk') return { ok: true, value: { lines: [{ id: 'L7', bad: true, why: '남 탓이 드러남' }, { id: 'L6', bad: false, why: '' }] } }
    if (task === 'resume-find-extra') return { ok: true, value: { lines: [{ id: 'L7', bad: false, why: '' }] } }
    return { ok: true, value: { changes: [
      { kind: 'replace', where: 'A', before: '- **남 탓에 늦은 배포** — 둘째', after: '- **원인 데이터 정리** — 둘째', anchor: '', why: '[불리] 남 탓', shipped: true, evidence: [] },
      { kind: 'remove', where: 'A', before: '- **하나 3건** — 첫째', after: '', anchor: '', why: '[불필요] 범위 밖', shipped: true, evidence: [] },
      { kind: 'add', where: 'A', before: '', after: '- x', anchor: '## 기술', why: '더하기', shipped: true, evidence: [] }
    ], skipped: [] } }
  }) as Ask
  const r = await runReview(ctx(), ask, s.on)
  assert.equal(both, true) // 불리 찾기 · 불필요 찾기가 동시에
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.changes.map(c => c.before), ['- **남 탓에 늦은 배포** — 둘째'])
  assert.deepEqual(r.risky, [])
  assert.ok(s.log.includes('rewrite:done 고칠 줄 1개 · 제안 1개 · 범위 밖 2개 버림'))
  assert.ok(s.log.some(l => l.startsWith('risk:done 7줄 중 1줄 · 판정 빠짐 5')))
})

test('점검 — 걸린 줄이 없으면 고쳐 쓰기를 부르지 않고, 규칙 그물만', async () => {
  const calls: string[] = []
  const none = { lines: cvLines(CV).map(l => ({ id: l.id, bad: false, why: '' })) }
  const r = await runReview(ctx(), fake({ 'resume-find-risk': none, 'resume-find-extra': none }, calls), () => {})
  assert.deepEqual(calls.sort(), ['resume-find-extra', 'resume-find-risk'])
  assert.ok(r.ok && r.changes.length === 0 && r.risky.length === 1 && r.risky[0]!.words.join() === '탓에')
})

test('가짜 AI 응답 파일은 모듈 스키마를 지킨다', async () => {
  const files: [string, JsonSchema][] = [['resume-judge', JUDGE_SCHEMA], ['resume-write', WRITE_SCHEMA], ['resume-screen', SCREEN_SCHEMA], ['resume-find-risk', FIND_SCHEMA], ['resume-find-extra', FIND_SCHEMA], ['resume-rewrite', RESUME_SCHEMA]]
  for (const [f, schema] of files) assert.equal(validate(JSON.parse(await readFile(`tests/fixtures/ai/${f}.json`, 'utf8')), schema), null, f)
})

test('보완할 경험(본인용 메모)은 점검하지 않고, 점검이 수치를 지우는 고쳐 쓰기는 받지 않는다', async () => {
  const cv = '# n\n## 프로젝트\n- **하나 3건** — 첫째\n## 보완할 경험\n### 부족한 경험\n- **Spark** — 외주 없이 한 번도 안 씀\n'
  assert.deepEqual(cvLines(cv).map(l => l.id), ['L1', 'L2', 'L3'])
  const r = await runUpdate(ctx({ resume: cv }), fake({
    'resume-judge': { verdicts: [], candidates: [{ title: 'x', ids: ['r1'], why: 'y' }] },
    'resume-write': { changes: [{ kind: 'add', where: 'A', before: '', after: '- **출력 99% 감소** — 묶음', anchor: '- **하나 3건** — 첫째', why: 'w', shipped: true, evidence: ['r1.q1'] }], skipped: [] },
    'resume-screen': { items: [{ id: 0, verdict: 'risky', why: '작업량', fix: '- **출력 감소** — 묶음' }] }
  }), () => {})
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.changes[0]!.after, '- **출력 99% 감소** — 묶음') // 원래 글 그대로
  assert.match(r.changes[0]!.warnings[0]!, /\[점검\] 불리 — 작업량 \(고쳐 쓴 글이 99 을 지워 쓰지 않았습니다\)/)
})

test('운영 배포 전 — 프로젝트 제목에 있으면 그 아래 줄은 따로 표시 없어도, 점검이 표시를 지우면 받지 않는다', async () => {
  const cv = '# n\n### 결제 개편 (운영 배포 전)\n**Description**\n설명 한 줄\n### 다른 것\n- 줄\n'
  const add = (anchor: string) => ({ kind: 'add' as const, where: 'A', before: '', after: '실습 흐름도 확인했다', anchor, why: 'w', shipped: false, evidence: ['r1.q1'] })
  const r = await runUpdate(ctx({ resume: cv }), fake({ 'resume-judge': { verdicts: [], candidates: [{ title: 'x', ids: ['r1'], why: 'y' }] }, 'resume-write': { changes: [add('설명 한 줄'), add('- 줄')], skipped: [] }, 'resume-screen': { items: [] } }), () => {})
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.changes.map(c => c.warnings.some(w => w.includes('표시가 없습니다'))), [false, true])
  const s2 = await runUpdate(ctx(), fake({
    'resume-judge': { verdicts: [], candidates: [{ title: 'x', ids: ['r1'], why: 'y' }] },
    'resume-write': { changes: [{ kind: 'add', where: 'A', before: '', after: '- **출력 99% 감소** (운영 배포 전)', anchor: '- **하나 3건** — 첫째', why: 'w', shipped: false, evidence: ['r1.q1'] }], skipped: [] },
    'resume-screen': { items: [{ id: 0, verdict: 'risky', why: '미배포를 앞세움', fix: '- **출력 99% 감소**' }] }
  }), () => {})
  assert.ok(s2.ok && s2.changes[0]!.after === '- **출력 99% 감소** (운영 배포 전)')
})

test('직무 첫 초안 — 보완할 경험 후보는 근거 기록 없이도 남고, 지시는 직무일 때만', async () => {
  const calls: string[] = []
  const prompts: string[] = []
  const ask = (async (task: string, prompt: string) => { calls.push(task); prompts.push(prompt); return task === 'resume-judge' ? { ok: true, value: { verdicts: [], candidates: [{ title: '보완할 경험', ids: [], why: '점검표' }] } } : task === 'resume-write' ? { ok: true, value: { changes: [], skipped: [] } } : { ok: true, value: { items: [] } } }) as Ask
  await runUpdate(ctx({ role: 'data-engineer' }), ask, () => {})
  assert.deepEqual(calls, ['resume-judge', 'resume-write']) // 후보가 남아 쓰기까지 간다(제안 0개라 점검은 부르지 않음)
  assert.match(prompts[0]!, /보완할 경험' 이 비어 있으면/)
  assert.ok(!judgePrompt(ctx(), recIds(ctx().entries)).includes("보완할 경험' 이 비어 있으면")) // 기본 이력서에는 없다
})

test('보완할 경험 — 제목 줄 자체에 넣어도 알아보고, 점검은 보지 않으며, 빈칸 · 소속 줄을 지우는 고쳐 쓰기는 받지 않는다', async () => {
  const cv = '# n\n## 프로젝트\n- **하나 3건** — 첫째\n## 보완할 경험\n### 부족한 경험\n'
  const calls: string[] = []
  const r = await runUpdate(ctx({ resume: cv, role: 'backend' }), fake({
    'resume-judge': { verdicts: [], candidates: [{ title: '보완할 경험', ids: [], why: '점검표' }, { title: 'x', ids: ['r1'], why: 'y' }] },
    'resume-write': { changes: [
      { kind: 'add', where: '보완할 경험', before: '', after: '- **Spark** — 기록이 없다', anchor: '## 보완할 경험', why: 'w', shipped: true, evidence: [] },
      { kind: 'add', where: 'P', before: '', after: '### 새 일 (운영 배포 전)\n소속: [회사] / 기간: [YYYY.MM]\n- **출력 99% 감소** — 묶음', anchor: '- **하나 3건** — 첫째', why: 'w', shipped: false, evidence: ['r1.q1'] }
    ], skipped: [] },
    'resume-screen': { items: [{ id: 0, verdict: 'risky', why: '빈칸', fix: '### 새 일 (운영 배포 전)\n- **출력 99% 감소** — 묶음' }] }
  }, calls), () => {})
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.changes[0]!.warnings, []) // 보완할 경험 줄: 근거 · 수치를 묻지 않는다(제목 줄을 anchor 로 써도)
  assert.match(r.changes[1]!.after, /소속: \[회사\]/) // 점검의 고쳐 쓰기를 받지 않았다
  assert.match(r.changes[1]!.warnings[0]!, /소속 · 기간 빈칸/)
})

test('근거 고르기 — 앱이 기록에서 문장을 뽑아 번호를 붙이고(숫자 든 문장 먼저), AI 가 고른 번호를 원문 그대로의 글귀로 바꾼다', async () => {
  const e = E({ date: '2026-10-19', title: '쿠폰 생성 검사', body: '실제로 10세트(쿠폰 30장)를 만들었다. 정답을 직접 계산해 모두 맞았다.', sections: { '수행 일지': '- 답이 같은 세트는 버리고 다시 만들게 했다(MR !61).\n- 짧음' } })
  const q = quoteTable([['r1', e]])
  assert.deepEqual(q.map(x => x.text), ['실제로 10세트(쿠폰 30장)를 만들었다.', '답이 같은 세트는 버리고 다시 만들게 했다(MR !61).', '쿠폰 생성 검사', '정답을 직접 계산해 모두 맞았다.']) // 숫자 없는 문장은 원래 차례대로
  assert.deepEqual(q.map(x => x.id), ['r1.q1', 'r1.q2', 'r1.q3', 'r1.q4'])
  const s = stages()
  const r = await runUpdate(ctx({ entries: [e], since: '2026-10-01' }), fake({
    'resume-judge': { verdicts: [{ id: 'r1', verdict: 'use', why: 'w' }], candidates: [{ title: '쿠폰', ids: ['r1'], why: 'w' }] },
    'resume-write': { changes: [{ kind: 'add', where: 'A', before: '', after: '- **쿠폰 30장 정답 확인** — 직접 계산', anchor: '- **하나 3건** — 첫째', why: 'w', shipped: true, evidence: ['r1.q1', 'r1.q4', 'r9.q1'] }] },
    'resume-screen': { items: [] }
  }), s.on)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.changes[0]!.evidence, [{ ref: 'AppDesk/2026-10.md#2026-10-19', quote: '실제로 10세트(쿠폰 30장)를 만들었다.' }, { ref: 'AppDesk/2026-10.md#2026-10-19', quote: '정답을 직접 계산해 모두 맞았다.' }])
  assert.deepEqual(r.changes[0]!.warnings.filter(w => /근거/.test(w)), []) // 고른 글귀는 늘 기록에 있다
  assert.ok(s.log.includes('write:done 제안 1개 · 모르는 근거 번호 1개 버림'))
})

test('개인 작업 — 기록 줄에 \'· 개인\' 표시, 지시에 회사 경력과 가르라고', () => {
  const c = ctx({ personal: ['AppDesk'] })
  const p = judgePrompt(c, recIds(c.entries))
  assert.match(p, /\[r1\] \(AppDesk\/2026-10\.md#2026-10-19\) \[AppDesk · 개인\]/)
  assert.ok(!judgePrompt(ctx(), recIds(ctx().entries)).includes('· 개인]'))
})

test('직무 이력서 — 기본 이력서의 경력을 넘겨 소속을 알게', () => {
  const p = judgePrompt(ctx({ role: 'backend', career: '### 검증회사 · 개발자\n기간: 2024.03 - 현재' }), recIds(ctx().entries))
  assert.match(p, /<career>\n기본 이력서의 경력[^\n]*\n### 검증회사 · 개발자/)
  assert.ok(!judgePrompt(ctx(), recIds(ctx().entries)).includes('<career>'))
})
