import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkPdfFile, fetchSource } from '../src/main/knowledgeFetch.ts'

const body = '본문 글입니다. '.repeat(40)
const srv = http.createServer((q, r) => {
  if (q.url === '/page') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<html><body><p>${body}</p></body></html>`) }
  else if (q.url === '/doc.pdf') { r.writeHead(200, { 'content-type': 'application/pdf' }); r.end('%PDF-1.4 fake') }
  else if (q.url === '/big') { r.writeHead(200, { 'content-type': 'text/html', 'content-length': '6000000' }); r.end('x') }
  else if (q.url === '/hang') { r.writeHead(200, { 'content-type': 'text/html' }); r.write('a') } // 끝나지 않는 응답
  else { r.writeHead(404); r.end('no') }
})
await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`
after(() => { srv.closeAllConnections(); srv.close() })
const get = (u: string, i: { signal: AbortSignal }) => fetch(u, i)
const sig = () => new AbortController().signal

test('웹 페이지는 글만 뽑아 준다', async () => {
  const r = await fetchSource(`${base}/page`, sig(), get)
  assert.ok('page' in r && r.page.includes('본문 글입니다') && !r.page.includes('<p>'))
})

test('PDF 는 주소 끝이 .pdf 이거나 응답이 pdf 면 바이트로 돌려준다', async () => {
  const r = await fetchSource(`${base}/doc.pdf`, sig(), get)
  assert.ok('pdf' in r && r.pdf.toString().startsWith('%PDF-'))
})

test('못 받으면 던진다 — 없는 주소 · 5MB 넘는 페이지', async () => {
  await assert.rejects(fetchSource(`${base}/none`, sig(), get), /fetch/)
  await assert.rejects(fetchSource(`${base}/big`, sig(), get), /fetch/)
})

test('부르는 쪽이 취소하면 끝나지 않는 응답도 멈춘다', async () => {
  const ac = new AbortController()
  const run = fetchSource(`${base}/hang`, ac.signal, get)
  setTimeout(() => ac.abort(), 50)
  await assert.rejects(run)
})

test('PDF 파일 검사 — 없는 파일 · .pdf 아님 · 폴더는 막고 .pdf 파일은 통과', () => {
  const d = mkdtempSync(join(tmpdir(), 'inkline-kf-'))
  writeFileSync(join(d, 'a.pdf'), '%PDF-'); writeFileSync(join(d, 'a.txt'), 'x'); mkdirSync(join(d, 'dir.pdf'))
  assert.doesNotThrow(() => checkPdfFile(join(d, 'a.pdf')))
  for (const bad of ['none.pdf', 'a.txt', 'dir.pdf']) assert.throws(() => checkPdfFile(join(d, bad)), /PDF 파일이 아닙니다/)
})
