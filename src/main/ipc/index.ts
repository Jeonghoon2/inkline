import type { DatabaseSync } from 'node:sqlite'
import type { Settings } from '../../shared/types.ts'
import { createCtx } from './ctx.ts'
import { registerApp } from './app.ts'
import { registerCert } from './cert.ts'
import { registerCoding } from './coding.ts'
import { registerKnowledge } from './knowledge.ts'
import { registerPractice } from './practice.ts'
import { registerReports } from './reports.ts'
import { registerResume } from './resume.ts'
import { registerTheory } from './theory.ts'

// 채널은 기능마다 한 파일에서만 등록한다(같은 채널을 두 번 등록하면 앱이 켜질 때 죽는다 — tests/ipc-channels.test.ts)
export function registerIpc(db: DatabaseSync, defaults: Settings, notify: (channel: string) => void): () => void {
  const ctx = createCtx(db, defaults, notify)
  const stops = [registerApp, registerKnowledge, registerReports, registerResume, registerCoding, registerPractice, registerTheory, registerCert].map(r => r(ctx))
  return () => stops.forEach(stop => stop())
}
