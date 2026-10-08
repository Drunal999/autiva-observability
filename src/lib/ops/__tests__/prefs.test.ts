import { describe, expect, it } from 'vitest'
import { clean, DEFAULT_PREFS } from '../prefs'

describe('clean prefs', () => {
 it('keeps known values and drops anything else', () => {
  expect(clean({ assistantName: '  Jarvis ', palette: 'ocean', accent: 'pink', glass: 'frosted', hidden: ['brain', 'nope'] }))
   .toEqual({ assistantName: 'Jarvis', palette: 'ocean', accent: 'pink', glass: 'frosted', hidden: ['brain'] })
 })
 it('falls back to defaults for missing, empty or hostile input', () => {
  expect(clean(null)).toEqual(DEFAULT_PREFS)
  expect(clean({ assistantName: '   ', palette: 'neon', accent: 'red', glass: 'x', hidden: 'brain' })).toEqual(DEFAULT_PREFS)
  expect(clean({ assistantName: 'x'.repeat(50) }).assistantName).toHaveLength(20)
 })
})
