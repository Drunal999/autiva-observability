import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'

const html = readFileSync('public/city/agentic-city.html', 'utf8')
test('exported scripts compile without the Claude frame runtime', () => {
  assert.ok(!html.includes('__FRAME_PREAMBLE'))
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(match[1])
})
test('bridge accepts only parent origin, chooses latest run and clears missing data', () => {
  let receive
  const parent = { postMessage() {} }
  const context = { parent, location: { origin: 'http://localhost:3111' }, window: { addEventListener(_, fn) { receive = fn } } }
  runInNewContext(html.slice(html.indexOf('var REAL_MAP'), html.indexOf('\nvar TASKS =')), context)
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
