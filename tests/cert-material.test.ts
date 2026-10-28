import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validate } from '../src/main/ai/schema.ts'
import { BLIND_SCHEMA, EXPLAIN_SCHEMA, QCHECK_SCHEMA, VARIANT_SCHEMA, WRITE_SCHEMA, applyBlind, applyQCheck, cleanQuestion, lureCandidates, questionIssues, runMaterial, runVariant, writePrompt } from '../src/main/cert/material.ts'
import type { Ask } from '../src/main/ai/run.ts'
import type { CertItem, NewQuestion } from '../src/shared/cert.ts'

const fx = async (n: string) => JSON.parse(await readFile(`tests/fixtures/ai/${n}.json`, 'utf8'))
const item: CertItem = { id: 1, bookId: 1, subject: '소프트웨어 설계', title: '폭포수 모형', freq: 3, freqNote: '', pageFrom: 2, pageTo: 2, body: '폭포수 모형은 이전 단계로 돌아갈 수 없다는 전제 아래 각 단계를 확실히 매듭짓고 다음 단계로 넘어가는 선형 순차적 개발 모형이다. 이 항목은 시험에 자주 나온다.', ord: 0 }
const good: NewQuestion = { stem: '이전 단계로 돌아갈 수 없다는 전제의 모형은?', choices: ['나선형 모형', '폭포수 모형', '프로토타입 모형', '애자일 모형'], answer: 1, why: 'w', notes: ['1', '2', '3', '4'], quote: '이전 단계로 돌아갈 수 없다는 전제', choiceItems: ['나선형 모형', '', '', ''], refute: 'r' }

test('가짜 응답들은 스키마를 지킨다', async () => {
  assert.equal(validate(await fx('cert-explain'), EXPLAIN_SCHEMA), null)
  assert.equal(validate(await fx('cert-write'), WRITE_SCHEMA), null)
  assert.equal(validate(await fx('cert-blind'), BLIND_SCHEMA), null)
  assert.equal(validate(await fx('cert-variant'), VARIANT_SCHEMA), null)
  assert.equal(validate(await fx('cert-check'), QCHECK_SCHEMA), null)
})

test('규칙 검사 — 근거 문장 · 보기 겹침 · 모두/없음 보기 · 정답만 긴 보기', () => {
  assert.deepEqual(questionIssues(good, item.body), [])
  assert.deepEqual(questionIssues({ ...good, quote: '교재에 없는 문장입니다' }, item.body), ['근거 문장이 항목 글에 없다'])
  assert.deepEqual(questionIssues({ ...good, choices: ['나선형 모형', '폭포수 모형', '폭포수  모형', '애자일 모형'] }, item.body), ['보기가 겹친다'])
  assert.deepEqual(questionIssues({ ...good, choices: ['나선형 모형', '폭포수 모형', '프로토타입 모형', '위의 모두 맞다'] }, item.body), ["'모두 · 없음' 보기"])
  assert.deepEqual(questionIssues({ ...good, choices: ['나선형', '이전 단계로 돌아갈 수 없다는 전제 아래 단계를 매듭짓는 선형 순차 모형', '애자일', 'V 모형'] }, item.body), ['정답 보기만 유난히 길다'])
})

test('정리 — 보기별 개념 항목은 목록에 있는 다른 항목 제목만, 정답 보기는 빈 글', () => {
  const c = cleanQuestion({ ...good, choiceItems: ['나선형 모형', '폭포수 모형', '없는 제목', ''] }, ['나선형 모형', '애자일 모형'], '폭포수 모형')
  assert.deepEqual(c.choiceItems, ['나선형 모형', '', '', ''])
})

test('점검 적용 — 고친 문제는 규칙을 다시 거치고, 고칠 수 없으면 뺀다', () => {
  const qs = [good, { ...good, stem: '두 번째' }, { ...good, stem: '세 번째' }]
  const out = applyQCheck(qs, [
    { index: 1, ok: false, problem: '정답 둘', stem: '고친 물음', choices: ['나선형 모형', '폭포수 모형', 'V 모형', '애자일 모형'], answer: 1, why: '고친 이유', notes: ['1', '2', '3', '4'] },
    { index: 2, ok: false, problem: '모호', stem: '', choices: [], answer: 0, why: '', notes: [] },
    { index: 0, ok: true, problem: '', stem: '', choices: [], answer: 0, why: '', notes: [] }
  ], item.body)
  assert.deepEqual(out.map(q => q.stem), [good.stem, '고친 물음'])
})

test('점검 고침 — 정답이 바뀌면 근거 · 보기 설명 · 개념 태그 · 반박도 그 보기에 맞춘다', () => {
  const [out] = applyQCheck([good], [
    { index: 0, ok: false, problem: '정답 바뀜', stem: '고친 물음 2', choices: ['나선형 모형', '애자일 모형', '프로토타입 모형', 'V 모형'], answer: 2, why: '고친 이유', notes: ['n1', 'n2', 'n3', 'n4'] }
  ], item.body)
  assert.equal(out!.answer, 2)
  assert.deepEqual(out!.notes, ['n1', 'n2', 'n3', 'n4'])
  assert.deepEqual(out!.choiceItems, ['나선형 모형', '', '', ''])
  assert.equal(out!.refute, '')
})

test('점검 고침 — 설명 4개가 없으면 고친 문제도 뺀다', () => {
  const out = applyQCheck([good], [
    { index: 0, ok: false, problem: '정답 둘', stem: '고친 물음', choices: ['나선형 모형', '폭포수 모형', 'V 모형', '애자일 모형'], answer: 1, why: '고친 이유', notes: [] }
  ], item.body)
  assert.deepEqual(out, [])
})

test('점검 고침 — 같은 번호에 ok:false 와 ok:true 가 함께 오면 ok:false 가 이겨 뺀다', () => {
  const out = applyQCheck([good], [
    { index: 0, ok: false, problem: '고칠 수 없음', stem: '', choices: [], answer: 0, why: '', notes: [] },
    { index: 0, ok: true, problem: '', stem: '', choices: [], answer: 0, why: '', notes: [] }
  ], item.body)
  assert.deepEqual(out, [])
})

const other = (id: number, title: string, ord: number, body = 'b'): CertItem => ({ ...item, id, title, ord, body })
const same = [item, other(2, '나선형 모형', 1), other(3, '프로토타입 모형', 2), other(4, '애자일 모형', 5), other(5, '형상 관리', 9)]

test('오답 후보(앱) — ① 의 헷갈리는 항목 → 이 항목 글에 이름이 나오는 항목 → 교재에서 가까운 항목, 자기 자신 · 다른 과목 제외', () => {
  const body = { ...item, body: item.body + ' 애자일 모형과 다르다.' }
  assert.deepEqual(lureCandidates(body, [...same, { ...other(6, '정규화', 1), subject: '데이터베이스' }], ['프로토타입 모형', '없는 제목']), ['프로토타입 모형', '애자일 모형', '나선형 모형', '형상 관리'])
  assert.deepEqual(lureCandidates(item, same, [], 2), ['나선형 모형', '프로토타입 모형'])
  assert.match(writePrompt(item, ['나선형 모형']), /오답 후보 항목\(같은 과목, 헷갈리기 쉬운 순\): 나선형 모형/)
})

test('블라인드 풀이 대조 — 정답과 같은 보기를 고른 문제만 남긴다(-1 · 다른 보기 · 대답 없음은 뺀다, 같은 번호는 첫 대답)', () => {
  const qs = [good, { ...good, stem: '둘' }, { ...good, stem: '셋' }, { ...good, stem: '넷' }]
  const out = applyBlind(qs, [{ index: 0, pick: 1 }, { index: 1, pick: -1 }, { index: 2, pick: 0 }, { index: 0, pick: 3 }])
  assert.deepEqual(out.map(q => q.stem), [good.stem])
})

test('흐름 — 설명 → 오답 후보 → 쓰기 → 규칙 → 블라인드 → 점검, 남은 게 없으면 한 번 더 쓰고, 단계를 알린다', async () => {
  const calls: string[] = [], stages: string[] = []
  let n = 0
  const ask: Ask = (async (task: string) => {
    calls.push(task)
    if (task === 'cert-explain') return { ok: true, value: { explain: 'e', mnemonic: '', confusions: [{ title: '나선형 모형', diff: 'd' }, { title: '폭포수 모형', diff: '자기' }] } }
    if (task === 'cert-write') return { ok: true, value: { questions: ++n === 1 ? [{ ...good, quote: '없는 문장 없는 문장' }] : [good, { ...good, stem: '블라인드에서 틀릴 문제' }] } }
    if (task === 'cert-blind') return { ok: true, value: { answers: [{ index: 0, pick: 1, why: '' }, { index: 1, pick: 2, why: '' }] } }
    return { ok: false, error: { code: 'cli-error', message: '점검 실패' } }
  }) as Ask
  const r = await runMaterial(ask, item, same, '필기', (id, st, note) => { stages.push(`${id}:${st}${note ? ` ${note}` : ''}`) })
  assert.ok(r.ok)
  assert.deepEqual(r.material.confusions.map(c => c.title), ['나선형 모형']) // 자기 자신은 뺀다
  assert.deepEqual(r.questions.map(q => q.stem), [good.stem])
  assert.equal(r.dropped, 2) // 1회차 규칙 1 + 2회차 블라인드 1
  assert.deepEqual(calls, ['cert-explain', 'cert-write', 'cert-write', 'cert-blind', 'cert-check'])
  assert.deepEqual(stages.filter(x => x.includes(':done')).map(x => x.split(':')[0]), ['m-explain', 'm-lure', 'm-write', 'm-rules', 'm-blind', 'm-write', 'm-rules', 'm-blind', 'm-check'])
  assert.ok(stages.includes('m-blind:done 정답 일치 1 / 2'))
})

test('변형 문제 — 설명 없이 오답 후보부터, 이미 낸 물음과 같은 문제는 뺀다', async () => {
  const calls: string[] = []
  const ask: Ask = (async (task: string) => {
    calls.push(task)
    if (task === 'cert-variant') return { ok: true, value: { questions: [good, { ...good, stem: '새 물음' }] } }
    if (task === 'cert-blind') return { ok: true, value: { answers: [{ index: 0, pick: 1, why: '' }] } }
    return { ok: true, value: { verdicts: [] } }
  }) as Ask
  const r = await runVariant(ask, item, same, [good.stem], ['나선형 모형'])
  assert.ok(r.ok)
  assert.deepEqual(r.questions.map(q => q.stem), ['새 물음'])
  assert.deepEqual(calls, ['cert-variant', 'cert-blind', 'cert-check'])
})
