// 설치된 AI CLI 마다 classify 를 한 번씩 실제로 돌려 본다(npm run ai:smoke).
import { detectTools } from '../src/main/detect.ts'
import { loginPath } from '../src/main/env.ts'
import { ask } from '../src/main/ai/run.ts'
import { classifyPrompt, CLASSIFY_SYSTEM, CLASSIFY_SCHEMA } from '../src/main/ai/classify.ts'

const tools = await detectTools(loginPath())
for (const cli of ['claude', 'gemini', 'codex']) {
  const path = tools.ai.find((t) => t.id === cli)?.path ?? null
  if (!path) { console.log(`${cli} · 설치 안 됨`); continue }
  const t = Date.now()
  const r = await ask({
    task: 'classify', cli, cliPath: path, model: '', effort: '', system: CLASSIFY_SYSTEM,
    prompt: classifyPrompt({ title: '두 수의 합', html: '<p>정수 a, b 를 받아 합을 반환하세요.</p>', siteLevel: 'Lv. 1', siteTags: [] }),
    schema: CLASSIFY_SCHEMA, timeoutMs: 120000
  })
  const sec = ((Date.now() - t) / 1000).toFixed(1)
  console.log(`${cli} · ${sec}s · ${r.ok ? 'ok' : r.error.code} · ${JSON.stringify(r.ok ? r.value : r.error.message)}`)
}
