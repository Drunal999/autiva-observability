import { describe, expect, it } from 'vitest'
import { d1Date, ownerOf, townOf } from '../PipelineView'

describe('pipeline helpers', () => {
  it('finds the searched town inside a full Google address', () => {
    expect(townOf('Rathbari, English Bazar, West Bengal 732101, India')).toBe('Malda')
    expect(townOf('GPG9+6X8, Jalpaiguri, West Bengal 735101, India')).toBe('Jalpaiguri')
    expect(townOf('Hill Cart Rd, Siliguri, Jalpaiguri, West Bengal 734003, India')).toBe('Siliguri')
    expect(townOf('80 Feet Rd, Koramangala, Bengaluru, Karnataka 560034, India')).toBe('Bangalore')
    expect(townOf('Somewhere, India')).toBe('Other')
  })
  it('gives Runal Bangalore and Guwahati, Aditya the rest', () => {
    expect(ownerOf('Bengaluru')).toBe('Runal')
    expect(ownerOf('Guwahati')).toBe('Runal')
    expect(ownerOf('Malda')).toBe('Aditya')
  })
  it('reads D1 timestamps as UTC', () => {
    expect(d1Date('2026-11-14 03:30:00')).toBe('2026-11-14T03:30:00.000Z')
  })
})
