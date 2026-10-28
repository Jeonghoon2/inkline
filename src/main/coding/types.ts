import type { TypeSpec } from '../../shared/types.ts'

const JAVA = new Map<string, TypeSpec>([
  ['int', 'int'],
  ['long', 'long'],
  ['double', 'double'],
  ['boolean', 'bool'],
  ['String', 'string'],
  ['char', 'char']
])

const LEET = new Map<string, TypeSpec>([
  ['integer', 'int'],
  ['long', 'long'],
  ['double', 'double'],
  ['boolean', 'bool'],
  ['string', 'string'],
  ['character', 'char'],
  ['ListNode', 'ListNode'],
  ['TreeNode', 'TreeNode']
])

function wrap(base: TypeSpec, depth: number): TypeSpec {
  let t = base
  for (let i = 0; i < depth; i++) t = { array: t }
  return t
}

// 기본형은 모르면 'unknown'. 배열이 하나라도 섞인 모르는 타입도 'unknown'
export function javaType(t: string): TypeSpec {
  let s = t.trim()
  let depth = 0
  while (s.endsWith('[]')) {
    s = s.slice(0, -2).trim()
    depth++
  }
  const base = JAVA.get(s)
  return base === undefined ? 'unknown' : wrap(base, depth)
}

export function leetType(t: string): TypeSpec {
  const s = t.trim()
  const list = s.match(/^list<(.*)>$/)
  const inner = list ? list[1] : s.endsWith('[]') ? s.slice(0, -2) : null
  if (inner !== null) {
    const el = leetType(inner)
    return el === 'unknown' ? 'unknown' : list ? { array: el, list: true } : { array: el }
  }
  return LEET.get(s) ?? 'unknown'
}
