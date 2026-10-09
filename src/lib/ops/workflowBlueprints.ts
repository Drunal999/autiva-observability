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
  'ca-compliance-reminders': plan('ca-compliance-reminders blueprint', [
    ['Every morning', 'trigger', 0], ['Read due dates', 'http', 1], ['Days left?', 'branch', 2],
    ['Remind client', 'send', 3, -1], ['Overdue 3+ days?', 'branch', 3, 1], ['Alert a partner', 'send', 4, 1], ['Log reminder', 'step', 5],
  ], [[0, 1], [1, 2], [2, 3, 'yes'], [2, 4, 'no'], [4, 5, 'yes'], [3, 6], [5, 6]]),
  'ca-document-chaser': plan('ca-document-chaser blueprint', [
    ['Filing starts', 'trigger', 0], ['List documents needed', 'code', 1], ['Request from client', 'send', 2],
    ['Still pending after 3 days?', 'branch', 3], ['Follow up', 'send', 4, -1], ['Partner takes over', 'step', 5, -1], ['Mark received', 'step', 4, 1],
  ], [[0, 1], [1, 2], [2, 3], [3, 4, 'yes'], [4, 5], [3, 6, 'no']]),
  'ca-client-desk': plan('ca-client-desk blueprint', [
    ['Client writes in', 'trigger', 0], ['Known client?', 'branch', 1], ['Look up their status', 'http', 2, -1],
    ['Draft answer', 'code', 3, -1], ['Tax advice?', 'branch', 4, -1], ['Reply', 'send', 5, -1], ['Partner answers', 'step', 5, 0],
    ['Qualify the enquiry', 'code', 2, 1], ['Add to leads', 'step', 3, 1],
  ], [[0, 1], [1, 2, 'yes'], [2, 3], [3, 4], [4, 5, 'no'], [4, 6, 'yes'], [1, 7, 'no'], [7, 8]]),
  'ca-notice-reader': plan('ca-notice-reader blueprint', [
    ['Notice arrives', 'trigger', 0], ['Read the notice', 'code', 1], ['Section, demand, reply-by', 'code', 2],
    ['Reply due in 7 days?', 'branch', 3], ['Urgent alert to partner', 'send', 4, -1], ['Brief for partner', 'step', 4, 1],
    ['Task with deadline', 'step', 5],
  ], [[0, 1], [1, 2], [2, 3], [3, 4, 'yes'], [3, 5, 'no'], [4, 6], [5, 6]]),
  'ca-gst-recon': plan('ca-gst-recon blueprint', [
    ['Before GSTR-3B', 'trigger', 0], ['Load GSTR-2B', 'http', 1], ['Load purchase register', 'http', 1, 1],
    ['Match invoices', 'code', 2], ['Any mismatch?', 'branch', 3], ['Mismatch report', 'step', 4, -1],
    ['Ask client or vendor', 'send', 5, -1], ['All matched', 'step', 4, 1],
  ], [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5, 'yes'], [5, 6], [4, 7, 'no']]),
  'ca-bank-ledger': plan('ca-bank-ledger blueprint', [
    ['Statement uploaded', 'trigger', 0], ['Read transactions', 'code', 1], ['Categorise', 'code', 2],
    ['Sure of it?', 'branch', 3], ['Ready for review', 'step', 4, -1], ['Ask the client', 'send', 4, 1],
    ['Reviewer approves', 'step', 5], ['Export for import', 'step', 6],
  ], [[0, 1], [1, 2], [2, 3], [3, 4, 'yes'], [3, 5, 'no'], [4, 6], [5, 6], [6, 7]]),
  'ca-client-update': plan('ca-client-update blueprint', [
    ['1st of the month', 'trigger', 0], ['Each client', 'step', 1], ['Filed, pending, fees', 'http', 2],
    ['Write the update', 'code', 3], ['Partner checks batch', 'step', 4], ['Send update', 'send', 5],
  ], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
  'market-trends': plan('market-trends blueprint', [
    ['Every week', 'trigger', 0], ['Fetch search trends', 'http', 1], ['Spot rising topics', 'code', 2],
    ['Save to the brain', 'step', 3],
  ], [[0, 1], [1, 2], [2, 3]]),
}
