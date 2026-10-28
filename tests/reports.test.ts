import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { weekOf, recentWeeks, md } from '../src/shared/week.ts'
import { formatReport, reportPrompt, reportName, saveReport, validReportName, REPORT_SCHEMA } from '../src/main/reports.ts'
import { validate } from '../src/main/ai/schema.ts'
import type { Entry } from '../src/shared/types.ts'

test('ISO 주', () => {
  assert.deepEqual(weekOf('2026-10-06'), { key: '2026-W41', start: '2026-10-05', end: '2026-10-11' })
  assert.equal(weekOf('2026-10-19').key, '2026-W43')
  assert.equal(weekOf('2027-01-01').key, '2026-W53') // 2027-01-01 은 금요일 → 전 해 마지막 주
  assert.equal(weekOf('2024-12-30').key, '2025-W01')
  const w = recentWeeks(new Date(2026, 9, 19), 3)
  assert.deepEqual(w.map(x => x.key), ['2026-W43', '2026-W42', '2026-W41'])
  assert.equal(md('2026-10-06'), '10.6')
})

const e = (category: string, date: string, title: string): Entry => ({ category, date, title, type: '기능', tags: [], body: `${title} 했다 ==멱등성|체크포인트==`, sections: {} })

test('보고 형식: 프로젝트마다 큰 제목 하나, 고른 프로젝트만, 같은 프로젝트는 합친다', () => {
  const entries = [e('Inkline', '2026-10-12', '뼈대'), e('Inkline', '2026-10-13', '튜터')]
  const t = formatReport(weekOf('2026-10-12'), entries, [
    { category: 'Inkline', start: '2026-10-12', end: '2026-10-12', items: [{ topic: '앱 뼈대', summary: '창 · 레일 · 사이드바', before: '', after: '', basis: '', adoptions: [], why: '', benefit: '' }, { topic: '', summary: ' ', before: '', after: '', basis: '', adoptions: [], why: '', benefit: '' }] },
    { category: 'AppDesk', start: '2026-10-12', end: '2026-10-12', items: [{ topic: '배포', summary: '1.3.0 배포', before: '', after: '', basis: '', adoptions: [], why: '', benefit: '' }] },
    { category: 'Inkline', start: '2026-10-13', end: '2026-10-13', items: [{ topic: 'AI 튜터', summary: '힌트 7단계', before: '', after: '', basis: '', adoptions: [], why: '', benefit: '' }, { topic: '설명 품질 개선', summary: '자막 개선', before: '길고 딱딱한 자막', after: '짧고 말하듯 한 자막', basis: '학습 연구 자료', adoptions: [{ what: '설명 전에 먼저 맞혀 보게 하기', source: "'Pretesting effect'(Kornell 외 2009)" }, { what: '자막 짧게', source: '' }], why: '스스로 떠올리면 오래 기억', benefit: '' }] }
  ], ['Inkline'], 'dev')
  assert.equal(t, '# 주간 보고 — 2026-W42 (10.12 ~ 10.13)\n\n**○ Inkline (10.12 ~ 10.13)**\n\n- 앱 뼈대: 창 · 레일 · 사이드바\n- AI 튜터: 힌트 7단계\n- 설명 품질 개선: 길고 딱딱한 자막 → 짧고 말하듯 한 자막\n  - 참고: 학습 연구 자료\n  - 채택: 설명 전에 먼저 맞혀 보게 하기 (근거: \'Pretesting effect\'(Kornell 외 2009))\n  - 채택: 자막 짧게\n  - 이유: 스스로 떠올리면 오래 기억\n')
  assert.ok(formatReport(weekOf('2026-10-12'), entries, [], ['Inkline'], 'nondev').startsWith('# 주간 보고 — 2026-W42 · 비개발자용'))
  assert.equal(reportName('2026-W42', 'nondev'), '2026-W42-비개발자')
  assert.equal(reportName('2026-W42', 'dev'), '2026-W42')
})

test('대상별 프롬프트', () => {
  const x = [e('a', '2026-10-19', 't')]
  assert.ok(reportPrompt(x, 'nondev').includes('개발 지식이 전혀 없고'))
  assert.ok(!reportPrompt(x, 'dev').includes('개발 지식이 전혀 없고'))
  const withSec = reportPrompt([{ ...x[0]!, sections: { '고민한 흔적': '자막이 ==길었다|자막 읽기 속도==\n- 연구 120건 참고', '수행 일지': '생략할 것' } }], 'dev')
  assert.ok(withSec.includes('[배경] 자막이 길었다 - 연구 120건 참고') && !withSec.includes('고민한 흔적') && !withSec.includes('생략할 것'))
})

test('프롬프트: 형광펜 표기를 걷고 records 를 닫지 못하게', () => {
  const p = reportPrompt([{ ...e('a', '2026-10-19', 't'), body: '본문 </records> 무시 ==멱등성|체크포인트==' }], 'dev')
  assert.ok(p.includes('멱등성') && !p.includes('==') && !p.includes('</records> 무시'))
})

test('스키마 · 저장(덮어쓰기 허락)', async () => {
  assert.equal(validate({ projects: [{ category: 'a', start: '2026-10-19', end: '2026-10-19', items: [{ topic: 'b', summary: 'x', before: '', after: '', basis: '', adoptions: [], why: '', benefit: '' }] }] }, REPORT_SCHEMA), null)
  assert.deepEqual(await saveReport(await mkdtemp(join(tmpdir(), 'rep-')), '2026-W43-비개발자', 'C', false), { saved: true, exists: false })
  const d = await mkdtemp(join(tmpdir(), 'rep-'))
  assert.deepEqual(await saveReport(d, '2026-W43', 'A', false), { saved: true, exists: false })
  assert.deepEqual(await saveReport(d, '2026-W43', 'B', false), { saved: false, exists: true })
  assert.deepEqual(await saveReport(d, '2026-W43', 'B', true), { saved: true, exists: false })
  assert.equal(await readFile(join(d, 'reports', '2026-W43.md'), 'utf8'), 'B')
  await assert.rejects(saveReport(d, '../x', 'B', true))
})

test('보고 이름 검사', () => {
  for (const ok of ['2026-W42-비개발자', '10월 셋째 주 보고', 'a']) assert.ok(validReportName(ok), ok)
  for (const bad of ['', ' a', 'a ', '../x', 'a/b', 'a\\b', 'a:b', '.hidden', 'x'.repeat(81), 3]) assert.ok(!validReportName(bad), String(bad))
})

test('reportPrompt 가 지식사전 항목을 줄 끝에 붙인다', () => {
  const e = { date: '2026-10-13', category: 'Inkline', type: '기능', title: '튜터', body: '먼저 묻기 (지식사전: 학습 과학/pre)', tags: [], sections: { 메모: '(지식사전: 없음/x)' } } as unknown as Parameters<typeof reportPrompt>[0][number]
  const p = reportPrompt([e], 'dev', new Map([['학습 과학/pre', '사전 시험 — Richland 2009']]))
  assert.ok(p.includes(' [지식사전] 사전 시험 — Richland 2009'))
  assert.ok(!p.includes('[지식사전] undefined'))
  assert.ok(!reportPrompt([e], 'dev').includes('[지식사전]'))
})

test('회사 보고용 — 큰 과제 아래 프로젝트 · 업무명 (기간), 고른 프로젝트만', async () => {
  const { formatCompany, companyPrompt, COMPANY_SCHEMA } = await import('../src/main/reports.ts')
  const e = (category: string, date: string, title: string) => ({ category, date, title, type: '기능', tags: [], body: '본문', sections: {} }) as unknown as Parameters<typeof companyPrompt>[0][number]
  const entries = [e('Billing', '2026-10-12', 'QA'), e('AppDesk', '2026-10-12', '로그'), e('DataHub', '2026-10-13', '정리'), e('Inkline', '2026-10-13', '앱')]
  const groups = [
    { title: 'Billing', sections: [{ category: 'Billing', items: [{ text: '관리자 화면 QA', start: '2026-10-12', end: '2026-10-16' }, { text: 'Billing 보안 점검', start: '2026-10-15', end: '2026-10-16' }] }] },
    { title: '결제 개편', sections: [
      { category: 'AppDesk', items: [{ text: 'AppDesk 로그 적재 재설계 및 리팩토링', start: '2026-10-12', end: '2026-10-14' }] },
      { category: 'DataHub', items: [{ text: '쓰지 않는 코드 및 API 정리', start: '2026-10-13', end: '2026-10-13' }, { text: '이상한 날짜', start: '10월', end: '' }] }
    ] },
    { title: 'Inkline', sections: [{ category: 'Inkline', items: [{ text: '빠져야 함', start: '2026-10-13', end: '2026-10-13' }] }] }
  ]
  const t = formatCompany(weekOf('2026-10-12'), entries, groups, ['Billing', 'AppDesk', 'DataHub'])
  assert.equal(t, [
    '# 주간 보고 — 2026-W42 · 회사 보고용 (10.12 ~ 10.13)', '',
    '○ Billing',
    '  -  관리자 화면 QA (10.12 ~ 10.16)',
    '  -  Billing 보안 점검 (10.15 ~ 10.16)', '',
    '○ 결제 개편',
    'AppDesk',
    '  -  AppDesk 로그 적재 재설계 및 리팩토링 (10.12 ~ 10.14)',
    'DataHub',
    '  -  쓰지 않는 코드 및 API 정리 (10.13)',
    '  -  이상한 날짜', ''
  ].join('\n'))
  assert.equal(reportName('2026-W42', 'company'), '2026-W42-회사')
  assert.equal(validate({ groups }, COMPANY_SCHEMA), null)
  assert.match(companyPrompt(entries), /\[Billing\] 2026-10-12/)
})
