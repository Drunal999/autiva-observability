import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkflowGraph, hasWorkflow, layersFor } from '../WorkflowGraph'
import graphs from '@/lib/ops/workflowGraphs.json'

type G = { nodes: unknown[]; edges: { from: number; to: number }[] }
const REAL = graphs as unknown as Record<string, G[]>

describe('WorkflowGraph', () => {
 it('draws every node of the real workflow', () => {
  const { container } = render(<WorkflowGraph moduleKey="seo-audit" running={false} />)
  expect(container.querySelectorAll('g[data-kind]')).toHaveLength(REAL['seo-audit'][0].nodes.length)
  expect(screen.getByText(/real n8n workflow/)).toBeInTheDocument()
 })
 it('every real layer is wired to its own nodes', () => {
  for (const layers of Object.values(REAL)) for (const g of layers)
   expect(g.edges.every(e => e.from < g.nodes.length && e.to < g.nodes.length)).toBe(true)
  expect(layersFor('lead-followup').graphs).toHaveLength(2)
 })
 it('reads AUTIVA catalog keys as the same module', () => {
  expect(layersFor('marketing.seo_audit')).toEqual(layersFor('seo-audit'))
 })
 it('a blueprint is labelled and never pulses, even while the module runs', () => {
  const { container } = render(<WorkflowGraph moduleKey="inbox-triage" running />)
  expect(screen.getByText('Blueprint')).toBeInTheDocument()
  expect(container.querySelector('figure')?.getAttribute('data-running')).toBe('false')
 })
 it('draws nothing it does not have', () => {
  expect(hasWorkflow('payroll')).toBe(false)
  render(<WorkflowGraph moduleKey="payroll" running />)
  expect(screen.getByText(/hasn’t been mapped/)).toBeInTheDocument()
 })
})
