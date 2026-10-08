#!/usr/bin/env node
/**
 * Copies the SHAPE of real AUTIVA n8n workflows into the dashboard, so an
 * automation's "How it works" view draws the actual workflow, not an
 * illustration.
 *
 * Only node names, node kinds, canvas positions and connections cross over.
 * Parameters, URLs, credentials and code bodies never leave the n8n JSON.
 *
 *   node scripts/export-workflow-graphs.mjs [path/to/AUTIVA/workflows]
 *
 * A module maps to a workflow only where the pairing is plain; every other
 * module shows "not mapped yet" rather than a borrowed graph.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? '../AUTIVA/workflows')
// A module can run on several workflows in sequence: its layers, in order.
const MAP = {
  'seo-audit': ['E5_website_audit_v1.json'],
  'lead-followup': ['E2_lead_producer_v1.json', 'E2_outreach_sender_v1.json'],
  'content-studio': ['E4_content_draft_v1.json', 'E4_content_publish_v1.json'],
  'menu-onboarding': ['E3_menu_onboarding_v1.json'],
  'feed-liveness': ['E6_feed_liveness_v1.json'],
}

const kindOf = (type) => {
  const t = type.replace(/^n8n-nodes-base\./, '')
  if (/trigger|webhook/i.test(t)) return 'trigger'
  if (t === 'if' || t === 'switch') return 'branch'
  if (t === 'code' || t === 'function') return 'code'
  if (t === 'httpRequest') return 'http'
  if (t === 'emailSend' || t === 'linkedIn') return 'send'
  return 'step'
}

function graphOf(file) {
  const wf = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const ids = new Map(wf.nodes.map((n, i) => [n.name, i]))
  const nodes = wf.nodes.map((n, i) => ({ id: i, name: n.name, kind: kindOf(n.type), x: n.position[0], y: n.position[1] }))
  const edges = []
  for (const [from, outputs] of Object.entries(wf.connections ?? {})) {
    const branch = wf.nodes[ids.get(from)]?.type.endsWith('.if')
    ;(outputs.main ?? []).forEach((targets, port) => {
      for (const t of targets ?? []) {
        if (!ids.has(from) || !ids.has(t.node)) throw new Error(`${file}: connection to unknown node "${t.node}"`)
        edges.push({ from: ids.get(from), to: ids.get(t.node), label: branch ? (port === 0 ? 'yes' : 'no') : null })
      }
    })
  }
  return { source: file.replace(/\.json$/, ''), nodes, edges }
}

const out = {}
for (const [key, files] of Object.entries(MAP)) out[key] = files.map(graphOf)

const target = resolve('src/lib/ops/workflowGraphs.json')
writeFileSync(target, JSON.stringify(out, null, 1) + '\n')
console.log(`wrote ${Object.keys(out).length} workflow graphs to ${target}`)
