import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validate, type JsonSchema } from '../src/main/ai/schema.ts'

const S: JsonSchema = {
  type: 'object',
  properties: {
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    tags: { type: 'array', items: { type: 'string', enum: ['큐', 'DP'] }, minItems: 1, maxItems: 3 },
    note: { type: 'string', maxLength: 5 },
    ok: { type: 'boolean' }
  },
  required: ['difficulty', 'tags', 'note', 'ok'],
  additionalProperties: false
}

test('맞는 값', () => assert.equal(validate({ difficulty: 2, tags: ['큐'], note: 'abc', ok: true }, S), null))
test('틀린 값마다 경로가 있는 오류', () => {
  assert.match(validate({ difficulty: 2.5, tags: ['큐'], note: '', ok: true }, S)!, /\$\.difficulty/)
  assert.match(validate({ difficulty: 9, tags: ['큐'], note: '', ok: true }, S)!, /\$\.difficulty/)
  assert.match(validate({ difficulty: 2, tags: ['그래프'], note: '', ok: true }, S)!, /\$\.tags\[0\]/)
  assert.match(validate({ difficulty: 2, tags: [], note: '', ok: true }, S)!, /\$\.tags/)
  assert.match(validate({ difficulty: 2, tags: ['큐'], note: '123456', ok: true }, S)!, /\$\.note/)
  assert.match(validate({ difficulty: 2, tags: ['큐'], note: '', ok: true, extra: 1 }, S)!, /extra/)
  assert.match(validate({ difficulty: 2, tags: ['큐'], note: '' }, S)!, /ok/)
  assert.match(validate(null, S)!, /\$/)
})
