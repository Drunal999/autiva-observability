#!/usr/bin/env node
/**
 * Reports a Claude Code session into the shared dashboard.
 *
 * Wired as Claude Code hooks, this is what puts real work on the fleet: each of
 * you keeps working exactly as you do now, and the dashboard fills with what
 * actually happened instead of seeded numbers.
 *
 * THREE HOOKS, THREE MEANINGS. The same script handles all of them and decides
 * what to report from `hook_event_name`:
 *
 *   SessionStart  -> the run appears, RUNNING, with no steps yet
 *   Stop          -> steps so far, STILL RUNNING (a turn ended, not the session)
 *   SessionEnd    -> the final state, with an end time, so it settles to SUCCESS
 *
 * That ordering is the whole point of the live fleet: `Stop` fires after every
 * turn, so a teammate's card updates while they are working rather than once
 * they have finished and gone. Getting it wrong the other way — treating `Stop`
 * as the end — would mark somebody finished several times per session and show
 * them idle while they were mid-task.
 *
 * Install with:  node scripts/install-hooks.mjs
 * Full setup:    docs/shared-fleet-setup.md
 *
 * IT FAILS SILENTLY, ON PURPOSE. A script that reports on your work must never
 * break the work: if the dashboard is down, the laptop is offline, or the token
 * is wrong, this exits 0 and says nothing. Run it with --verbose to find out
 * why nothing arrived.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const VERBOSE = process.argv.includes('--verbose')
const log = (...a) => VERBOSE && console.error('[report-session]', ...a)

const URL_BASE = process.env.AUTIVA_URL ?? 'http://localhost:3000'
const TOKEN = process.env.AUTIVA_INGEST_TOKEN

if (!TOKEN) {
  log('AUTIVA_INGEST_TOKEN is not set; nothing reported')
  process.exit(0)
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Turns the transcript into steps, and reads the session's real start time.
 *
 * The first entry's timestamp is when the session actually began — far better
 * than guessing backwards from step offsets, which is all the end-of-session
 * report could do before `SessionStart` existed.
 */
function readTranscript(transcriptPath) {
  const empty = { steps: [], startedAt: null, tokens: 0 }
  if (!transcriptPath) return empty

  let lines
  try {
    lines = readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
  } catch (err) {
    log('could not read transcript:', err.message)
    return empty
  }

  const steps = []
  let firstAt = null
  let tokens = 0

  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    const at = Date.parse(entry.timestamp ?? '') || null
    if (at && firstAt === null) firstAt = at

    const usage = entry?.message?.usage
    if (usage) {
      tokens += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
    }

    const content = entry?.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (block?.type !== 'tool_use') continue
      steps.push({
        tool: block.name ?? 'TOOL',
        // The tool's own description where it has one: "Run the test suite"
        // reads better in a waterfall than "Bash".
        name: block.input?.description ?? block.name ?? 'step',
        startMs: at && firstAt ? at - firstAt : undefined,
      })
    }
  }

  // Durations are the gap to the next step. The last one gets a nominal value:
  // a transcript records when a tool STARTED, never when it returned.
  for (let i = 0; i < steps.length; i++) {
    const next = steps[i + 1]
    steps[i].durMs =
      steps[i].startMs != null && next?.startMs != null
        ? Math.max(0, next.startMs - steps[i].startMs)
        : 1000
  }

  return { steps, startedAt: firstAt ? new Date(firstAt).toISOString() : null, tokens }
}

async function main() {
  const raw = readStdin()
  let hook = {}
  try {
    hook = raw ? JSON.parse(raw) : {}
  } catch {
    log('stdin was not JSON; reporting a bare session')
  }

  const event = hook.hook_event_name ?? hook.hookEventName ?? 'Stop'
  const sessionId = hook.session_id ?? hook.sessionId ?? `local-${Date.now()}`
  const cwd = hook.cwd ?? process.cwd()
  const project = basename(cwd) || 'unknown'

  const { steps, startedAt, tokens } = readTranscript(
    hook.transcript_path ?? hook.transcriptPath
  )

  // Only SessionEnd closes the run. `Stop` fires after every turn — treating it
  // as the end would mark somebody finished several times a session and show
  // them idle while they were still working.
  const finished = event === 'SessionEnd'

  const report = {
    sessionId,
    project,
    startedAt: startedAt ?? new Date().toISOString(),
    endedAt: finished ? new Date().toISOString() : undefined,
    tokens,
    ok: true,
    steps,
    summary:
      event === 'SessionStart'
        ? `working in ${project}`
        : steps.length
          ? `${steps.length} step${steps.length === 1 ? '' : 's'} in ${project}`
          : `session in ${project}`,
  }

  try {
    const res = await fetch(`${URL_BASE}/api/ingest/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(report),
      // Short for the reports that repeat, patient for the one that does not.
      //
      // SessionStart and Stop fire again and again, so giving up early costs at
      // most one stale data point and never keeps somebody waiting. SessionEnd
      // has no next turn: if it is abandoned the run is left RUNNING forever
      // and the fleet shows that person still working days later. It is worth
      // waiting for.
      signal: AbortSignal.timeout(finished ? 10_000 : 2500),
    })
    const body = await res.json().catch(() => ({}))
    log(
      res.ok
        ? `${event}: reported ${body.ref} as ${body.status} (${body.steps} steps, ${project})`
        : `${event}: refused ${res.status} — ${body.error}`
    )
  } catch (err) {
    log(`${event}: could not reach the dashboard —`, err.message)
  }
}

// Never let a reporting failure surface in somebody's session.
main().then(
  () => process.exit(0),
  (err) => {
    log('unexpected:', err?.message)
    process.exit(0)
  }
)
