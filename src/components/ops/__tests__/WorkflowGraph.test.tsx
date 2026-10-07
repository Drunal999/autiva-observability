import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkflowGraph, hasWorkflow } from '../WorkflowGraph'
import graphs from '@/lib/ops/workflowGraphs.json'

describe('WorkflowGraph', () => {
 it('draws every node of the real workflow, and every wire lands on a node', () => {
  const { container } = render(<WorkflowGraph moduleKey="seo-audit" running={false} />)
  const g = (graphs as Record<string, { nodes: unknown[]; edges: { from: number; to: number }[] }>)['seo-audit']
  expect(container.querySelectorAll('g[data-kind]')).toHaveLength(g.nodes.length)
  expect(g.edges.every(e => e.from < g.nodes.length && e.to < g.nodes.length)).toBe(true)
  expect(screen.getByText(/real n8n workflow/)).toBeInTheDocument()
 })
 it('draws nothing it does not have', () => {
  expect(hasWorkflow('inbox-triage')).toBe(false)
  render(<WorkflowGraph moduleKey="inbox-triage" running />)
  expect(screen.getByText(/hasn’t been mapped/)).toBeInTheDocument()
 })
})
