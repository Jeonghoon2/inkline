import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relatedProblems } from '../src/shared/related.ts'
import type { ProblemSummary } from '../src/shared/types.ts'

const p = (id: number, tags: string[] | null): ProblemSummary => ({ id, site: 'programmers', title: `p${id}`, url: '', siteLevel: '', classification: tags && ({ difficulty: 1, tags } as ProblemSummary['classification']), createdAt: '' })

test('태그가 겹치는 다른 문제만, 통과 안 한 것 먼저, 최대 3개', () => {
  const rows = [p(1, ['dp']), p(2, ['dp']), p(3, ['dp', 'x']), p(4, ['graph']), p(5, null), p(6, ['dp']), p(7, ['x']), p(8, ['dp'])]
  const r = relatedProblems([1], rows, new Set([2, 3]))
  assert.deepEqual(r.map(x => x.id), [6, 8, 2])
  assert.equal(relatedProblems([1], rows, new Set(), 10).some(x => x.id === 1 || x.id === 4 || x.id === 5), false)
  assert.equal(relatedProblems([1], rows, new Set(), 10).length, 4)
})
