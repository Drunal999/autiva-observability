/**
 * Planned designs for automations that have no n8n workflow yet. Drawn in the
 * same canvas as the real ones but always labelled "Blueprint" and never
 * animated, so nobody reads them as something that is running. When the real
 * workflow lands, add it to scripts/export-workflow-graphs.mjs and delete the
 * blueprint here: the real graph always wins.
 */
type Node = { id: number; name: string; kind: string; x: number; y: number }
type Edge = { from: number; to: number; label: string | null }
export type Graph = { source: string; nodes: Node[]; edges: Edge[] }

// [name, kind, column, row]. Columns follow n8n's 240px grid; rows offset branches.
type Step = [name: string, kind: string, col: number, row?: number]
function plan(source: string, steps: Step[], wires: [number, number, string?][]): Graph {
  return {
    source,
    nodes: steps.map(([name, kind, col, row = 0], id) => ({ id, name, kind, x: col * 240, y: row * 110 })),
    edges: wires.map(([from, to, label]) => ({ from, to, label: label ?? null })),
  }
}

export const BLUEPRINTS: Record<string, Graph> = {
  'inbox-triage': plan('inbox-triage blueprint', [
    ['New message', 'trigger', 0], ['Read & classify', 'code', 1], ['Needs a person?', 'branch', 2],
    ['Draft reply', 'code', 3, -1], ['Owner approves', 'step', 4, -1], ['Send reply', 'send', 5, -1],
    ['Tag & file', 'step', 3, 1], ['Log outcome', 'step', 6],
  ], [[0, 1], [1, 2], [2, 3, 'yes'], [3, 4], [4, 5], [2, 6, 'no'], [5, 7], [6, 7]]),
  'invoice-chase': plan('invoice-chase blueprint', [
    ['Daily 09:00', 'trigger', 0], ['Fetch unpaid invoices', 'http', 1], ['Overdue?', 'branch', 2],
    ['Draft reminder', 'code', 3, -1], ['Owner approves', 'step', 4, -1], ['Email reminder', 'send', 5, -1],
    ['Check tomorrow', 'step', 3, 1],
  ], [[0, 1], [1, 2], [2, 3, 'yes'], [3, 4], [4, 5], [2, 6, 'no']]),
  'review-replies': plan('review-replies blueprint', [
    ['New review', 'trigger', 0], ['Read rating & text', 'code', 1], ['Unhappy review?', 'branch', 2],
    ['Flag to owner', 'step', 3, -1], ['Draft thank-you', 'code', 3, 1], ['Owner approves', 'step', 4, 1],
    ['Post reply', 'send', 5, 1],
  ], [[0, 1], [1, 2], [2, 3, 'yes'], [2, 4, 'no'], [4, 5], [5, 6]]),
  'weekly-digest': plan('weekly-digest blueprint', [
    ['Monday 08:00', 'trigger', 0], ['Collect last week', 'http', 1], ['Summarise', 'code', 2],
    ['Email digest', 'send', 3],
  ], [[0, 1], [1, 2], [2, 3]]),
  'market-trends': plan('market-trends blueprint', [
    ['Every week', 'trigger', 0], ['Fetch search trends', 'http', 1], ['Spot rising topics', 'code', 2],
    ['Save to the brain', 'step', 3],
  ], [[0, 1], [1, 2], [2, 3]]),
}
