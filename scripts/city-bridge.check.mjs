import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'

const html = readFileSync('public/city/agentic-city.html', 'utf8')
// The data tables and the bridge: from the palette (the district table needs ST) to the task list.
const bridge = html.slice(html.indexOf('var PALETTE'), html.indexOf('\nvar TASKS ='))

/** The bridge in a sandbox, with every message listener it registers and every message it sends. */
function loadBridge({ dashboard = false } = {}) {
  const listeners = [], sent = []
  const parent = { postMessage(msg) { sent.push(msg) } }
  const context = {
    parent, location: { origin: 'http://localhost:3111' },
    document: { documentElement: { dataset: dashboard ? { dashboard: 'true' } : {} } },
    window: { addEventListener(type, fn) { if (type === 'message') listeners.push(fn) } },
  }
  runInNewContext(bridge, context)
  const receive = (event) => listeners.forEach((fn) => fn(event))
  return { context, parent, receive, sent }
}

/** Ids from a TypeScript `as const` list, read from source so this check needs no build step. */
const idsIn = (file, re) => [...readFileSync(file, 'utf8').matchAll(re)].map((m) => m[1])
const DASHBOARD_DISTRICTS = (() => {
  const src = readFileSync('src/lib/ops/districts.ts', 'utf8')
  return [...src.slice(src.indexOf('export const DISTRICTS'), src.indexOf('] as const')).matchAll(/'([a-z]+)'/g)].map((m) => m[1])
})()
const BUILDING_IDS = idsIn('src/lib/ops/cityMarketplace.ts', /\{id:'([a-z]+)'/g)

test('exported scripts compile without the Claude frame runtime', () => {
  assert.ok(!html.includes('__FRAME_PREAMBLE'))
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(match[1])
})

test('bridge accepts only parent origin, chooses latest run and clears missing data', () => {
  const { context, parent, receive } = loadBridge()
  const payload = { districts: [{ district: 'intelligence', displayName: 'Research', runs: [
    { project: 'old', startedAt: '2026-09-18T10:00:00Z', status: 'SUCCESS' },
    { project: 'new', startedAt: '2026-09-19T10:00:00Z', status: 'RUNNING' }
  ] }] }
  const event = { origin: context.location.origin, source: parent, data: { type: 'autiva:city', payload } }
  receive({ ...event, origin: 'https://untrusted.example' })
  assert.equal(Object.keys(context.REAL.byDistrict).length, 0)
  receive({ ...event, source: {} })
  assert.equal(Object.keys(context.REAL.byDistrict).length, 0)
  receive(event)
  assert.equal(context.REAL.byDistrict.data.project, 'new')
  receive({ ...event, data: { type: 'autiva:city', payload: { districts: [] } } })
  assert.equal(Object.keys(context.REAL.byDistrict).length, 0)
})

test('healthcare runs light the hospital district', () => {
  const { context, parent, receive } = loadBridge()
  const run = { project: null, startedAt: '2026-10-18T09:00:00Z', status: 'SUCCESS' }
  receive({ origin: context.location.origin, source: parent,
    data: { type: 'autiva:city', payload: { districts: [{ district: 'healthcare', displayName: 'Hospital Automation', runs: [run] }] } } })
  assert.equal(context.REAL.byDistrict.health?.source, 'Hospital Automation')
  const health = context.DISTRICTS.find((d) => d.key === 'health')
  assert.equal(health?.kind, 'clinic')
})

test('a click on the hospital opens the Healthcare building', () => {
  const { context, sent } = loadBridge({ dashboard: true })
  context.openShop(context.DISTRICTS.find((d) => d.key === 'health'))
  // Copied out of the sandbox: its objects have another realm's prototype, which strict equality rejects.
  assert.deepEqual({ ...sent.at(-1) }, { type: 'autiva:city-select', building: 'healthcare' })
  assert.equal(context.DISTRICTS.find((d) => d.key === 'health').name, 'HEALTHCARE')
})

test('the city and the catalog agree on every district and building', () => {
  const { context } = loadBridge()
  for (const district of Object.keys(context.REAL_MAP)) assert.ok(DASHBOARD_DISTRICTS.includes(district), `REAL_MAP names unknown district ${district}`)
  for (const D of context.DISTRICTS) {
    assert.ok(BUILDING_IDS.includes(context.SHOP[D.key]), `${D.key} opens unknown building ${context.SHOP[D.key]}`)
    assert.ok(context.SHOP_NAME[context.SHOP[D.key]], `${D.key} has no dashboard name`)
  }
  const keys = Array.from(context.DISTRICTS, (d) => d.key)
  assert.equal(new Set(keys).size, keys.length, 'district keys are unique')
  // Appended, never inserted: every existing building keeps its place in the seeded layout.
  assert.deepEqual(keys.slice(0, 6), ['core', 'learn', 'data', 'growth', 'collab', 'impact'])
})
