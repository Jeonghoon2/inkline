import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localDay } from '../src/shared/week.ts'

test('지역 날짜 — 밤 11시 30분 · 새벽 0시 5분에도 그날 날짜(UTC 로 하루가 어긋나지 않는다)', () => {
  assert.equal(localDay(new Date(2026, 9, 7, 23, 30)), '2026-10-07')
  assert.equal(localDay(new Date(2026, 0, 1, 0, 5)), '2026-01-01')
  assert.equal(localDay(new Date(2026, 11, 31, 23, 59)), '2026-12-31')
})

test('지역 날짜 — 예전에 손으로 조립하던 꼴과 3년 치 모든 날이 같다(월 · 일은 두 자리)', () => {
  const old = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  for (let d = new Date(2024, 0, 1); d < new Date(2027, 0, 1); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) assert.equal(localDay(d), old(d))
})
