// ① 제약 읽기 — 문제 HTML 의 '제한사항' · 'Constraints' 구역에서 입력 크기를 읽어 허용 시간 복잡도를 어림한다(AI 없이)
// 표: Laaksonen, Competitive Programmer's Handbook 2장(시간 제한 1초). (지식사전: 프로그래밍 교육/competitive-programmers-handbook)
import { plainText } from '../ai/classify.ts'
import type { Rank } from '../../shared/approach.ts'
import type { Limits } from '../../shared/types.ts'

const HEAD = /^(제한\s*사항|constraints:?)$/i
const NEXT = /^(입출력\s*예|테스트\s*케이스|example|follow-?up|note|참고|입력\s*형식|출력\s*형식)/i

export function constraintLines(html: string): string[] {
  const text = plainText(html.replace(/<(li|br|p|h\d|div|tr|pre)\b/gi, '\n$&'))
  const rows = text.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const at = rows.findIndex(r => HEAD.test(r))
  if (at < 0) return []
  const out: string[] = []
  for (const r of rows.slice(at + 1)) {
    if (NEXT.test(r)) break
    out.push(r.slice(0, 160))
    if (out.length >= 12) break
  }
  return out
}

// 10^k 를 먼저 — 앞 갈래가 '10' 만 먹고 '^4' 를 남기지 않게
const NUM = String.raw`10\s*\^\s*(\d+)|(\d[\d,]*(?:\.\d+)?)\s*(?:[×x*]\s*10\s*\^\s*(\d+))?`
const toNum = (m: RegExpExecArray, i: number): number => {
  const [pow, base, exp] = [m[i], m[i + 1], m[i + 2]]
  if (pow) return 10 ** Number(pow)
  const v = Number(base.replace(/,/g, ''))
  return exp ? v * 10 ** Number(exp) : v
}
export function parseBound(line: string): number | null {
  const s = line.replace(/(\d+)\s*만/g, (_, d) => String(Number(d) * 10000)).replace(/(\d+)\s*억/g, (_, d) => String(Number(d) * 1e8))
  let best: number | null = null
  const keep = (v: number): void => { if (Number.isFinite(v) && (best === null || v > best)) best = v }
  for (const m of s.matchAll(new RegExp(String.raw`(?:≤|<=|<|≦)\s*-?\s*(?:${NUM})`, 'g'))) keep(toNum(m as RegExpExecArray, 1))
  for (const m of s.matchAll(new RegExp(String.raw`(?:${NUM})\s*(?:개|자|글자|명|줄)?\s*이하`, 'g'))) keep(toNum(m as RegExpExecArray, 1))
  return best
}

export function allowedFor(n: number): Rank {
  if (n <= 10) return 'O(N!)'
  if (n <= 20) return 'O(2^N)'
  if (n <= 500) return 'O(N^3)'
  if (n <= 5000) return 'O(N^2)'
  if (n <= 1_000_000) return 'O(N log N)'
  return 'O(N)'
}

// 크기 줄: 길이 · 개수 · 크기 · length · size · 한 글자 변수(n, m, k) — 값 줄(원소 · 값 · nums[i] · val)은 뺀다
// ponytail: 낱말 어림이다. 'n × m ≤ 20' 같은 곱 줄이 있으면 그 수가 가장 커서 잡히지만, 곱 줄 없이 두 변이 따로 있으면 한 변으로 본다
const SIZE = /(길이|개수|크기|수는|개\s*이하|length|size|\bn\b|\bm\b|\bk\b|\bq\b)/i
const VALUE = /(원소|값|\[\s*i\s*\]|\bval\b|value|target|가중치|weight)/i
export function limitsOf(html: string, complexityNote = ''): Limits {
  const lines = constraintLines(html)
  // 한 글자 변수만 크기 표지이고 상한이 100만 넘으면 값 줄(1 ≤ n ≤ 10^9)로 보고 N 에서 뺀다
  const isSize = (l: string): boolean => {
    if (!SIZE.test(l) || VALUE.test(l)) return false
    return !(!/(길이|개수|크기|수는|개\s*이하|length|size)/i.test(l) && (parseBound(l) ?? 0) > 1_000_000)
  }
  const sizes = lines.filter(isSize).map(parseBound).filter((v): v is number => v !== null)
  if (sizes.length) { const n = Math.max(...sizes); return { lines, n, allowed: allowedFor(n), source: 'text', note: '' } }
  return { lines, n: null, allowed: null, source: complexityNote ? 'ai' : 'none', note: complexityNote }
}
