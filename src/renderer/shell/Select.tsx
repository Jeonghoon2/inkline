import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface Opt<V extends string> { value: V; label: string; disabled?: boolean; hint?: string; aside?: ReactNode } // aside: 오른쪽 끝에 글 대신 그림(예: 테마 색 견본)

// 네이티브 select 대신 — 목록을 앱 디자인으로 그린다. 목록은 fixed 로 띄워 부모의 overflow 에 잘리지 않는다
export function Select<V extends string>({ value, options, onChange, label, variant = 'field', disabled }: {
  value: V; options: Opt<V>[]; onChange: (v: V) => void; label: string; variant?: 'field' | 'chip'; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<CSSProperties>({})
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const cur = options.find(o => o.value === value)

  const place = (): void => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 240 && r.top > below
    setPos({ left: r.left, minWidth: r.width, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }), maxHeight: Math.max(120, (up ? r.top : below) - 16) })
  }
  const show = (): void => {
    if (disabled) return
    place()
    const i = options.findIndex(o => o.value === value)
    setActive(i >= 0 ? i : options.findIndex(o => !o.disabled))
    setOpen(true)
  }
  const close = (focus = true): void => { setOpen(false); if (focus) btn.current?.focus() }
  const pick = (o: Opt<V> | undefined): void => {
    if (!o || o.disabled) return
    close()
    if (o.value !== value) onChange(o.value)
  }
  const step = (d: 1 | -1): void => {
    const n = options.length
    for (let k = 1; k <= n; k++) {
      const i = (active + d * k + n * 2) % n
      if (!options[i].disabled) return setActive(i)
    }
  }

  useLayoutEffect(() => { if (open) list.current?.focus() }, [open])
  useEffect(() => { if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [open, active])
  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent): void => { if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) close(false) }
    const away = (): void => close(false)
    const scroll = (e: Event): void => { if (!list.current?.contains(e.target as Node)) close(false) }
    window.addEventListener('pointerdown', out, true)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', away)
    window.addEventListener('blur', away)
    return () => { window.removeEventListener('pointerdown', out, true); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', away); window.removeEventListener('blur', away) }
  }, [open])

  const onBtnKey = (e: KeyboardEvent): void => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
  }
  const onListKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') close(false)
  }

  return (
    <>
      <button ref={btn} type="button" className={`select ${variant}`} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
        disabled={disabled} onClick={() => (open ? close() : show())} onKeyDown={onBtnKey}>
        <span className="select-v">{cur?.label ?? value}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <ul ref={list} id={id} className="select-list" role="listbox" aria-label={label} tabIndex={-1} style={pos}
          aria-activedescendant={`${id}-${active}`} onKeyDown={onListKey}>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
              className={i === active ? 'on' : undefined} onPointerMove={() => !o.disabled && setActive(i)} onClick={() => pick(o)}>
              {o.value === value && <Check size={14} aria-hidden />}
              <span>{o.label}</span>
              {o.aside ?? (o.hint && <span className="select-hint">{o.hint}</span>)}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
