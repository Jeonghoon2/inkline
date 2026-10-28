export type JsonSchema =
  | { type: 'object'; properties: Record<string, JsonSchema>; required: string[]; additionalProperties: false }
  | { type: 'array'; items: JsonSchema; minItems?: number; maxItems?: number }
  | { type: 'string'; enum?: string[]; maxLength?: number }
  | { type: 'integer'; minimum?: number; maximum?: number }
  | { type: 'number' }
  | { type: 'boolean' }

// 처음 만난 문제를 돌려주고, 없으면 null
export function validate(value: unknown, s: JsonSchema, path = '$'): string | null {
  switch (s.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${path}: 객체가 아님`
      const v = value as Record<string, unknown>
      for (const k of s.required) if (!Object.hasOwn(v, k)) return `${path}.${k}: 빠져 있음`
      for (const k of Object.keys(v)) if (!Object.hasOwn(s.properties, k)) return `${path}.${k}: 모르는 키`
      for (const [k, sub] of Object.entries(s.properties)) {
        if (Object.hasOwn(v, k)) { const e = validate(v[k], sub, `${path}.${k}`); if (e) return e }
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(value)) return `${path}: 배열이 아님`
      if (s.minItems !== undefined && value.length < s.minItems) return `${path}: ${s.minItems}개 이상이어야 함`
      if (s.maxItems !== undefined && value.length > s.maxItems) return `${path}: ${s.maxItems}개 이하여야 함`
      for (let i = 0; i < value.length; i++) { const e = validate(value[i], s.items, `${path}[${i}]`); if (e) return e }
      return null
    }
    case 'string':
      if (typeof value !== 'string') return `${path}: 문자열이 아님`
      if (s.enum && !s.enum.includes(value)) return `${path}: 허용된 값이 아님`
      if (s.maxLength !== undefined && value.length > s.maxLength) return `${path}: ${s.maxLength}자를 넘음`
      return null
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return `${path}: 정수가 아님`
      if (s.minimum !== undefined && value < s.minimum) return `${path}: ${s.minimum} 이상이어야 함`
      if (s.maximum !== undefined && value > s.maximum) return `${path}: ${s.maximum} 이하여야 함`
      return null
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${path}: 숫자가 아님`
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path}: 참/거짓이 아님`
  }
}

// 스키마 조각 — 모듈마다 같은 줄을 따로 두지 않는다. arr(items, max) 는 최소 0개, arr(items, min, max) 는 둘 다 정한다
export const str = (maxLength: number): JsonSchema => ({ type: 'string', maxLength })
export const int = (minimum: number, maximum: number): JsonSchema => ({ type: 'integer', minimum, maximum })
export const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
export const arr = (items: JsonSchema, minOrMax: number, maxItems?: number): JsonSchema =>
  maxItems === undefined ? { type: 'array', items, minItems: 0, maxItems: minOrMax } : { type: 'array', items, minItems: minOrMax, maxItems }
