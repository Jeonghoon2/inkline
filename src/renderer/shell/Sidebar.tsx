import type { ReactNode } from 'react'

export function Sidebar({
  title,
  actions,
  bodyRef,
  children
}: {
  title: string
  actions?: ReactNode
  bodyRef?: (el: HTMLDivElement | null) => void
  children?: ReactNode
}) {
  return (
    <>
      <div className="side-head drag">
        <h1>{title}</h1>
        {actions}
      </div>
      <div className="side-body" ref={bodyRef}>
        {children}
      </div>
    </>
  )
}
