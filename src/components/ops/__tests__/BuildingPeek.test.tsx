import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { BuildingPeek } from '../BuildingTour'
import { CATALOG } from '@/lib/ops/marketplaceCatalog'
import type { CityModule } from '@/lib/ops/cityMarketplace'

vi.mock('@/lib/ops/prefs', () => ({ usePrefs: () => ({}) }))

const live: CityModule = { id: 'm1', key: 'invoice-chase', displayName: 'Invoice Chasing', district: 'finance', pendingApprovals: 1, agents: [{ id: 'a1', status: 'IDLE' }], runs: [] }
const offer = CATALOG.filter(c => c.building === 'finance')

describe('Explore: the card for a tapped building', () => {
 it('says what the building is and what it can do, and every line opens the marketplace', () => {
  const h = { onOpenLive: vi.fn(), onOpenItem: vi.fn(), onOpenAll: vi.fn(), onClose: vi.fn() }
  render(<BuildingPeek building="finance" live={[live]} offer={offer} {...h} />)
  const card = screen.getByRole('complementary', { name: 'Finance & Billing building' })
  expect(within(card).getByRole('heading', { name: 'Finance & Billing' })).toBeInTheDocument()
  expect(within(card).getAllByRole('button', { name: /: see how it works$/ })).toHaveLength(4)
  fireEvent.click(within(card).getByRole('button', { name: 'GST bills matched: see how it works' }))
  expect(h.onOpenItem).toHaveBeenCalledWith('ca-gst-recon')
  fireEvent.click(within(card).getByRole('button', { name: /Invoice Chasing/ }))
  expect(h.onOpenLive).toHaveBeenCalledWith('m1')
  fireEvent.click(within(card).getByRole('button', { name: 'See everything in Finance & Billing' }))
  expect(h.onOpenAll).toHaveBeenCalled()
  fireEvent.click(within(card).getByRole('button', { name: 'Close building card' }))
  expect(h.onClose).toHaveBeenCalled()
 })
 it('shows a picture, never a film, over the running city', () => {
  render(<BuildingPeek building="finance" live={[]} offer={offer} onOpenLive={vi.fn()} onOpenItem={vi.fn()} onOpenAll={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByRole('img', { name: /Finance building/ })).toBeInTheDocument()
  expect(document.querySelector('video')).toBeNull()
  expect(screen.queryByRole('button', { name: /Watch it work/ })).toBeNull()
 })
 it('works for a building with no film yet', () => {
  render(<BuildingPeek building="security" live={[]} offer={[]} onOpenLive={vi.fn()} onOpenItem={vi.fn()} onOpenAll={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '▶ Watch it work' })).toBeNull()
 })
})
