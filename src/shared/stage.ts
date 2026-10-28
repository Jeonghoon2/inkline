import type { Stage } from './types.ts'

const COMMENT = /^(#|\/\/|\/\*|\*)/
const squash = (s: string): string => s.replace(/\s+/g, '')

export function guessStage(o: { code: string; starter: string; runs: { passed: boolean }[]; current: Stage; manual: boolean }): Stage {
  if (o.manual) return o.current
  const last = o.runs[o.runs.length - 1]
  if (last) return last.passed ? 'reflect' : 'debug'
  if (o.code.trim() === '' || squash(o.code) === squash(o.starter)) return 'understand'
  const had = new Set(o.starter.split('\n').map((l) => l.trim()))
  const added = o.code.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !had.has(l))
  return added.every((l) => COMMENT.test(l)) ? 'plan' : 'implement'
}
