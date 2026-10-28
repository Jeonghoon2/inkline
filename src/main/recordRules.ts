import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWrite } from './atomic.ts'
import { DEFAULT_RECORD_RULES, RECORD_RULES, type RecordRules } from '../shared/types.ts'
import { t } from '../shared/i18n.ts'

// 스킬 폴더가 없으면 null — 화면은 '스킬이 없습니다'를 보인다
export async function readRules(skillDir: string): Promise<RecordRules | null> {
  if (!(await stat(skillDir).then(s => s.isDirectory(), () => false))) return null
  let raw: Record<string, unknown> = {}
  try { raw = JSON.parse(await readFile(join(skillDir, 'rules.json'), 'utf8')).auto ?? {} } catch { /* 없거나 깨졌으면 기본값 */ }
  const out = { ...DEFAULT_RECORD_RULES }
  for (const { key } of RECORD_RULES) if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean
  return out
}

export async function writeRules(skillDir: string, v: unknown): Promise<RecordRules> {
  if (typeof v !== 'object' || v === null) throw new Error(t('잘못된 기준'))
  const r = v as Record<string, unknown>
  const out = { ...DEFAULT_RECORD_RULES }
  for (const { key } of RECORD_RULES) { if (typeof r[key] !== 'boolean') throw new Error(t('잘못된 기준')); out[key] = r[key] as boolean }
  const file = join(skillDir, 'rules.json')
  const body = { note: 'Inkline 앱 환경설정에서 고친다. work-history 스킬이 자동 기록 시점을 이 값으로 정한다', auto: out }
  await atomicWrite(file, JSON.stringify(body, null, 2) + '\n')
  return out
}
