import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { assertLocalDemoDatabase } from './local-city-demo.mjs'

assertLocalDemoDatabase(process.env.DATABASE_URL)
const db = new PrismaClient()
try {
  const before = await db.run.findMany({ orderBy: { id: 'asc' } })
  assert.ok(before.some(r => r.project === 'JARVIS'), 'existing JARVIS proof required')
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/local-city-demo.mjs'], { encoding: 'utf8' })
    assert.equal(result.status, 0, 'setup must succeed (output withheld because it contains token)')
    assert.deepEqual(await db.run.findMany({ orderBy: { id: 'asc' } }), before, 'every existing run must survive unchanged')
    assert.equal(await db.user.count({ where: { githubId: 'local-dev-aditya' } }), 1)
  }
  console.log('PASS: two setup runs preserve every run and one demo identity')
  const base = 'http://127.0.0.1:3111'
  const cookies = new Map()
  async function request(path, options = {}) {
    const res = await fetch(base + path, { ...options, redirect: 'manual', headers: { ...options.headers, Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } })
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], at = pair.indexOf('=')
      cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
    return res
  }
  const csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/e2e-test-login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, githubId: 'local-dev-aditya', callbackUrl: base + '/city' }),
  })
  const res = await request('/api/city')
  assert.equal(res.status, 200, 'authenticated City must load')
  const city = await res.json()
  const building = city.districts.find(d => d.key === 'intelligence.market_trends')
  assert.ok(building?.runs.some(r => r.project === 'JARVIS' && r.status === 'SUCCESS'))
  console.log('PASS: E2E login and City API expose successful JARVIS run in Market Trends')
} finally { await db.$disconnect() }
