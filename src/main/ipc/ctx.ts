import { join } from 'node:path'
import { homedir } from 'node:os'
import type { DatabaseSync } from 'node:sqlite'
import { getSettings, pickFirstAi } from '../db.ts'
import { detectTools } from '../detect.ts'
import { ask, type AskReq, type AskResult } from '../ai/run.ts'
import type { Settings, Tools } from '../../shared/types.ts'
import { AI_LANG_RULE, getLang } from '../../shared/i18n.ts'

export interface Ctx {
  db: DatabaseSync
  defaults: Settings
  notify: (channel: string) => void
  skillDir: string
  tools: () => Tools | null
  detect: () => Promise<Tools>
  aiAsk: <T>(o: Omit<AskReq, 'cli' | 'cliPath' | 'model' | 'effort'>) => Promise<AskResult<T>>
}

export function createCtx(db: DatabaseSync, defaults: Settings, notify: (channel: string) => void): Ctx {
  // 기록을 남기는 쪽은 work-history 스킬 — 기준은 스킬 폴더의 rules.json (My-History 는 읽기만 한다)
  const skillDir = process.env.INKLINE_SKILL_DIR || join(homedir(), '.claude', 'skills', 'work-history') // 시험용 앱은 INKLINE_SKILL_DIR 로 실제 스킬 설정을 건드리지 않는다
  let tools: Tools | null = null
  const detect = async () => { tools = await detectTools(process.env.PATH ?? ''); pickFirstAi(db, tools.ai); return tools }
  detect().catch(e => console.error('도구 탐지 실패', e))
  // 설정의 AI 와 탐지한 CLI 경로로 ask 요청을 만든다
  const aiAsk = async <T>(o: Omit<AskReq, 'cli' | 'cliPath' | 'model' | 'effort'>) => {
    const s = getSettings(db, defaults)
    const cli = s['ai.cli']
    const t = cli ? (tools ?? (await detect())) : null
    return ask<T>({ ...o, system: o.system + AI_LANG_RULE[getLang()], cli: cli || null, cliPath: (cli && t?.ai.find(x => x.id === cli && x.version !== null)?.path) || null, model: s['ai.model'], effort: s['ai.effort'] })
  }
  return { db, defaults, notify, skillDir, tools: () => tools, detect, aiAsk }
}
