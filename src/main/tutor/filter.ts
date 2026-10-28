import { TAGS } from '../ai/classify.ts'
import type { HintBody, Lang, Signature } from '../../shared/types.ts'

const KW = 'def|class|return|for|while|if|elif|else|import|from|public|private|static|int|long|var|let|const|function|#include|using'
const KW_START = new RegExp(`^\\s*(${KW})\\b`)
const KW_CODEISH = new RegExp(`^\\s*(${KW})\\b(\\s*[({;]|\\s+[\\d"'[\\-]|.*:\\s*$)`) // 한글 줄에서는 코드 꼴 이어짐이 있어야 한다
const ANY_LINE = [/;\s*$/, /[{}]\s*$/, /\w+\(.*\)\s*[:{]?\s*$/, /\+\+|--/, /[-+*/%]=/, /\]\s*=/, /\w\)\[/,
  /^\s*[A-Za-z_]\w*(\[[^\]]*\])*\s*=(?!=)\s*[\w[(\-"']/] // 대입: 뒤에 한글이 와도 코드
const NO_HANGUL_LINE = [KW_START, /=>/, /==/, /!=/, /\w+\s*=\s*[^=]/]

export function looksLikeCode(s: string): boolean {
  if (s.includes('```')) return true
  return s.split('\n').some((l) => {
    if (ANY_LINE.some((re) => re.test(l))) return true
    return /[가-힣]/.test(l) ? KW_CODEISH.test(l) : NO_HANGUL_LINE.some((re) => re.test(l))
  })
}

const ALIASES = ['two pointer', 'sliding window', 'binary search', 'dp', 'dynamic programming', 'greedy', 'dfs', 'bfs', 'backtracking', 'union find', 'dijkstra', 'heap', 'stack', 'queue', 'deque', 'hash', 'prefix sum', 'bitmask', 'topological', 'memoization', '재귀', '해시맵', '해시', '딕셔너리', 'hashmap', 'dict', '집합', 'set', '정렬', '메모이제이션', '두 포인터', '투 포인터', '다익스트라', '이진 탐색', '이분 탐색', '깊이 우선', '너비 우선', '동적 계획법', '그리디', '탐욕']
const TERMS = [...TAGS.filter((t) => !['구현', '수학', '문자열'].includes(t)), ...ALIASES].map((t) => t.toLowerCase())
const PARTICLE = '[을를이가은는에의로으와과도만하해한할적된]'

// 영문: 앞뒤 영문 금지(복수형 · ing 허용), 하이픈 · 띄어쓰기 변형 허용.
// 한글: 앞 한글 금지, 2자 이하 낱말은 뒤 한글도 금지(조사만 허용) — 큐브 · 트리거 는 통과, 큐를 · 트리에서 는 걸린다
function has(text: string, term: string): boolean {
  const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (/[a-z]/.test(term)) return new RegExp(`(?<![a-z])${term.split(' ').map(esc).join('[\\s-]*')}(?:s|es|ing)?(?![a-z])`).test(text)
  const chars = [...term.replace(/\s/g, '')]
  const body = chars.map(esc).join('\\s*')
  return new RegExp(`(?<![가-힣])${body}${chars.length <= 2 ? `(?:(?![가-힣])|(?=${PARTICLE}))` : ''}`).test(text)
}

export function mentionsAlgorithm(s: string, problemText = ''): boolean {
  const t = s.toLowerCase()
  const p = problemText.toLowerCase()
  return TERMS.some((term) => has(t, term) && !has(p, term))
}

export function cleanNudge(v: { text: string }, problemText = ''): string | null {
  const t = v.text.replace(/\s+/g, ' ').trim()
  return !t || t.length > 60 || looksLikeCode(t) || mentionsAlgorithm(t, problemText) ? null : t
}

type Raw = Record<string, unknown>
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

// L6 은 핵심 부분만 — 진입 함수를 선언하고 return 까지 있으면 전체 정답이다
// 시그니처가 없을 때의 느슨한 선언 꼴: 키워드로 시작하거나 `{` 로 끝나는 함수 머리
const GENERIC_DECL = /^\s*(def|function|class|public|private|static|func|fn)\b|^\s*(?!(?:if|for|while|switch|else|catch|do|try)\b)[\w<>[\],*&:\s]*\w\s*\([^;]*\)[^;=]*\{\s*$/m

function declRe(sig: Signature | null, lang: Lang): RegExp {
  const n = sig?.name.replace(/[^\w$]/g, '')
  if (!n) return GENERIC_DECL
  return lang === 'python3' ? new RegExp(`\\bdef\\s+${n}\\s*\\(`)
    : lang === 'javascript' ? new RegExp(`\\bfunction\\s+${n}\\s*\\(|\\b${n}\\s*=\\s*(function\\b|\\(|async\\b)`)
    : new RegExp(`\\w[\\w<>\\[\\],*&:\\s]*[\\s*&]${n}\\s*\\([^;]*\\)[^;=]*\\{`)
}

export function isWholeSolution(snippet: string, sig: Signature | null, lang: Lang): boolean {
  return /\breturn\b/.test(snippet) && declRe(sig, lang).test(snippet)
}

export function cleanHint(level: 1 | 2 | 3 | 4 | 5 | 6, v: Raw, ctx?: { sig: Signature | null; lang: Lang }): HintBody | null {
  const text = str(v.text)
  if (level <= 4 && (!text || (level <= 3 && looksLikeCode(text)))) return null
  switch (level) {
    case 1: case 2: return { kind: 'text', text: text! }
    case 3: {
      const sk = v.skeleton
      const concept = str(v.concept)
      // concept 는 칩에 들어가는 이름 — 문장이 오면(끝이 '다/요' · 마침표, 24자 넘음) 다시 묻는다
      if (!concept || looksLikeCode(concept) || concept.length > 24 || /[.!?]|[다요]$/.test(concept.trim()) || !Array.isArray(sk) || sk.length < 2) return null
      if (sk.some((x) => !x || typeof x.desc !== 'string' || looksLikeCode(x.desc))) return null
      return { kind: 'concept', text: text!, concept, skeleton: sk }
    }
    case 4: {
      const pseudo = str(v.pseudo)?.trim()
      if (!pseudo || pseudo.includes('```')) return null
      const ls = pseudo.split('\n').filter((l) => l.trim())
      if (ls.length > 15 || ls.some((l) => /[;{]\s*$/.test(l) || /^\s*(def|function|public|class|#include|import)\b/.test(l))) return null
      return { kind: 'pseudo', text: text!, pseudo }
    }
    case 5: {
      if (!Array.isArray(v.blocks) || v.blocks.some((x) => typeof x !== 'string')) return null
      const re = declRe(ctx?.sig ?? null, ctx?.lang ?? 'python3')
      const b = (v.blocks as string[]).filter((x) => !re.test(x))
      if (b.length < 3) return null
      const d = Array.isArray(v.distractors) ? v.distractors.filter((x): x is string => typeof x === 'string' && !b.some((y) => y.trim() === x.trim())) : []
      return { kind: 'parsons', blocks: b, distractors: d }
    }
    case 6: {
      const snippet = str(v.snippet)
      if (snippet && ctx && isWholeSolution(snippet, ctx.sig, ctx.lang)) return null
      return snippet ? { kind: 'snippet', snippet, note: typeof v.note === 'string' ? v.note : '' } : null
    }
  }
}
