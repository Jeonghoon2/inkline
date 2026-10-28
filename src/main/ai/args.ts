import type { AiCli } from '../../shared/types.ts'
import type { JsonSchema } from './schema.ts'

interface ArgOpts { model: string; effort: string; schema: JsonSchema; system: string; schemaFile: string; outFile: string; cwd: string; web?: boolean } // web: 웹 검색 허용(직무 자료 수집)

export function cliArgs(cli: AiCli, o: ArgOpts): string[] {
  const model = o.model ? (cli === 'codex' ? ['-m', o.model] : ['--model', o.model]) : []
  if (cli === 'claude') {
    return ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(o.schema), '--system-prompt', o.system,
      '--tools', o.web ? 'WebSearch,WebFetch' : '', ...(o.web ? ['--allowedTools', 'WebSearch,WebFetch'] : []), '--disable-slash-commands', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--exclude-dynamic-system-prompt-sections', '--no-session-persistence',
      ...model, ...(o.effort ? ['--effort', o.effort] : [])]
  }
  if (cli === 'codex') {
    return [...(o.web ? ['--search'] : []), 'exec', ...model, // --search 는 exec 앞(최상위 옵션)
      ...(o.effort ? ['-c', `model_reasoning_effort=${o.effort}`] : []),
      '--output-schema', o.schemaFile, '-s', 'read-only', '--ephemeral', '--skip-git-repo-check', '-C', o.cwd, '-o', o.outFile, '-']
  }
  return ['-p', '', '-o', 'json', '--approval-mode', 'plan', '--skip-trust', ...(o.model ? ['-m', o.model] : [])]
}

export function stdinFor(cli: AiCli, system: string, prompt: string, schema: JsonSchema): string {
  if (cli === 'claude') return prompt
  const base = `${system}\n\n${prompt}`
  return cli === 'gemini' ? `${base}\n\nJSON 하나만 답한다. 형식(JSON Schema): ${JSON.stringify(schema)}` : base
}
