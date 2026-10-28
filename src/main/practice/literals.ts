import type { TypeSpec } from '../../shared/types.ts'

export function hasUnknown(t: TypeSpec): boolean {
  return t === 'unknown' || (typeof t === 'object' && hasUnknown(t.array))
}

const JAVA_BOX: Record<string, string> = { int: 'Integer', long: 'Long', double: 'Double', bool: 'Boolean', string: 'String', char: 'Character' }
const JAVA_NAME: Record<string, string> = { int: 'int', long: 'long', double: 'double', bool: 'boolean', string: 'String', char: 'char', ListNode: 'ListNode', TreeNode: 'TreeNode', unknown: 'Object' }
const CPP_NAME: Record<string, string> = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'string', char: 'char', ListNode: 'ListNode*', TreeNode: 'TreeNode*', unknown: 'auto' }

export function javaType(t: TypeSpec, boxed = false): string {
  if (typeof t === 'object') return t.list ? `List<${javaType(t.array, true)}>` : `${javaType(t.array)}[]`
  return boxed ? JAVA_BOX[t] ?? JAVA_NAME[t] : JAVA_NAME[t]
}

export function cppType(t: TypeSpec): string {
  return typeof t === 'object' ? `vector<${cppType(t.array)}>` : CPP_NAME[t]
}

const bad = (v: unknown, t: TypeSpec): never => {
  throw new Error(`예제 값이 타입과 맞지 않습니다: ${JSON.stringify(v)} (${JSON.stringify(t)})`)
}

const ESC: Record<string, string> = { '\\': '\\\\', '"': '\\"', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t' }
const esc = (s: string, java: boolean, quote: string) =>
  s.replace(/[\\"'\n\r\t\x00-\x1f\x7f]/g, (c) => {
    if ((c === '"' || c === "'") && c !== quote) return c
    if (ESC[c]) return ESC[c]
    const n = c.charCodeAt(0)
    return java ? `\\u${n.toString(16).padStart(4, '0')}` : `\\${n.toString(8).padStart(3, '0')}`
  })

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const num = (v: unknown, t: TypeSpec): number => (typeof v === 'number' && Number.isFinite(v) ? v : bad(v, t))
// 1e21 처럼 지수 표기면 그대로 실수 리터럴이다
const dbl = (n: number) => (/[.eE]/.test(String(n)) ? String(n) : `${n}.0`)
const intStr = (v: unknown, t: TypeSpec) => (isInt(v) ? BigInt(v).toString() : bad(v, t))
const int32 = (v: unknown, t: TypeSpec) => (isInt(v) && v >= -(2 ** 31) && v < 2 ** 31 ? String(v) : bad(v, t))
const PRIM = new Set<TypeSpec>(['int', 'long', 'double', 'bool', 'char'])
const charOf = (v: unknown, t: TypeSpec) => (typeof v === 'string' && [...v].length === 1 ? v : bad(v, t))
const arr = (v: unknown, t: TypeSpec): unknown[] => (Array.isArray(v) ? v : bad(v, t))
// ListNode: int 배열, TreeNode: int · null 배열 (노드 val 은 int)
const nodeItems = (v: unknown, t: TypeSpec, nullable: boolean) =>
  arr(v, t).map((x) => (x === null && nullable ? null : int32(x, t)))

export function javaExpr(v: unknown, t: TypeSpec): string {
  if (typeof t === 'object') {
    const a = arr(v, t)
    const items = a.map((x) => (x !== null ? javaExpr(x, t.array) : PRIM.has(t.array) ? bad(v, t) : 'null'))
    if (!t.list) return `new ${javaType(t)}{${items.join(', ')}}`
    if (!items.length) return 'new ArrayList<>()'
    return `new ArrayList<>(${a.includes(null) ? 'Arrays.asList' : 'List.of'}(${items.join(', ')}))`
  }
  switch (t) {
    case 'int': return int32(v, t)
    case 'long': return `${intStr(v, t)}L`
    case 'double': return dbl(num(v, t))
    case 'bool': return typeof v === 'boolean' ? String(v) : bad(v, t)
    case 'string': return typeof v === 'string' ? `"${esc(v, true, '"')}"` : bad(v, t)
    case 'char': return `'${esc(charOf(v, t), true, "'")}'`
    case 'ListNode': return `ListNode.of(new int[]{${nodeItems(v, t, false).join(', ')}})`
    case 'TreeNode': return `TreeNode.of(new Integer[]{${nodeItems(v, t, true).map((x) => x ?? 'null').join(', ')}})`
    default: return bad(v, t)
  }
}

export function cppExpr(v: unknown, t: TypeSpec): string {
  if (typeof t === 'object') return `${cppType(t)}{${arr(v, t).map((x) => cppExpr(x, t.array)).join(', ')}}`
  switch (t) {
    case 'int': return int32(v, t)
    case 'long': return `${intStr(v, t)}LL`
    case 'double': return dbl(num(v, t))
    case 'bool': return typeof v === 'boolean' ? String(v) : bad(v, t)
    case 'string': return typeof v === 'string' ? `string("${esc(v, false, '"')}")` : bad(v, t)
    case 'char': return `'${esc(charOf(v, t), false, "'")}'`
    case 'ListNode': return `mk_list({${nodeItems(v, t, false).join(', ')}})`
    case 'TreeNode': return `mk_tree({${nodeItems(v, t, true).map((x) => `"${x ?? 'null'}"`).join(', ')}})`
    default: return bad(v, t)
  }
}
