import type { Example, Lang, ProblemDraft, Signature } from '../../shared/types.ts'
import { decodeEntities, parseLiteral } from './literal.ts'
import { leetType } from './types.ts'

export const LEET_QUERY =
  'query q($s: String!) { question(titleSlug: $s) { questionFrontendId title titleSlug difficulty isPaidOnly content topicTags { name } codeSnippets { langSlug code } exampleTestcaseList metaData } }'

export interface LeetQuestion {
  questionFrontendId: string
  title: string
  titleSlug: string
  difficulty: string
  isPaidOnly: boolean
  content: string | null
  topicTags: { name: string }[]
  codeSnippets: { langSlug: string; code: string }[] | null
  exampleTestcaseList: string[]
  metaData: string
}

const LANG_SLUGS: Lang[] = ['python3', 'java', 'javascript', 'cpp']

function parseSignature(metaData: string): Signature | null {
  try {
    const m = JSON.parse(metaData)
    if (m.classname || !m.name || !Array.isArray(m.params) || !m.return) return null
    const sig: Signature = {
      name: m.name,
      params: m.params.map((p: { name: string; type: string }) => ({ name: p.name, type: leetType(p.type) })),
      returns: leetType(m.return.type)
    }
    if (Number.isInteger(m.output?.paramindex)) sig.outParam = m.output.paramindex
    return sig
  } catch {
    return null
  }
}

// 본문의 각 'Output:' 뒤 값 (줄바꿈 · </p> · </pre> 중 가장 앞까지, 태그는 뗀다)
function outputs(html: string): unknown[] {
  return [...html.matchAll(/Output:(?:<\/strong>)?([\s\S]*?)(?:\n|<\/p>|<\/pre>|$)/g)].map(m =>
    parseLiteral(decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim())
  )
}

function parseExamples(q: LeetQuestion, sig: Signature | null): Example[] {
  if (!sig) return []
  const outs = outputs(q.content ?? '')
  if (outs.length < (q.exampleTestcaseList ?? []).length) return []
  const examples: Example[] = []
  for (const [i, tc] of (q.exampleTestcaseList ?? []).entries()) {
    const args = tc.split('\n').map(parseLiteral)
    if (args.length !== sig.params.length) return []
    examples.push({ args, expected: outs[i] })
  }
  return examples
}

export function parseLeetCode(q: LeetQuestion): ProblemDraft | null {
  if (!q.content) return null
  const signature = parseSignature(q.metaData)
  const starter: Partial<Record<Lang, string>> = {}
  for (const s of q.codeSnippets ?? []) if ((LANG_SLUGS as string[]).includes(s.langSlug)) starter[s.langSlug as Lang] = s.code
  return {
    site: 'leetcode',
    siteId: q.titleSlug,
    url: `https://leetcode.com/problems/${q.titleSlug}/`,
    title: `${q.questionFrontendId}. ${q.title}`,
    html: q.content,
    examples: parseExamples(q, signature),
    starter,
    signature,
    siteLevel: q.difficulty,
    siteTags: (q.topicTags ?? []).map(t => t.name)
  }
}
