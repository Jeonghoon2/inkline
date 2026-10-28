import { STAGES, STAGE_LABEL, type Stage } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

export function StageBar({ stage, onPick }: { stage: Stage; onPick: (s: Stage) => void }) {
  return (
    <ol className="stagebar" aria-label={t('풀이 단계')}>
      {STAGES.map(s => (
        <li key={s}>
          <button type="button" className="stage" aria-current={s === stage ? 'step' : undefined} onClick={() => onPick(s)}>
            {s === stage && <span aria-hidden>● </span>}{t(STAGE_LABEL[s])}
          </button>
        </li>
      ))}
    </ol>
  )
}
