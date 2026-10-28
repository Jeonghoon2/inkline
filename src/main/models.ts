import type { AiCli, ModelInfo, Tools } from '../shared/types.ts'
import { runCapture } from './detect.ts'

// claude: --model 별칭, --effort. gemini: -m 별칭(노력 수준 옵션 없음). 둘 다 직접 입력도 받는다
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
// 별칭(opus 등)은 늘 최신으로 풀리지만 버전이 안 보여서, 정식 이름과 버전을 보여 주고 정식 이름을 넘긴다
// ponytail: 버전 목록은 손으로 고친다 — 새 모델이 나오면 여기 한 줄, 목록에 없으면 '직접 입력'으로 쓴다
export const CLAUDE_MODELS: ModelInfo[] = [
  ['claude-fable-5-1', 'Fable 5.1', 'fable'],
  ['claude-opus-5-5', 'Opus 5.5', 'opus'],
  ['claude-sonnet-5-5', 'Sonnet 5.5', 'sonnet'],
  ['claude-haiku-5-5', 'Haiku 5.5', 'haiku']
].map(([id, label, alias]) => ({ id: id!, label, aliases: [alias!], efforts: CLAUDE_EFFORTS }))
export const GEMINI_MODELS: ModelInfo[] = ['auto', 'pro', 'flash', 'flash-lite'].map(id => ({ id, efforts: [] }))

interface CodexModels {
  models: { slug: string; visibility: string; supported_reasoning_levels?: { effort: string }[] }[]
}

export function parseCodexModels(json: string): ModelInfo[] {
  try {
    const j = JSON.parse(json) as CodexModels
    return j.models
      .filter(m => m.visibility === 'list')
      .map(m => ({ id: m.slug, efforts: (m.supported_reasoning_levels ?? []).map(e => e.effort) }))
  } catch {
    return []
  }
}

export async function listModels(cli: AiCli, tools: Tools): Promise<ModelInfo[]> {
  if (cli === 'claude') return CLAUDE_MODELS
  if (cli === 'gemini') return GEMINI_MODELS
  const codex = tools.ai.find(t => t.id === 'codex')
  if (!codex?.path || !codex.version) return []
  return parseCodexModels(await runCapture(codex.path, ['debug', 'models'], 15_000, 'stdout'))
}
