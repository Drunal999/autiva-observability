import { prisma } from '@/lib/prisma'
import { resolveIngestUser } from '@/lib/ops/ingestToken'
import { notifyTeam } from '@/lib/ops/notify'
import type { SpanType, SpanStatus } from '@prisma/client'

/**
 * Turning a Claude Code session into a Run.
 *
 * The dashboard already renders everything a session is: the fleet shows who is
 * working, the trace waterfall shows the steps, the calendar's past layer shows
 * what actually happened. None of it had a source — every figure came from
 * prisma/seed-agent-ops.mjs, which is why the SAMPLE DATA badge exists. This is
 * the missing door.
 *
 * The mapping is close to exact, which is why this shape was chosen over
 * inventing a new table:
 *
 *   a session          -> a Run   (ref, summary, tokens, started/ended, status)
 *   each tool call     -> a Span  (type, name, offset, duration, status)
 *   the person         -> an Agent, one per teammate, created on first report
 *
 * A report may instead name the MODULE it ran (`module: "marketing.seo_audit"`),
 * which an automation engine does and a person's session does not. That run is
 * then attributed to the module rather than to whoever holds the token — see
 * the comment above the agent upsert for why the city depends on it.
 */

/** Claude Code's tool names, mapped onto the span vocabulary already in use. */
const SPAN_TYPE_BY_TOOL: Record<string, SpanType> = {
  Bash: 'SHELL',
  PowerShell: 'SHELL',
  Read: 'FILE',
  Write: 'FILE',
  Edit: 'FILE',
  NotebookEdit: 'FILE',
  Glob: 'FILE',
  Grep: 'FILE',
  Task: 'SUBAGENT',
  Agent: 'SUBAGENT',
}

export function spanTypeForTool(tool: string): SpanType {
  // Unknown tools are TOOL rather than dropped: a step nobody classified is
  // still a step that happened, and losing it would silently shorten the trace.
  return SPAN_TYPE_BY_TOOL[tool] ?? 'TOOL'
}

/**
 * How long a module key may be. `Agent.name` is the join the city resolves
 * live events through, so the two must not diverge — a longer key would
 * truncate one and not the other. The real catalog's longest key is 31.
 */
const MAX_MODULE_KEY = 40

/**
 * "marketing.seo_audit" -> "Seo Audit".
 *
 * Only reached when a run names a module the catalog has never seen. A seeded
 * module keeps the display name it was given; this is the fallback that stops
 * an unknown module from appearing as a raw key.
 */
export function displayNameForKey(key: string): string {
  const tail = key.includes('.') ? key.slice(key.indexOf('.') + 1) : key
  const words = tail
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  return words.length > 0 ? words.join(' ') : key
}

export interface ReportedStep {
  tool: string
  name?: string
  startMs?: number
  durMs?: number
  ok?: boolean
  error?: string
}

export interface SessionReport {
  /** Stable id for the session, so re-reporting updates instead of duplicating. */
  sessionId: string
  /**
   * Catalog key of the module this run belongs to, e.g. "marketing.seo_audit".
   * Present for an automation engine, absent for a person's session. When
   * present the run is attributed to the module instead of to the token holder.
   */
  module?: string
  summary?: string
  project?: string
  startedAt?: string
  endedAt?: string
  tokens?: number
  costInr?: number
  ok?: boolean
  steps?: ReportedStep[]
}

const MAX_PROJECT = 80

/** A run carrying more steps than this is almost certainly a runaway loop. */
export const MAX_STEPS = 500
const MAX_SUMMARY = 500

export interface IngestResult {
  status: number
  body: Record<string, unknown>
}

export async function ingestSession(
  tenantId: string,
  presentedToken: string,
  report: SessionReport
): Promise<IngestResult> {
  if (!report?.sessionId || typeof report.sessionId !== 'string') {
    return { status: 400, body: { error: 'sessionId is required' } }
  }

  // The token says who this is. Candidates are the tenant's users, and the
  // comparison is constant-time per candidate.
  const users = await prisma.user.findMany({ select: { id: true, name: true, handle: true } })
  const userId = resolveIngestUser(tenantId, users, presentedToken)
  if (!userId) return { status: 401, body: { error: 'unrecognised ingest token' } }
  const user = users.find((u) => u.id === userId)!

  const moduleKey =
    typeof report.module === 'string' && report.module.trim()
      ? report.module.trim().toLowerCase().slice(0, MAX_MODULE_KEY)
      : null

  // WHO THE RUN BELONGS TO — the one decision the city depends on.
  //
  // A teammate's Claude Code session belongs to the PERSON. The fleet is then a
  // list of people working rather than a list of fictional processes, which is
  // the whole point of pooling three teammates' sessions into one dashboard.
  //
  // An automation engine's run does not. /api/city buckets runs by
  // `run.agent.moduleId` and drops any run whose agent has none, so a run filed
  // under "aditya" is a run the city cannot place — the work happened and the
  // building stayed dark. Naming the agent for the module fixes both halves at
  // once: the bucket resolves, and CityView's live path resolves too, because
  // it maps a lowercased agent NAME to a module and the FLEET payload carries
  // nothing else.
  //
  // The token still says which human is accountable. It just no longer decides
  // which building lights up.
  let agent
  if (moduleKey) {
    const mod = await prisma.module.upsert({
      where: { tenantId_key: { tenantId, key: moduleKey } },
      update: {},
      create: { tenantId, key: moduleKey, displayName: displayNameForKey(moduleKey) },
    })
    agent = await prisma.agent.upsert({
      where: { tenantId_name: { tenantId, name: moduleKey } },
      // An agent with this name may predate this route and carry no module.
      // Adopt it rather than leaving a second, unplaceable one beside it.
      update: { moduleId: mod.id },
      create: { tenantId, name: moduleKey, model: 'engine', status: 'IDLE', moduleId: mod.id },
    })
  } else {
    const agentName = (user.handle ?? user.name ?? 'teammate').toLowerCase().slice(0, 40)
    agent = await prisma.agent.upsert({
      where: { tenantId_name: { tenantId, name: agentName } },
      update: {},
      create: { tenantId, name: agentName, model: 'claude-code', status: 'IDLE' },
    })
  }

  const startedAt = report.startedAt ? new Date(report.startedAt) : new Date()
  if (Number.isNaN(startedAt.getTime())) {
    return { status: 400, body: { error: 'startedAt is not a valid time' } }
  }
  const endedAt = report.endedAt ? new Date(report.endedAt) : null
  if (endedAt && Number.isNaN(endedAt.getTime())) {
    return { status: 400, body: { error: 'endedAt is not a valid time' } }
  }
  // A session still open has no end and is RUNNING, which is exactly what the
  // fleet's live state is for.
  const status = endedAt ? (report.ok === false ? 'FAILED' : 'SUCCESS') : 'RUNNING'

  const steps = (report.steps ?? []).slice(0, MAX_STEPS)
  const project =
    typeof report.project === 'string' && report.project.trim()
      ? report.project.trim().slice(0, MAX_PROJECT)
      : null
  const summary =
    typeof report.summary === 'string' && report.summary.trim()
      ? report.summary.trim().slice(0, MAX_SUMMARY)
      : `${steps.length} step${steps.length === 1 ? '' : 's'}`

  // `ref` is unique, so re-reporting the same session UPDATES it. A session
  // that reports at start and again at end therefore becomes one run that goes
  // from RUNNING to SUCCESS — not two runs telling different halves of a story.
  const ref = `${moduleKey ? 'run' : 'cc'}-${report.sessionId}`.slice(0, 64)

  const run = await prisma.run.upsert({
    where: { ref },
    update: {
      status,
      summary,
      project,
      endedAt,
      tokens: Math.max(0, Math.round(report.tokens ?? 0)),
      costInr: Math.max(0, report.costInr ?? 0),
    },
    create: {
      ref,
      tenantId,
      agentId: agent.id,
      trigger: 'AGENT',
      status,
      summary,
      project,
      startedAt,
      endedAt,
      tokens: Math.max(0, Math.round(report.tokens ?? 0)),
      costInr: Math.max(0, report.costInr ?? 0),
    },
  })

  // Spans are replaced wholesale rather than appended: a re-report carries the
  // whole session, so appending would double every step already recorded.
  //
  // THE ROW LOCK IS NOT OPTIONAL. Reports for one session overlap in practice —
  // the `Stop` hook fires after every turn, and a reporter that gives up
  // waiting does not cancel the work already running on the server. Two
  // delete-then-create transactions then interleave as delete, delete, create,
  // create, and the trace ends up with every step twice. That is exactly what
  // happened the first time this was exercised: three steps became six.
  //
  // Locking the run row makes the replacement serial, so the last report wins
  // whole instead of both winning half.
  //
  // The timeouts are explicit because the defaults are wrong for this shape.
  // Prisma allows an interactive transaction 5s by default; the lock makes
  // concurrent reports queue, and against a hosted database each waiter can
  // exceed that easily. It did: the endpoint started returning 500s under the
  // very contention the lock was added to survive.
  //
  // `maxWait` is how long a report will queue for the lock before giving up,
  // `timeout` how long it may hold it. Both are generous relative to the ~200ms
  // of real work, because the cost of waiting is a slightly late fleet card and
  // the cost of failing is a 500.
  let spansWritten = true
  if (steps.length > 0) {
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Run" WHERE id = ${run.id} FOR UPDATE`
          await tx.span.deleteMany({ where: { runId: run.id } })
          await tx.span.createMany({
        data: steps.map((s, i) => ({
          runId: run.id,
          type: spanTypeForTool(String(s.tool ?? 'TOOL')),
          name: String(s.name ?? s.tool ?? 'step').slice(0, 200),
          startMs: Math.max(0, Math.round(s.startMs ?? i * 100)),
          durMs: Math.max(0, Math.round(s.durMs ?? 0)),
            status: (s.ok === false ? 'ERROR' : 'OK') as SpanStatus,
            error: s.error ? String(s.error).slice(0, 500) : null,
          })),
          })
        },
        { maxWait: 10_000, timeout: 20_000 }
      )
    } catch (err) {
      // A lost race for the lock must not fail the whole report. The RUN is
      // already saved — status, project, timings, the fleet card — and the
      // reporter sends the entire session again next turn, so the steps arrive
      // shortly. Returning 500 here would turn a recoverable delay into a
      // failed request, and the hook would surface nothing either way.
      const code = (err as { code?: string }).code
      if (code !== 'P2028' && code !== 'P2034') throw err
      spansWritten = false
      console.warn(`[ingest] span write for ${run.ref} lost the lock (${code}); next report will carry them`)
    }
  }

  // Keep the fleet card honest about whether this person is working right now.
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      status: status === 'RUNNING' ? 'RUNNING' : status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      currentStep: status === 'RUNNING' ? summary : null,
      startedAt: status === 'RUNNING' ? startedAt : null,
    },
  })

  // A teammate's session failing is the one thing worth interrupting people
  // for. Best-effort: the run is stored, and a missed notification must not
  // fail the report that carried it.
  if (status === 'FAILED') {
    try {
      await notifyTeam({
        tenantId,
        kind: 'RUN_FAILED',
        subjectType: 'RUN',
        subjectId: run.id,
        preview: `${agent.name} failed — ${summary}`,
        exceptUserId: userId,
      })
    } catch {
      // Nothing here is worth losing the run over.
    }
  }

  return {
    status: 200,
    body: {
      ref: run.ref, runId: run.id, agent: agent.name,
      // Echoed so a caller can see it was filed under a module and not under a
      // person — a silently mis-attributed run is the failure this route exists
      // to prevent, and it looks identical to success without this.
      module: moduleKey,
      status, project,
      // What was actually stored, so a caller is never told steps landed when
      // they did not.
      steps: spansWritten ? steps.length : 0,
    },
  }
}
