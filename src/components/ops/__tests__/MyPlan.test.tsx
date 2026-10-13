import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PlanToggle, MyPlanBar } from '../MyPlan'
import { myPlan } from '@/lib/ops/myPlan'
import { planFor } from '@/lib/ops/plans'

beforeEach(() => { act(() => myPlan.clear()); vi.unstubAllGlobals() })

describe('My plan', () => {
 it('picks the smallest plan that covers the buildings', () => {
  expect([planFor(1).id, planFor(2).id, planFor(3).id, planFor(4).id]).toEqual(['starter', 'growth', 'growth', 'pro'])
 })
 it('adds and removes, says Reserve for what is not built yet, and shows the plan it adds up to', () => {
  render(<><PlanToggle item={{ key: 'ca-gst-recon', name: 'GSTR-2B Reconciliation', building: 'finance', ready: false }} /><MyPlanBar /></>)
  expect(screen.queryByRole('button', { name: /My plan/ })).toBeNull() // nothing picked, no bar
  fireEvent.click(screen.getByRole('button', { name: 'Reserve' }))
  expect(screen.getByRole('button', { name: '✓ In my plan' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /My plan · 1/ }))
  expect(screen.getByText('₹499/month')).toBeInTheDocument()
  expect(screen.getByText(/No payment now/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove GSTR-2B Reconciliation' }))
  expect(screen.queryByRole('button', { name: /My plan/ })).toBeNull()
 })
 it('sends the request, empties the plan and says nothing was charged; a failure says so and keeps the plan', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })).mockResolvedValueOnce(Response.json({ id: 'ap1' }))
  vi.stubGlobal('fetch', fetch)
  act(() => myPlan.toggle({ key: 'ca-gst-recon', name: 'GSTR-2B Reconciliation', building: 'finance', ready: false }))
  render(<MyPlanBar />)
  fireEvent.click(screen.getByRole('button', { name: /My plan · 1/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Request setup' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t send/)
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ keys: ['ca-gst-recon'] })
  fireEvent.click(screen.getByRole('button', { name: 'Request setup' }))
  expect(await screen.findByRole('status')).toHaveTextContent(/Nothing has been charged/)
 })
})
