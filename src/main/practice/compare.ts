const key = (v: unknown) => JSON.stringify(v)
const byKey = (a: unknown, b: unknown) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/** 바깥 한 겹 정렬, 항목이 배열이면 안쪽을 먼저 정렬한 복사본으로 */
function sortOuter(v: unknown): unknown {
  if (!Array.isArray(v)) return v
  return v.map((x) => (Array.isArray(x) ? [...x].sort(byKey) : x)).sort(byKey)
}

function deep(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isInteger(a) && Number.isInteger(b)) return a === b
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deep(x, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => k in b && deep((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return a === b
}

export function sameResult(actual: unknown, expected: unknown, o: { anyOrder: boolean }): boolean {
  return o.anyOrder ? deep(sortOuter(actual), sortOuter(expected)) : deep(actual, expected)
}

export const anyOrderHint = (html: string): boolean =>
  /any order|순서는 상관|순서와 상관없이|순서에 상관없이/i.test(html)
