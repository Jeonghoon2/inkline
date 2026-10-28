import type { AiCli, AiError } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

type Parsed = { ok: true; value: unknown } | { ok: false; error: AiError }
const fail = (code: AiError['code'], message: string): Parsed => ({ ok: false, error: { code, message } })

function json(text: string): Parsed {
  try { return { ok: true, value: JSON.parse(text) } } catch { return fail('bad-output', `JSON 이 아님: ${text.slice(0, 200)}`) }
}

export function parseCliOutput(cli: AiCli, stdout: string, lastMessage: string): Parsed {
  if (cli === 'codex') return json(lastMessage)
  let o: Record<string, unknown>
  try { o = JSON.parse(stdout) } catch { return fail('cli-error', stdout.trim().slice(-300)) }
  if (typeof o !== 'object' || o === null) return fail('cli-error', stdout.trim().slice(-300))
  if (cli === 'claude') {
    if (o.is_error) return { ok: false, error: cliFailure(String(o.result ?? ''), t('Claude 오류')) }
    if (o.structured_output !== undefined && o.structured_output !== null) return { ok: true, value: o.structured_output }
    return json(String(o.result ?? ''))
  }
  const text = String(o.response ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return json(text)
}

// CLI 가 실패할 때 남긴 글에서 사람이 읽을 오류 한 줄을 고른다 — hook 로그 · 프롬프트 메아리는 버리고 마지막 ERROR 줄
export function cliFailure(raw: string, fallback: string): AiError {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !/^(hook:|request id:|message id:|learn more:|details:|try rephrasing)/i.test(l))
  const errs = lines.filter(l => /^(api )?error[:\s]/i.test(l)).map(l => l.replace(/^(api )?error:?\s*/i, ''))
  const msg = (errs.at(-1) ?? lines.slice(-2).join(' ')).slice(0, 300) || fallback
  if (/safeguards flagged|usage policy|\baup\b/i.test(msg))
    return { code: 'busy', message: t('모델의 안전 장치가 이 요청을 막았습니다(오탐일 때가 많습니다) — 다시 만들거나 환경설정에서 다른 모델을 고르세요 ({msg})', { msg: msg.slice(0, 120) }) }
  if (/not logged in|\/login|log ?in required|unauthenticated|auth method|invalid api key|\b401\b/i.test(msg))
    return { code: 'cli-error', message: t('AI 도구에 로그인돼 있지 않습니다 — 터미널에서 그 도구(claude · codex · gemini)를 한 번 실행해 로그인한 뒤 다시 시도하세요 ({msg})', { msg }) }
  if (/at capacity|overloaded|rate.?limit|too many requests|\b429\b|quota/i.test(msg))
    return { code: 'busy', message: t('선택한 모델이 지금 붐빕니다 — 잠시 뒤 다시 시도하거나 환경설정에서 다른 모델을 고르세요 ({msg})', { msg }) }
  return { code: 'cli-error', message: msg }
}
