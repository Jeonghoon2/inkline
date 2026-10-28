import type { Hint, HintLevel } from './types.ts'

// 다음 단계 = 받은 힌트 수 (0~6)
export const nextLevel = (hints: Hint[]): HintLevel | null => (hints.length >= 7 ? null : (hints.length as HintLevel))
