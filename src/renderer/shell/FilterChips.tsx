import { X } from 'lucide-react'
import { t } from '../../shared/i18n.ts'

/** '거르는 중' 줄 — 켜진 거르기마다 `이름 ×` 칩, 둘 이상이면 '모두 풀기'. 꺼져 있으면 그리지 않는다 */
export function FilterChips({ chips, onClearAll }: { chips: { label: string; clear: () => void }[]; onClearAll: () => void }) {
  if (!chips.length) return null
  return (
    <div className="fchips" role="group" aria-label={t('거르는 중')}>
      <span className="muted">{t('거르는 중')}</span>
      {chips.map(c => (
        <button key={c.label} type="button" className="fchip" aria-label={t('{label} 거르기 풀기', { label: c.label })} onClick={c.clear}>{c.label} <X size={12} aria-hidden /></button>
      ))}
      {chips.length > 1 && <button type="button" className="btn btn-sm" onClick={onClearAll}>{t('모두 풀기')}</button>}
    </div>
  )
}
