import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon size={56} strokeWidth={1.2} aria-hidden />
      <h2>{title}</h2>
      {children}
    </div>
  )
}
