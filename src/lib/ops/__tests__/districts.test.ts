import { describe, it, expect } from 'vitest'
import { DISTRICTS, DEPARTMENTS, DEPARTMENT_PURPOSE, districtFor, departmentFor } from '../districts'
import { BUILDINGS, buildingFor, moduleDetails, type CityModule } from '../cityMarketplace'

const hospital: CityModule = {
  id: 'm-health', key: 'healthcare.hospital_automation', displayName: 'Hospital Automation',
  district: 'healthcare', pendingApprovals: 0, agents: [], runs: [],
}

describe('healthcare in the city', () => {
  it('files the hospital automation under its own district and department', () => {
    expect(districtFor('healthcare.hospital_automation')).toBe('healthcare')
    expect(departmentFor('healthcare')).toBe('Healthcare')
    expect(DEPARTMENTS).toContain('Healthcare')
    expect(DEPARTMENT_PURPOSE.Healthcare).toMatch(/appointments/i)
  })

  it('gives healthcare its own building in the marketplace', () => {
    expect(buildingFor('healthcare')).toBe('healthcare')
    const building = BUILDINGS.find((b) => b.id === 'healthcare')
    expect(building?.name).toBe('Healthcare')
    expect(building?.districts).toEqual(['healthcare'])
  })

  it('describes the hospital automation instead of the generic fallback', () => {
    expect(moduleDetails(hospital).purpose).toMatch(/appointments/i)
    expect(moduleDetails(hospital).audience).toMatch(/hospitals|clinics/i)
  })
})

describe('the catalog', () => {
  it('puts every district in exactly one building, so no module goes homeless', () => {
    for (const d of DISTRICTS) {
      expect(BUILDINGS.filter((b) => (b.districts as readonly string[]).includes(d)), d).toHaveLength(1)
    }
  })
})
