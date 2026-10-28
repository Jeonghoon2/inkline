import { t } from '../../shared/i18n.ts'

export function LoadFail({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="muted ppanel-empty" role="alert">{t('오답 노트를 불러오지 못했습니다')} <button type="button" className="btn" onClick={onRetry}>{t('다시 불러오기')}</button></p>
  )
}
