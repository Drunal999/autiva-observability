import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryCity } from '../CategoryCity'
import { BUILDINGS } from '@/lib/ops/cityMarketplace'

describe('CategoryCity', () => {
  it('has a lot for every building in the catalog', () => {
    render(<CategoryCity selected={null} onSelect={() => {}} night={false} labels={{}} />)
    for (const b of BUILDINGS) expect(screen.getByRole('button', { name: `Enter ${b.name}` })).toBeInTheDocument()
  })
})
