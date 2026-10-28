import { obj, str, type JsonSchema } from '../ai/schema.ts'
import { MISTAKE_LABEL } from '../../shared/types.ts'


export const NUDGE_SCHEMA = obj({ text: str(60) })

const textOnly = obj({ text: str(300) })

export const HINT_SCHEMAS: Record<1 | 2 | 3 | 4 | 5 | 6, JsonSchema> = {
  1: textOnly,
  2: textOnly,
  3: obj({
    text: str(300),
    concept: str(40),
    skeleton: { type: 'array', minItems: 2, maxItems: 4, items: obj({ label: { type: 'string', enum: ['초기화', '탐색 조건', '상태 갱신', '종료 · 반환'] }, desc: str(80) }) }
  }),
  4: obj({ text: str(300), pseudo: str(1200) }),
  5: obj({ blocks: { type: 'array', minItems: 3, maxItems: 14, items: str(160) }, distractors: { type: 'array', minItems: 0, maxItems: 1, items: str(160) } }),
  6: obj({ snippet: str(2000), note: str(200) })
}

export const MISTAKE_SCHEMA = obj({
  type: { type: 'string', enum: Object.keys(MISTAKE_LABEL) },
  line: { type: 'integer', minimum: 0, maximum: 10000 },
  note: str(80)
})
