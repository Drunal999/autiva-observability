import { describe, expect, it } from 'vitest'
import { clean, DEFAULT_PREFS } from '../prefs'

describe('clean prefs', () => {
 it('keeps known values and drops anything else', () => {
  expect(clean({ assistantName: '  Jarvis ', palette: 'ocean', accent: 'pink', glass: 'frosted', hidden: ['brain', 'nope'] }))
   .toEqual({ ...DEFAULT_PREFS, assistantName: 'Jarvis', palette: 'ocean', accent: 'pink', glass: 'frosted', hidden: ['brain'] })
 })
 it('preserves explicit theme and climate while accepting older saved preferences', () => {
  expect(clean({appearance:'dark',cityClimate:'night'})).toMatchObject({appearance:'dark',cityClimate:'night'})
  expect(clean({appearance:'light',cityClimate:'day'})).toMatchObject({appearance:'light',cityClimate:'day'})
  expect(clean({appearance:'invalid',cityClimate:'invalid'})).toEqual(DEFAULT_PREFS)
  expect(clean({palette:'ocean'})).toMatchObject({appearance:'system',cityClimate:'auto'})
 })
 it('requires an explicit opt-in for sounds', () => {
  expect(clean({sounds:true}).sounds).toBe(true)
  expect(clean({sounds:'true'}).sounds).toBe(false)
  expect(clean({}).sounds).toBe(false)
 })
 it('falls back to defaults for missing, empty or hostile input', () => {
  expect(clean(null)).toEqual(DEFAULT_PREFS)
  expect(clean({ assistantName: '   ', palette: 'neon', accent: 'red', glass: 'x', hidden: 'brain' })).toEqual(DEFAULT_PREFS)
  expect(clean({ assistantName: 'x'.repeat(50) }).assistantName).toHaveLength(20)
 })
})
