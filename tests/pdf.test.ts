import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdfPages, pagedText } from '../src/main/pdf.ts'

function makePdf(texts: string[]): Uint8Array {
  const objs: string[] = []
  const n = texts.length
  objs.push('<< /Type /Catalog /Pages 2 0 R >>')
  objs.push(`<< /Type /Pages /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`)
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  texts.forEach((t, i) => {
    const c = `BT /F1 24 Tf 72 700 Td (${t}) Tj ET`
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`)
    objs.push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`)
  })
  let s = '%PDF-1.4\n'
  const off: number[] = []
  objs.forEach((o, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = s.length
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  return new TextEncoder().encode(s)
}

test('pdfPages: 쪽별 글', async () => {
  const pages = await pdfPages(makePdf(['Hello one', 'Second page']))
  assert.deepEqual(pages, ['Hello one', 'Second page'])
  assert.deepEqual(await pdfPages(makePdf(['a', 'b']), 1), ['a'])
})

test('pagedText: [p.N] 형식과 쪽 경계 cap', () => {
  assert.equal(pagedText(['가', '나']), '[p.1] 가\n\n[p.2] 나')
  const t = pagedText(['x'.repeat(30), 'y'.repeat(30), 'z'], 50)
  assert.equal(t, `[p.1] ${'x'.repeat(30)}\n\n…(이하 생략: p.2부터)`)
})
