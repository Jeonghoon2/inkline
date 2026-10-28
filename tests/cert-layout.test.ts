// tests/cert-layout.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gutterOf, orderPage, type Piece } from '../src/main/cert/layout.ts'
import { pdfPagesOrdered } from '../src/main/pdf.ts'

const P = (str: string, x: number, y: number, w = 200): Piece => ({ str, x, y, w })
// 쪽 너비 600: 왼쪽 단 50~250, 오른쪽 단 350~550, 같은 높이에 양쪽 줄이 있다(그린 순서는 줄마다 왼 → 오)
const twoCol = [P('머리말', 150, 780, 300), ...[0, 1, 2, 3].flatMap(i => [P(`왼${i}`, 50, 700 - i * 20), P(`오${i}`, 350, 700 - i * 20)]), P('7', 295, 30, 10)]

test('단 사이 여백을 찾고, 왼쪽 단 → 오른쪽 단, 전체 폭 줄은 그 자리', () => {
  assert.ok(Math.abs(gutterOf(twoCol, 600)! - 300) <= 10)
  assert.equal(orderPage(twoCol, 600), '머리말\n왼0\n왼1\n왼2\n왼3\n오0\n오1\n오2\n오3\n7')
})

test('가운데 놓인 좁은 위쪽 조각은 그 자리(왼쪽 단보다 먼저)', () => {
  assert.equal(orderPage([P('- 3 -', 288, 810, 24), ...twoCol], 600).split('\n')[0], '- 3 -')
})

test('여백이 둘(3단)이면 가운데 단이 아니라 실제 여백을 고른다', () => {
  const three = [0, 1, 2, 3].flatMap(i => [P(`가${i}`, 50, 700 - i * 20, 100), P(`나${i}`, 250, 700 - i * 20, 100), P(`다${i}`, 450, 700 - i * 20, 100)])
  const g = gutterOf(three, 600)!
  assert.ok(g !== null && three.every(p => !(p.x < g && p.x + p.w > g)), `gutter ${g}`)
})

test('1단이면 위에서 아래로, 같은 줄의 조각은 붙이고 사이가 벌면 띄운다', () => {
  const one = [P('소프트', 50, 700, 30), P('웨어', 80, 700, 20), P('공학', 110, 700, 20), ...[1, 2, 3, 4, 5, 6, 7].map(i => P(`줄${i}`, 50, 700 - i * 20, 500))]
  assert.equal(gutterOf(one, 600), null)
  assert.equal(orderPage(one, 600).split('\n')[0], '소프트웨어 공학')
})

test('연습 교재 PDF — 3쪽, 2단이 섞이지 않는다', async () => {
  const { pages, total } = await pdfPagesOrdered(new Uint8Array(await readFile('tests/fixtures/cert/sample.pdf')))
  assert.deepEqual([pages.length, total], [3, 3])
  assert.deepEqual((await pdfPagesOrdered(new Uint8Array(await readFile('tests/fixtures/cert/sample.pdf')), 2)).total, 3) // 자른 쪽 수와 실제 쪽 수
  const t = pages[1]!.replace(/\s+/g, '')
  assert.ok(t.indexOf('폭포수모형은') < t.indexOf('나선형모형은'))
  assert.ok(t.includes('선형순차적개발모형이다')) // 한 문장이 다른 단 글로 끊기지 않는다
})
