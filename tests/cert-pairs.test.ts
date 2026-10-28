import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validate } from '../src/main/ai/schema.ts'
import { PAIR_SCHEMA, pairPrompt, runPair } from '../src/main/cert/pairs.ts'
import type { Ask } from '../src/main/ai/run.ts'
import type { CertItem } from '../src/shared/cert.ts'

const it = (id: number, title: string, body: string): CertItem => ({ id, bookId: 1, subject: 'A', title, freq: 0, freqNote: '', pageFrom: 1, pageTo: 1, body, ord: id })
const a = it(1, '화이트박스 테스트', '화이트박스 테스트는 원시 코드를 열어 놓고 모든 경로를 시험한다. 이 항목은 시험에 자주 나온다.')
const b = it(2, '블랙박스 테스트', '블랙박스 테스트는 입력과 출력만으로 기능을 확인한다. 이 항목은 시험에 자주 나온다.')

test('가짜 응답은 스키마를 지킨다', async () => {
  assert.equal(validate(JSON.parse(await readFile('tests/fixtures/ai/cert-pair.json', 'utf8')), PAIR_SCHEMA), null)
})

test('두 항목 본문만 근거로 — 근거 문장이 두 본문 어디에도 없으면 뺀다', async () => {
  const fx = JSON.parse(await readFile('tests/fixtures/ai/cert-pair.json', 'utf8'))
  fx.questions[1].quote = '두 본문에 없는 문장입니다'
  const ask: Ask = (async (task: string) => (task === 'cert-pair' ? { ok: true, value: fx } : task === 'cert-blind' ? { ok: true, value: { answers: [{ index: 0, pick: 0, why: '' }, { index: 1, pick: 0, why: '' }] } } : { ok: true, value: { verdicts: [] } })) as Ask
  const r = await runPair(ask, a, b)
  assert.ok(r.ok)
  assert.equal(r.diffs.length, 3)
  assert.equal(r.questions.length, 1)
  const p = pairPrompt(a, b)
  assert.ok(p.indexOf('화이트박스') < p.indexOf('블랙박스'))
  assert.match(p, /차이 3줄/)
})

test('AI 점검이 정답 둘 이상으로 판정한 문제는 뺀다', async () => {
  const fx = JSON.parse(await readFile('tests/fixtures/ai/cert-pair.json', 'utf8'))
  const calls: string[] = []
  const verdict = { index: 0, ok: false, problem: '정답 둘', stem: '', choices: [], answer: 0, why: '', notes: [] }
  const ask: Ask = (async (task: string) => {
    calls.push(task)
    return task === 'cert-pair' ? { ok: true, value: fx } : task === 'cert-blind' ? { ok: true, value: { answers: [{ index: 0, pick: 0, why: '' }, { index: 1, pick: 0, why: '' }] } } : { ok: true, value: { verdicts: [verdict] } }
  }) as Ask
  const r = await runPair(ask, a, b)
  assert.ok(r.ok)
  assert.equal(r.questions.length, 1)
  assert.equal(r.questions[0]!.stem, fx.questions[1].stem)
  assert.deepEqual(calls, ['cert-pair', 'cert-blind', 'cert-check'])
})

test('블라인드 풀이가 정답과 다르게 고른 쌍 문제는 뺀다', async () => {
  const fx = JSON.parse(await readFile('tests/fixtures/ai/cert-pair.json', 'utf8'))
  const ask: Ask = (async (task: string) => (task === 'cert-pair' ? { ok: true, value: fx } : task === 'cert-blind' ? { ok: true, value: { answers: [{ index: 0, pick: 0, why: '' }, { index: 1, pick: 2, why: '' }] } } : { ok: true, value: { verdicts: [] } })) as Ask
  const r = await runPair(ask, a, b)
  assert.ok(r.ok)
  assert.deepEqual(r.questions.map(q => q.stem), [fx.questions[0].stem])
})
