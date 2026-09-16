import assert from 'node:assert/strict'
import test from 'node:test'

import { LOCAL_DEMO_USER, assertLocalDemoDatabase } from './local-city-demo.mjs'

test('accepts only the local autiva_obs fixture database', () => {
  assert.equal(
    assertLocalDemoDatabase('postgresql://postgres:postgres@127.0.0.1:54322/autiva_obs?schema=public').database,
    'autiva_obs',
  )
})

test('rejects a non-local host or a non-demo database', () => {
  assert.throws(() => assertLocalDemoDatabase('postgresql://user:pass@db.example.com/autiva_obs'))
  assert.throws(() => assertLocalDemoDatabase('postgresql://user:pass@127.0.0.1:54322/postgres'))
})

test('uses a visibly fake and stable demo identity', () => {
  assert.deepEqual(LOCAL_DEMO_USER, {
    id: 'local_aditya',
    githubId: 'local-dev-aditya',
    handle: 'aditya',
    email: 'aditya@local.demo',
    name: 'Aditya (local demo)',
  })
})
