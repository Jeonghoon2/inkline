import { useEffect, useState, type ReactNode } from 'react'

/** 두 단계 단추 — 한 번 누르면 `confirm` 문구로 바뀌고, 3초 안에 다시 눌러야 실행한다. ask=false 면 한 번에 실행 */
export function ConfirmButton({ children, confirm, onConfirm, ask = true, className = 'btn', disabled }: {
  children: ReactNode; confirm: string; onConfirm: () => void; ask?: boolean; className?: string; disabled?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t) }, [armed])
  return (
    <>
      <button type="button" className={armed ? `${className} danger` : className} disabled={disabled}
        onClick={() => { if (armed || !ask) { setArmed(false); onConfirm() } else setArmed(true) }}>
        {armed ? confirm : children}
      </button>
      <span className="sr" role="status">{armed ? confirm : ''}</span>
    </>
  )
}
