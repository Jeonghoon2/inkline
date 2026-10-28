import type { HintLevel } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

export function checkSelfExplain(level: HintLevel, text: string | null): string | null {
  if (level < 3) return null
  const n = text?.trim().length ?? 0
  if (n < 5) return t('직전 힌트가 왜 필요했는지 한 줄(5자 이상)을 적어 주세요')
  if (n > 500) return t('500자 이하로 적어 주세요')
  return null
}
