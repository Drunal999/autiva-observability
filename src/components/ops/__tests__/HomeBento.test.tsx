import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import useSWR from 'swr'
import { HomeBento } from '../HomeBento'

vi.mock('swr', () => ({ default: vi.fn() }))
vi.mock('@/lib/ops/brain', () => ({ useBrainStatus: () => 'remote' }))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

const reply: Record<string, unknown> = {
 '/api/stack-status': { reachable: false, agents: [] },
 '/api/approvals': { pending: [{ id: 'a1', action: 'Pay vendor invoice', risk: 'MONEY', module: { displayName: 'Invoice Chasing' }, requestedAt: new Date().toISOString() }], decided: [] },
}
vi.mocked(useSWR).mockImplementation(((key: string | null) => ({ data: key === null ? undefined : key.startsWith('/api/calendar') ? { items: [] } : reply[key], error: undefined, mutate: vi.fn() })) as unknown as typeof useSWR)

describe('HomeBento', () => {
 it('never shows an agent as Live when the stack cannot be reached, and lists real approvals', () => {
  render(<HomeBento modules={[]} />)
  expect(screen.queryByText('Live')).not.toBeInTheDocument()
  expect(screen.getAllByText('Not checked')).toHaveLength(5)
  expect(screen.getByText('Pay vendor invoice')).toBeInTheDocument()
  expect(screen.getByText('Nothing on today’s calendar.')).toBeInTheDocument()
 })
})
