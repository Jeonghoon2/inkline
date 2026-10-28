import type { Example, Problem, RunResult } from '../../shared/types.ts'
import { plainText } from '../ai/classify.ts'

// 바깥 글이 래퍼를 닫지 못하게 한다
export function wrap(tag: 'problem' | 'code' | 'run' | 'learner', s: string): string {
  return `<${tag}>\n${s.replace(/<\/(problem|code|run|learner)/gi, '</ $1')}\n</${tag}>`
}

export const problemSummary = (p: Problem): string => `제목: ${p.title.slice(0, 200)}\n${plainText(p.html).slice(0, 3000)}`

export function numberedCode(code: string, max = 6000): string {
  const body = code.slice(0, max).split('\n').map((l, i) => `${i + 1}| ${l}`).join('\n')
  return code.length > max ? `${body}\n…(이하 생략)` : body
}

const STATUS = { pass: '통과', fail: '실패', error: '오류', timeout: '시간 초과' }
const show = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? 'undefined').slice(0, 300)

export function runSummary(r: RunResult | null, examples?: Example[]): string {
  if (!r) return '아직 실행하지 않음'
  if (r.unsupported) return `예제 실행 미지원: ${r.unsupported.slice(0, 300)}`
  if (r.aborted) return '실행을 멈춤'
  if (r.compileError) return `컴파일 오류:\n${r.compileError.slice(0, 600)}`
  if (!r.results.length) return '실행한 예제가 없음'
  const lines = r.results.map((x, i) => `예제 ${i + 1}: ${STATUS[x.status]}`)
  const bad = r.results.findIndex((x) => x.status !== 'pass')
  if (bad >= 0) {
    const x = r.results[bad]
    lines.push(`첫 실패 예제 ${bad + 1} — 기대값 ${show(x.expected)} / 내 값 ${show(x.actual)}`)
    const args = x.custom?.args ?? examples?.[bad]?.args
    if (args) lines.push(`입력: ${show(args)}`)
    if (x.stderr) lines.push(`stderr: ${x.stderr.slice(0, 500)}`)
  }
  return lines.join('\n')
}
