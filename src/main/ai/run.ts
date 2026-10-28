import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AiCli, AiError } from '../../shared/types.ts'
import { cliArgs, stdinFor } from './args.ts'
import { cliFailure, parseCliOutput } from './parse.ts'
import { spawnGroup } from '../proc.ts'
import { validate, type JsonSchema } from './schema.ts'
import { t } from '../../shared/i18n.ts'

export interface AskReq {
  task: string; cli: AiCli | null; cliPath: string | null; model: string; effort: string
  system: string; prompt: string; schema: JsonSchema; timeoutMs: number; deadlineMs?: number; signal?: AbortSignal; web?: boolean // deadlineMs: 재시도까지 합친 전체 시간, web: 웹 검색 허용
}
export type AskResult<T> = { ok: true; value: T } | { ok: false; error: AiError }
// 모듈(이력서 · 이론 · 자격증)이 밖에서 넣어 받는 AI 호출 꼴 — 시험은 가짜 응답을 넣는다
export type Ask = <T>(task: string, prompt: string, schema: JsonSchema) => Promise<AskResult<T>>

const CAP = 2 * 1024 * 1024
const err = (code: AiError['code'], message: string): { ok: false; error: AiError } => ({ ok: false, error: { code, message } })

type Raw = { ok: true; stdout: string; last: string } | { ok: false; error: AiError }

async function runOnce(req: AskReq, cli: AiCli, cliPath: string, dir: string, prompt: string): Promise<Raw> {
  const schemaFile = join(dir, 'schema.json')
  const outFile = join(dir, 'last.txt')
  await rm(outFile, { force: true })
  await writeFile(schemaFile, JSON.stringify(req.schema))
  const args = cliArgs(cli, { model: req.model, effort: req.effort, schema: req.schema, system: req.system, schemaFile, outFile, cwd: dir, web: req.web })
  const r = await spawnGroup(cliPath, args, { cwd: dir, stdin: stdinFor(cli, req.system, prompt, req.schema), timeoutMs: req.timeoutMs, signal: req.signal, maxOutput: CAP })
  if (r.aborted) return err('aborted', t('취소했습니다'))
  if (r.timedOut) return err('timeout', t('{s}초 안에 답이 오지 않았습니다', { s: Math.round(req.timeoutMs / 1000) }))
  if (r.error) return err('cli-error', r.error)
  const { stdout, stderr, code } = r
  if (code !== 0) {
    // claude 는 오류를 stdout 의 JSON 으로 알리고 1 로 끝난다
    const p = parseCliOutput(cli, stdout, '')
    if (!p.ok && p.error.code === 'cli-error' && p.error.message) return { ok: false, error: p.error }
    return { ok: false, error: cliFailure(stderr.trim() ? stderr : stdout, t('종료 코드 {code}', { code: String(code) })) }
  }
  const last = cli === 'codex' ? await readFile(outFile, 'utf8').catch(() => '') : ''
  return { ok: true, stdout, last }
}

export async function ask<T>(req: AskReq): Promise<AskResult<T>> {
  if (process.env.INKLINE_FAKE_AI === '1') {
    // 화면 점검용 — 진행 중 모습(타임라인 · 막대)을 보려고 가짜 응답을 늦춘다(밀리초)
    const lag = Number(process.env.INKLINE_FAKE_AI_DELAY) || 0
    if (lag > 0) await new Promise(r => setTimeout(r, lag))
    let v: unknown
    try { v = JSON.parse(await readFile(join(process.cwd(), 'tests/fixtures/ai', `${req.task}.json`), 'utf8')) }
    catch { return err('bad-output', `가짜 AI 응답 파일이 없습니다: ${req.task}`) }
    const e = validate(v, req.schema)
    return e ? err('bad-output', e) : { ok: true, value: v as T }
  }
  if (req.signal?.aborted) return err('aborted', t('취소했습니다'))
  if (!req.cli) return err('no-cli', t('환경설정에서 AI 를 골라 주세요'))
  if (!req.cliPath) return err('not-installed', t('{cli} 가 설치돼 있지 않습니다 — 환경설정에서 다시 고르세요', { cli: req.cli }))
  const dir = await mkdtemp(join(tmpdir(), 'inkline-ai-'))
  try {
    let prompt = req.prompt
    let lastErr = ''
    const start = Date.now()
    for (let attempt = 0; attempt < 2; attempt++) {
      let r = req
      if (req.deadlineMs !== undefined) {
        const left = req.deadlineMs - (Date.now() - start)
        if (attempt > 0 && left < 1000) return err('timeout', t('{s}초 안에 답이 오지 않았습니다', { s: Math.round(req.deadlineMs / 1000) }))
        r = { ...req, timeoutMs: Math.max(1, Math.min(req.timeoutMs, left)) }
      }
      const raw = await runOnce(r, req.cli, req.cliPath, dir, prompt)
      if (!raw.ok) return raw
      const p = parseCliOutput(req.cli, raw.stdout, raw.last)
      if (!p.ok) {
        if (p.error.code !== 'bad-output') return p
        lastErr = p.error.message
      } else {
        const e = validate(p.value, req.schema)
        if (!e) return { ok: true, value: p.value as T }
        lastErr = e
      }
      prompt = `${req.prompt}\n\n직전 답이 형식에 맞지 않았다: ${lastErr}. 형식에 맞는 JSON 하나만 다시 답한다.`
    }
    return err('bad-output', lastErr)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
