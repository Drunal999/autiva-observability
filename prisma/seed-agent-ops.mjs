// Seeds the agent-operations surfaces with the dataset the Autiva Mission
// Control artboards were designed against, so Fleet/Trace/Terminal/Automations
// render real rows rather than hardcoded constants.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const MODULES = [
  { key: 'seo-audit',       displayName: 'SEO Audit',        targetMs: 30000 },
  { key: 'lead-followup',   displayName: 'Lead Follow-up',   targetMs: 4000  },
  { key: 'inbox-triage',    displayName: 'Inbox Triage',     targetMs: 2500  },
  { key: 'invoice-chase',   displayName: 'Invoice Chasing',  targetMs: 6000  },
  { key: 'review-replies',  displayName: 'Review Replies',   targetMs: 3500  },
  { key: 'weekly-digest',   displayName: 'Weekly Digest',    targetMs: 45000 },
]

// Each internal agent also fronts a client-facing module, so client mode has
// something real to render at the demo.
const AGENT_MODULE = {
  vega: 'seo-audit', orion: 'lead-followup', lyra: 'inbox-triage',
  atlas: 'invoice-chase', nova: 'review-replies', echo: 'weekly-digest',
}

const AGENTS = [
  {
    name: 'vega', model: 'sonnet-4.5', status: 'FAILED',
    currentStep: 'e2e/board-flow.spec.ts exited 1 — drag assertion raced SWR revalidate',
    elapsedS: 412, tokensIn: 184200, tokensOut: 21400, costInr: 188.30,
    stepMs: [820, 1400, 640, 2100, 980, 1750, 610, 3200, 900, 1240, 4100, 880],
  },
  {
    name: 'orion', model: 'sonnet-4.5', status: 'RUNNING',
    currentStep: 'Patching exponential backoff in src/lib/realtime/client.ts',
    elapsedS: 96, tokensIn: 71400, tokensOut: 9800, costInr: 72.15,
    stepMs: [540, 720, 1100, 680, 940, 1320, 760, 880, 1450, 690, 1020, 1180],
  },
  {
    name: 'lyra', model: 'haiku-4.5', status: 'RUNNING',
    currentStep: 'prisma migrate dev — index on tasks.lastStatusChangeAt',
    elapsedS: 41, tokensIn: 24800, tokensOut: 3100, costInr: 9.70,
    stepMs: [220, 310, 180, 420, 260, 340, 290, 510, 230, 380, 300, 260],
  },
  {
    name: 'atlas', model: 'opus-4.1', status: 'AWAITING_APPROVAL',
    currentStep: 'Awaiting review — rate-limit PATCH /api/tasks/[id]',
    elapsedS: 1840, tokensIn: 302100, tokensOut: 44900, costInr: 561.45,
    stepMs: [1200, 980, 1640, 2200, 1100, 1380, 900, 1720, 1260, 1490, 1050, 1310],
  },
  {
    name: 'nova', model: 'sonnet-4.5', status: 'SUCCESS',
    currentStep: 'Committed mute flag to /api/user/settings (exit 0)',
    elapsedS: 268, tokensIn: 96300, tokensOut: 12700, costInr: 93.30,
    stepMs: [610, 880, 720, 1150, 830, 990, 640, 1420, 760, 1080, 700, 950],
  },
  {
    name: 'echo', model: 'haiku-4.5', status: 'IDLE',
    currentStep: null, elapsedS: 0, tokensIn: 0, tokensOut: 0, costInr: 0, stepMs: [],
  },
]

const SPANS = [
  { key: 's0', parent: null, type: 'SUBAGENT', name: 'run r-8f2c · e2e board-flow repair', startMs: 0, durMs: 38400, status: 'ERROR', model: 'sonnet-4.5', tokens: 218400, critical: true },
  { key: 's1', parent: 's0', type: 'LLM', name: 'plan: reproduce the flake', startMs: 120, durMs: 3280, status: 'OK', model: 'sonnet-4.5', tokens: 8200 },
  { key: 's2', parent: 's0', type: 'TOOL', name: 'read e2e/board-flow.spec.ts', startMs: 3550, durMs: 430, status: 'OK' },
  { key: 's3', parent: 's0', type: 'TOOL', name: 'read src/components/KanbanBoard.tsx', startMs: 4000, durMs: 600, status: 'OK' },
  { key: 's4', parent: 's0', type: 'LLM', name: 'hypothesise: drag assertion races SWR revalidate', startMs: 4650, durMs: 4550, status: 'OK', model: 'sonnet-4.5', tokens: 14100 },
  { key: 's5', parent: 's0', type: 'SHELL', name: 'pnpm playwright test --grep board', startMs: 9300, durMs: 12100, status: 'ERROR', critical: true },
  { key: 's6', parent: 's5', type: 'SHELL', name: 'chromium boot', startMs: 9400, durMs: 1800, status: 'OK' },
  { key: 's7', parent: 's5', type: 'SHELL', name: 'spec board-flow › moves card to Done', startMs: 11250, durMs: 10050, status: 'ERROR', critical: true, error: 'TimeoutError: locator.click: Timeout 5000ms exceeded.\n  waiting for getByTestId("column-DONE")\n  at e2e/board-flow.spec.ts:42:18' },
  { key: 's8', parent: 's0', type: 'FILE', name: 'patch e2e/board-flow.spec.ts (+14 −6)', startMs: 21500, durMs: 600, status: 'OK' },
  { key: 's9', parent: 's0', type: 'SUBAGENT', name: 'verify-fix', startMs: 22200, durMs: 11600, status: 'ERROR', model: 'haiku-4.5', tokens: 41800, critical: true },
  { key: 's10', parent: 's9', type: 'LLM', name: 'review diff against spec intent', startMs: 22300, durMs: 3800, status: 'OK', model: 'haiku-4.5', tokens: 11200 },
  { key: 's11', parent: 's9', type: 'SHELL', name: 'pnpm playwright test (rerun)', startMs: 26200, durMs: 7500, status: 'ERROR', critical: true },
  { key: 's12', parent: 's0', type: 'LLM', name: 'summarise failure for operator', startMs: 33900, durMs: 3700, status: 'OK', model: 'sonnet-4.5', tokens: 9600 },
  { key: 's13', parent: 's0', type: 'FILE', name: 'write report to docs/runs/r-8f2c.md', startMs: 37700, durMs: 700, status: 'RUNNING' },
]

const LOGS = [
  { stream: 'SYSTEM', level: 'INFO', kind: 'TEXT', text: '› run r-91ab attached · agent orion · model sonnet-4.5' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TEXT', text: 'resolving workspace jarvis-team-board@0.1.0' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TOOL', text: 'read', args: 'src/lib/realtime/client.ts · 118 lines', meta: '412ms' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TEXT', text: 'reconnect delay is a constant 1000ms — every client retries in the same tick' },
  { stream: 'STDERR', level: 'WARN', kind: 'TEXT', text: 'warn  provider returned 429, retrying tool:read in 2s' },
  {
    stream: 'STDOUT', level: 'INFO', kind: 'DIFF',
    text: 'src/lib/realtime/client.ts', meta: '+9 −3',
    lines: [
      '@@ -41,7 +41,13 @@ export function useBoardEvents(',
      '-  setTimeout(connect, 1000)',
      '+  const delay = Math.min(30_000, 2 ** attempt * 500)',
      '+  const jitter = Math.random() * 250',
      '+  setTimeout(connect, delay + jitter)',
    ],
  },
  { stream: 'STDOUT', level: 'INFO', kind: 'TOOL', text: 'write', args: 'src/lib/realtime/client.ts', meta: '38ms' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TEXT', text: '$ pnpm vitest run src/lib/realtime' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TEXT', text: '✓ bus.test.ts (6 tests) 214ms' },
  {
    stream: 'STDERR', level: 'ERROR', kind: 'STACK',
    text: 'AssertionError: expected 2 backoff calls, received 1',
    lines: [
      '  at client.test.ts:58:22',
      '  at runTest (vitest/dist/chunk.js:1204:11)',
      '  at processTicks (node:internal/process:95:5)',
      '  at async runSuite (vitest/dist/chunk.js:1330:7)',
      '  at async startTests (vitest/dist/chunk.js:1402:3)',
    ],
  },
  { stream: 'STDOUT', level: 'INFO', kind: 'TEXT', text: 'patching test to advance fake timers before assertion' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TOOL', text: 'edit', args: 'src/lib/realtime/__tests__/client.test.ts · +4 −1', meta: '51ms' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TEXT', text: '$ pnpm vitest run src/lib/realtime' },
  { stream: 'STDOUT', level: 'INFO', kind: 'TEXT', text: '✓ client.test.ts (9 tests) 386ms' },
  { stream: 'SYSTEM', level: 'INFO', kind: 'TEXT', text: '› 2 files changed, 0 failing · awaiting operator approval' },
]

const CLIENT_DIFF = [
  ' export function useBoardEvents(handlers: Handlers) {',
  '   const attemptRef = useRef(0)',
  ' ',
  '-  function reconnect() {',
  '-    setTimeout(connect, 1000)',
  '-  }',
  '+  function reconnect() {',
  '+    const attempt = attemptRef.current++',
  '+    const delay = Math.min(30_000, 2 ** attempt * 500)',
  '+    const jitter = Math.random() * 250',
  '+    setTimeout(connect, delay + jitter)',
  '+  }',
  ' ',
  '   useEffect(() => connect(), [])',
]

const FILES = [
  { path: 'src/lib/realtime/client.ts', status: 'WRITING', added: 9, removed: 3, diff: CLIENT_DIFF },
  { path: 'src/lib/realtime/__tests__/client.test.ts', status: 'MODIFIED', added: 4, removed: 1 },
  { path: 'src/lib/realtime/bus.ts', status: 'READING', added: 0, removed: 0 },
  { path: 'src/app/api/events/route.ts', status: 'READING', added: 0, removed: 0 },
  { path: 'src/components/KanbanBoard.tsx', status: 'READING', added: 0, removed: 0 },
  { path: 'src/lib/sounds.ts', status: 'COMMITTED', added: 2, removed: 2 },
  { path: 'package.json', status: 'COMMITTED', added: 1, removed: 0 },
  { path: 'docs/runs/r-91ab.md', status: 'MODIFIED', added: 22, removed: 0 },
]

const NODES = [
  { key: 'n1', kind: 'TRIGGER', title: 'CI failure webhook', meta: 'github · workflow_run', x: 24, y: 60, runs: 148, p95Ms: 120, edges: ['n2'] },
  { key: 'n2', kind: 'CONDITION', title: 'Same spec failed 3× in 24h?', meta: 'query · tasks + runs', x: 288, y: 60, runs: 148, p95Ms: 340, edges: ['n3', 'n4'] },
  { key: 'n3', kind: 'ACTION', title: 'Quarantine spec in playwright.config.ts', meta: 'agent · vega', x: 552, y: 12, runs: 41, p95Ms: 18400, failures: 2, edges: [] },
  { key: 'n4', kind: 'ACTION', title: 'Create task JV-401 with trace link', meta: 'POST /api/tasks', x: 552, y: 160, runs: 41, p95Ms: 210, edges: ['n7'] },
  { key: 'n5', kind: 'CONDITION', title: 'Overdue > 3 days?', meta: 'cron · flag-overdue', x: 288, y: 300, runs: 720, p95Ms: 90, edges: ['n6'] },
  { key: 'n6', kind: 'ACTION', title: 'Escalate to on-call rail', meta: 'SSE broadcast', x: 552, y: 300, runs: 63, p95Ms: 40, edges: ['n7'] },
  { key: 'n7', kind: 'ACTION', title: 'Post digest to #jarvis-ops', meta: 'webhook · slack', x: 816, y: 160, runs: 104, p95Ms: 380, edges: [] },
]

const FLOWS = [
  { name: 'flake-quarantine', trigger: 'WEBHOOK', runsToday: 41, p95Ms: 18400, failures1h: 2, enabled: true },
  { name: 'overdue-escalation', trigger: 'CRON', runsToday: 63, p95Ms: 90, failures1h: 0, enabled: true },
  { name: 'nightly-migration-check', trigger: 'CRON', runsToday: 4, p95Ms: 42000, failures1h: 0, enabled: false },
]

const HISTORY = [
  { ref: 'af-2291', status: 'OK', summary: 'board-flow quarantined · JV-401 created', durMs: 21400, minsAgo: 8 },
  { ref: 'af-2290', status: 'OK', summary: 'condition false — no action taken', durMs: 400, minsAgo: 33 },
  { ref: 'af-2289', status: 'ERROR', summary: 'agent vega exited 1 at shell:playwright', durMs: 38400, minsAgo: 52 },
  { ref: 'af-2288', status: 'OK', summary: 'JV-397 escalated to on-call rail', durMs: 600, minsAgo: 77 },
  { ref: 'af-2287', status: 'OK', summary: 'digest posted · 3 items', durMs: 1100, minsAgo: 124 },
  { ref: 'af-2286', status: 'WARN', summary: 'slack webhook retried once (429)', durMs: 2800, minsAgo: 143 },
  { ref: 'af-2285', status: 'OK', summary: 'condition false — no action taken', durMs: 300, minsAgo: 172 },
  { ref: 'af-2284', status: 'OK', summary: 'JV-408 flagged overdue · 6d', durMs: 500, minsAgo: 244 },
  { ref: 'af-2283', status: 'ERROR', summary: 'prisma advisory lock timeout', durMs: 30000, minsAgo: 282 },
  { ref: 'af-2282', status: 'OK', summary: 'digest posted · 1 item', durMs: 900, minsAgo: 304 },
]

const APPROVALS = [
  { action: 'Pay vendor invoice INV-2291 to Rankworks Media', risk: 'MONEY', amountInr: 48500,
    detail: 'Invoice matched to PO-118 and the amount is within the monthly SEO retainer, but it is above the auto-pay ceiling of Rs 25,000.',
    moduleKey: 'invoice-chase', runRef: null, minsAgo: 6 },
  { action: 'Publish 14 review replies to Google Business Profile', risk: 'PUBLISH',
    detail: 'Drafted replies for 14 reviews from the last 7 days. Two mention a refund; those are flagged in the batch.',
    moduleKey: 'review-replies', runRef: null, minsAgo: 23 },
  { action: 'Send follow-up WhatsApp to 312 leads', risk: 'BULK_MESSAGE',
    detail: 'Segment: enquired in the last 30 days, no reply. Template approved on 21 Aug. Sends over 4 hours to stay inside rate limits.',
    moduleKey: 'lead-followup', runRef: null, minsAgo: 71 },
  { action: 'Delete 1,840 archived crawl snapshots', risk: 'DATA_DELETE',
    detail: 'Snapshots older than 90 days from the SEO crawler. Frees roughly 12 GB. Not recoverable once removed.',
    moduleKey: 'seo-audit', runRef: null, minsAgo: 194 },
]

const DECIDED = [
  { action: 'Pay hosting renewal to Hostinger', risk: 'MONEY', amountInr: 8900,
    detail: 'Annual renewal, same amount as last year.', moduleKey: 'invoice-chase',
    status: 'APPROVED', minsAgo: 340, decidedMinsAgo: 336 },
  { action: 'Send promotional broadcast to all 4,102 contacts', risk: 'BULK_MESSAGE',
    detail: 'Requested outside the agreed sending window.', moduleKey: 'lead-followup',
    status: 'REJECTED', reason: 'Outside the agreed 10:00-18:00 window, and the segment was not filtered for opt-outs.',
    minsAgo: 520, decidedMinsAgo: 505 },
]

const minsAgo = (m) => new Date(Date.now() - m * 60_000)

/**
 * 24 hourly buckets ending at the current hour. Values are generated from a
 * seeded walk rather than random, so re-running the seed reproduces the same
 * series and the charts do not jump between runs.
 */
function buildBuckets(scale = 1, seedOffset = 0) {
  const hourStart = new Date()
  hourStart.setMinutes(0, 0, 0)

  const out = []
  for (let i = 23; i >= 0; i--) {
    const at = new Date(hourStart.getTime() - i * 3_600_000)
    // Deterministic pseudo-noise from the hour index.
    const n = (k) => (Math.sin((24 - i + seedOffset) * k) + 1) / 2

    const runs = Math.round(12 + n(1.7) * 26)
    const failed = Math.round(n(2.9) * 3)
    const p50 = Math.round((390 + n(1.1) * 260) * scale)
    const p95 = Math.round(p50 * 2.9 + n(0.7) * 320)
    const p99 = Math.round(p95 * 1.9 + n(2.3) * 480)
    const tokens = Math.round(runs * (5200 + n(3.1) * 3400))
    const costInr = Number((tokens * 0.00037).toFixed(2))
    const successRate = Number((((runs - failed) / Math.max(runs, 1)) * 100).toFixed(1))

    out.push({ at, runs, failed, p50Ms: p50, p95Ms: p95, p99Ms: p99, tokens, costInr, successRate })
  }
  return out
}

async function main() {
  // Idempotent: clear the ops tables only. Task/User are untouched.
  await db.approval.deleteMany()
  await db.metricBucket.deleteMany()
  await db.flowRun.deleteMany()
  await db.flowNode.deleteMany()
  await db.flow.deleteMany()
  await db.workspaceFile.deleteMany()
  await db.logLine.deleteMany()
  await db.span.deleteMany()
  await db.run.deleteMany()
  await db.agent.deleteMany()
  await db.module.deleteMany()

  const tenant = await db.tenant.upsert({
    where: { slug: 'autiva' },
    update: { name: 'Autiva (internal)', isInternal: true },
    create: { id: 'tnt_internal', slug: 'autiva', name: 'Autiva (internal)', isInternal: true },
  })

  const modules = {}
  for (const m of MODULES) {
    modules[m.key] = await db.module.create({ data: { ...m, tenantId: tenant.id } })
  }

  const agents = {}
  for (const a of AGENTS) {
    const { elapsedS, ...rest } = a
    agents[a.name] = await db.agent.create({
      data: {
        ...rest,
        tenantId: tenant.id,
        moduleId: modules[AGENT_MODULE[a.name]]?.id ?? null,
        startedAt: elapsedS ? new Date(Date.now() - elapsedS * 1000) : null,
      },
    })
  }

  // Trace run — vega's failed e2e repair, the run the Trace artboard inspects.
  const traceRun = await db.run.create({
    data: {
      ref: 'r-8f2c', tenantId: tenant.id, agentId: agents.vega.id, trigger: 'WEBHOOK', status: 'FAILED',
      summary: 'e2e board-flow repair', exitCode: 1, tokens: 218400, costInr: 188.30,
      startedAt: minsAgo(12), endedAt: minsAgo(11),
    },
  })

  const spanIds = {}
  for (const s of SPANS) {
    const row = await db.span.create({
      data: {
        runId: traceRun.id,
        parentId: s.parent ? spanIds[s.parent] : null,
        type: s.type, name: s.name, startMs: s.startMs, durMs: s.durMs,
        status: s.status, model: s.model ?? null, tokens: s.tokens ?? null,
        error: s.error ?? null, critical: s.critical ?? false,
      },
    })
    spanIds[s.key] = row.id
  }

  // Terminal run — orion's live SSE fix, the run the Terminal artboard streams.
  const termRun = await db.run.create({
    data: {
      ref: 'r-91ab', tenantId: tenant.id, agentId: agents.orion.id, trigger: 'AGENT', status: 'RUNNING',
      summary: 'SSE reconnect backoff', tokens: 71400, costInr: 72.15, startedAt: minsAgo(2),
    },
  })

  await db.logLine.createMany({
    data: LOGS.map((l, i) => ({
      runId: termRun.id, stream: l.stream, level: l.level, text: l.text,
      kind: l.kind ?? 'TEXT', args: l.args ?? null, meta: l.meta ?? null,
      lines: l.lines ?? [],
      ts: new Date(Date.now() - (LOGS.length - i) * 9_000),
    })),
  })
  await db.workspaceFile.createMany({
    data: FILES.map((f) => ({ runId: termRun.id, ...f })),
  })

  // Automations — the DAG lives on the first flow; the others carry metrics only.
  for (const [i, f] of FLOWS.entries()) {
    const flow = await db.flow.create({ data: { ...f, tenantId: tenant.id } })
    if (i === 0) {
      const nodeIds = {}
      for (const n of NODES) {
        const row = await db.flowNode.create({
          data: {
            flowId: flow.id, kind: n.kind, title: n.title, meta: n.meta,
            x: n.x, y: n.y, runs: n.runs, p95Ms: n.p95Ms, failures: n.failures ?? 0,
            edgesTo: [],
          },
        })
        nodeIds[n.key] = row.id
      }
      // Second pass: edges reference ids that only exist after every node is in.
      for (const n of NODES) {
        if (!n.edges.length) continue
        await db.flowNode.update({
          where: { id: nodeIds[n.key] },
          data: { edgesTo: n.edges.map((e) => nodeIds[e]) },
        })
      }
      await db.flowRun.createMany({
        data: HISTORY.map((h) => ({
          flowId: flow.id, ref: h.ref, status: h.status,
          summary: h.summary, durMs: h.durMs, at: minsAgo(h.minsAgo),
        })),
      })
    }
  }

  // Fleet-wide rollup (moduleId null), then one series per engine. Each
  // engine's latency is scaled around its own target, so a chart judged
  // against one global threshold would be meaningless — which is the point.
  await db.metricBucket.createMany({
    data: buildBuckets().map((b) => ({ ...b, tenantId: tenant.id, moduleId: null })),
  })

  const ENGINE_SCALE = {
    'inbox-triage': 0.55,
    'review-replies': 0.8,
    'lead-followup': 0.95,
    'invoice-chase': 1.35,
    'seo-audit': 4.2,
    'weekly-digest': 7.5,
  }

  let offset = 0
  for (const [key, scale] of Object.entries(ENGINE_SCALE)) {
    offset += 3
    await db.metricBucket.createMany({
      data: buildBuckets(scale, offset).map((b) => ({
        ...b, tenantId: tenant.id, moduleId: modules[key].id,
      })),
    })
  }

  const decider = await db.user.findFirst({ where: { githubId: 'e2e-test-user' } })

  for (const a of APPROVALS) {
    const { moduleKey, runRef, minsAgo: m, ...rest } = a
    await db.approval.create({
      data: {
        ...rest,
        tenantId: tenant.id,
        moduleId: modules[moduleKey]?.id ?? null,
        runId: runRef ? (await db.run.findUnique({ where: { ref: runRef } }))?.id ?? null : null,
        requestedAt: minsAgo(m),
      },
    })
  }

  for (const a of DECIDED) {
    const { moduleKey, minsAgo: m, decidedMinsAgo, ...rest } = a
    await db.approval.create({
      data: {
        ...rest,
        tenantId: tenant.id,
        moduleId: modules[moduleKey]?.id ?? null,
        requestedAt: minsAgo(m),
        decidedAt: minsAgo(decidedMinsAgo),
        decidedById: decider?.id ?? null,
      },
    })
  }

  console.log('seeded:',
    await db.approval.count(), 'approvals ·',
    await db.module.count(), 'modules ·',
    await db.metricBucket.count(), 'buckets ·',
    await db.agent.count(), 'agents ·',
    await db.run.count(), 'runs ·',
    await db.span.count(), 'spans ·',
    await db.logLine.count(), 'log lines ·',
    await db.workspaceFile.count(), 'files ·',
    await db.flow.count(), 'flows ·',
    await db.flowNode.count(), 'nodes ·',
    await db.flowRun.count(), 'flow runs')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
