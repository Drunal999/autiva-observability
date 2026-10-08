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
  'ugc-ads': plan('ugc-ads blueprint', [
    ['Product brief', 'trigger', 0], ['Write ad scripts', 'code', 1], ['Avatar video', 'http', 2],
    ['Label as AI-made', 'step', 3], ['Owner approves', 'step', 4], ['Export for ads', 'step', 5],
  ], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
  'ad-reengineer': plan('ad-reengineer blueprint', [
    ['Every week', 'trigger', 0], ['Read Ad Library', 'http', 1], ['Hook, offer, angle', 'code', 2],
    ['Write own variations', 'code', 3], ['Owner approves', 'step', 4], ['Save ad drafts', 'step', 5],
  ], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
  'photo-to-reel': plan('photo-to-reel blueprint', [
    ['New photos', 'trigger', 0], ['Pick best shots', 'code', 1], ['Image to video', 'http', 2],
    ['Caption & music', 'step', 3], ['Owner approves', 'step', 4], ['Publish (official API)', 'send', 5],
  ], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
  'product-shots': plan('product-shots blueprint', [
    ['New product photo', 'trigger', 0], ['Remove background', 'http', 1], ['Lifestyle scenes', 'http', 2],
    ['Owner picks', 'step', 3], ['Save to library', 'step', 4],
  ], [[0, 1], [1, 2], [2, 3], [3, 4]]),
  'voice-receptionist': plan('voice-receptionist blueprint', [
    ['Incoming call', 'trigger', 0], ['Voice agent answers', 'http', 1], ['Can it answer?', 'branch', 2],
    ['Answer or book', 'step', 3, -1], ['Hand to a person', 'send', 3, 1], ['Call summary', 'code', 4], ['Log outcome', 'step', 5],
  ], [[0, 1], [1, 2], [2, 3, 'yes'], [2, 4, 'no'], [3, 5], [4, 5], [5, 6]]),
  'callback-agent': plan('callback-agent blueprint', [
    ['Customer asked for a call', 'trigger', 0], ['Consent & DND check', 'branch', 1],
    ['Place the call', 'http', 2, -1], ['Summary to CRM', 'step', 3, -1], ['Task for owner', 'step', 2, 1],
  ], [[0, 1], [1, 2, 'yes'], [2, 3], [1, 4, 'no']]),
  'call-your-agent': plan('call-your-agent blueprint', [
    ['You call your number', 'trigger', 0], ['Your assistant answers', 'http', 1], ["Read today's status", 'code', 2],
    ['What needs your OK', 'step', 3], ['Note it as a task', 'step', 4],
  ], [[0, 1], [1, 2], [2, 3], [3, 4]]),
  'market-trends': plan('market-trends blueprint', [
    ['Every week', 'trigger', 0], ['Fetch search trends', 'http', 1], ['Spot rising topics', 'code', 2],
    ['Save to the brain', 'step', 3],
  ], [[0, 1], [1, 2], [2, 3]]),
}
