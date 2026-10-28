import type { CSSProperties } from 'react'
import { t } from '../../shared/i18n.ts'
import { TYPE_COLOR } from './render.ts'

export const typeColor = (ty: string): string => (Object.hasOwn(TYPE_COLOR, ty) ? TYPE_COLOR[ty]! : 'var(--t-etc)')

export function Badge({ type, count }: { type: string; count?: number }) {
  if (!type) return null
  return (
    <span className="b" style={{ '--t': typeColor(type) } as CSSProperties}>
      {t(type)}
      {count !== undefined && ` ${count}`}
    </span>
  )
}
