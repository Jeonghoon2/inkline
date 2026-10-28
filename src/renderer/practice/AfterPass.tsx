import { ArrowLeft } from 'lucide-react'
import type { ChosenApproach, Reflection } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

export const FIELDS: { key: keyof Reflection; label: string; ph: string }[] = [
  { key: 'idea', label: '핵심 아이디어', ph: '이미 본 값을 해시에 저장해 짝을 바로 찾는다' }, // i18n-ok
  { key: 'complexity', label: '복잡도', ph: '시간 O(n), 공간 O(n)' }, // i18n-ok
  { key: 'mistake', label: '실수한 지점', ph: '같은 원소를 두 번 쓰는 경우를 놓쳤다' }, // i18n-ok
]

export const emptyReflection = (): Reflection => ({ idea: '', complexity: '', mistake: '' })

// 적는 글은 부모가 들고 있다 — '← 코드로'로 다녀와도 남게
export function AfterPass({ approach, busy, v, setV, onBack, onSkip, onSave }: { approach?: ChosenApproach | null; busy: boolean; v: Reflection; setV: (r: Reflection) => void; onBack?: () => void; onSkip: () => void; onSave: (r: Reflection | null) => void }) {
  return (
    <div className="after">
      <section className="after-card" aria-label={t('회고')}>
        {onBack && <div><button type="button" className="btn" disabled={busy} onClick={onBack}><ArrowLeft size={14} aria-hidden /> {t('코드로')}</button></div>}
        <h2>{t('회고 — 세 줄로 정리해 보세요')}</h2>
        {approach && <p className="muted">{t('이론에서 고른 접근: {name}', { name: approach.name + (approach.complexity ? ` (${approach.complexity})` : '') })}</p>}
        {FIELDS.map((f, i) => (
          <label key={f.key} className="after-field">
            <span>{t(f.label)}</span>
            <textarea className="field" autoFocus={i === 0} rows={2} maxLength={300} placeholder={t(f.ph)} value={v[f.key]} onChange={e => setV({ ...v, [f.key]: e.target.value })} />
          </label>
        ))}
        <div className="after-actions">
          <button type="button" className="btn" disabled={busy} onClick={onSkip}>{t('건너뛰기')}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onSave(Object.values(v).every(x => !x.trim()) ? null : v)}>{t('저장')}</button>
        </div>
      </section>
    </div>
  )
}
