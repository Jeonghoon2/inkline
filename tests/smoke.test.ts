import { test } from 'node:test'
import assert from 'node:assert/strict'

test('node:sqlite 를 쓸 수 있다', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(':memory:')
  assert.deepEqual({ ...db.prepare('select 1 as x').get() }, { x: 1 })
})
