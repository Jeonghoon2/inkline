import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validPatch } from '../src/main/cert/patch.ts'
import { DEFAULT_RULES } from '../src/shared/cert.ts'

const ok = { name: '정보처리기사', kind: '필기', subjects: ['A', 'B'], rules: DEFAULT_RULES, examDate: '2026-11-20' }
test('확인 카드 값 검사 — 이름 · 종류 · 과목 · 기준 범위 · 시험일 꼴', () => {
  assert.deepEqual(validPatch(ok), ok)
  assert.deepEqual(validPatch({ ...ok, examDate: null }).examDate, null)
  assert.deepEqual(validPatch({ ...ok, subjects: ['A', ' A', 'B'] }).subjects, ['A', 'B']) // 같은 과목은 하나로
  for (const bad of [{ ...ok, name: '' }, { ...ok, kind: '면접' }, { ...ok, subjects: [] }, { ...ok, subjects: Array.from({ length: 13 }, (_, i) => `x${i}`) }, { ...ok, rules: { ...DEFAULT_RULES, minAvg: 101 } }, { ...ok, examDate: '11/20' }])
    assert.throws(() => validPatch(bad))
})
