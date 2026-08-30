#!/usr/bin/env node
/**
 * Reports a Claude Code session into the shared dashboard.
 *
 * Wired as a Claude Code hook, this is what puts real work on the fleet: each
 * of you keeps working exactly as you do now, and the dashboard fills with
 * what actually happened instead of seeded numbers.
 *
 * SETUP (once per person)
 *
 *   1. Get your token from whoever runs the dashboard:
 *        node scripts/issue-ingest-token.mjs <your-github-handle>
 *
 *   2. Put these in your environment:
 *        AUTIVA_URL=http://localhost:3000        (or wherever it is hosted)
 *        AUTIVA_INGEST_TOKEN=<your token>
 *
 *   3. Add a hook to ~/.claude/settings.json so it fires when a session ends:
 *
 *        { "hooks": { "Stop": [ { "hooks": [ {
 *            "type": "command",
 *            "command": "node /absolute/path/to/scripts/report-session.mjs"
 *        } ] } ] } }
 *
 * Claude Code passes the hook a JSON payload on stdin. This reads it, turns the
 * transcript into steps, and posts one run.
 *
 * IT FAILS SILENTLY, ON PURPOSE. A reporting script must never break the
 * session it is reporting on: if the dashboard is down, your laptop is offline,
 * or the token is wrong, this exits 0 and says nothing. Run it with --verbose
 * to see why nothing arrived.
 */
import { readFileSync } from 'node:fs'

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

/** Claude Code tools, in the order they were used, become spans. */
function stepsFromTranscript(transcriptPath) {
  if (!transcriptPath) return []
  let lines
  try {
    lines = readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
  } catch (err) {
    log('could not read transcript:', err.message)
    return []
  }

  const steps = []
  let firstAt = null

  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const content = entry?.message?.content
    if (!Array.isArray(content)) continue

    const at = Date.parse(entry.timestamp ?? '') || null
    if (at && firstAt === null) firstAt = at

    for (const block of content) {
      if (block?.type !== 'tool_use') continue
      steps.push({
        tool: block.name ?? 'TOOL',
        // The tool's own description where it has one, else the tool name:
        // "Run the test suite" reads better in a waterfall than "Bash".
        name: block.input?.description ?? block.name ?? 'step',
        startMs: at && firstAt ? at - firstAt : undefined,
      })
    }
  }

  // Durations are the gap to the next step. The last one gets a nominal value:
  // the transcript records when a tool STARTED, never when it returned.
  for (let i = 0; i < steps.length; i++) {
    const next = steps[i + 1]
    if (steps[i].startMs != null && next?.startMs != null) {
      steps[i].durMs = Math.max(0, next.startMs - steps[i].startMs)
    } else {
      steps[i].durMs = 1000
    }
  }
  return steps
}

async function main() {
  const raw = readStdin()
  let hook = {}
  try {
    hook = raw ? JSON.parse(raw) : {}
  } catch {
    log('stdin was not JSON; reporting a bare session')
  }

  const sessionId = hook.session_id ?? hook.sessionId ?? `local-${Date.now()}`
  const steps = stepsFromTranscript(hook.transcript_path ?? hook.transcriptPath)

  const report = {
    sessionId,
    // The working directory is the most reliable "which project" signal a hook
    // gets, and it is what a teammate reading the fleet actually recognises.
    project: (hook.cwd ?? process.cwd()).split(/[\\/]/).pop(),
    summary: steps.length
      ? `${steps.length} steps in ${(hook.cwd ?? process.cwd()).split(/[\\/]/).pop()}`
      : 'session with no tool calls',
    startedAt: new Date(Date.now() - Math.max(1000, steps.at(-1)?.startMs ?? 1000)).toISOString(),
    endedAt: new Date().toISOString(),
    ok: true,
    steps,
  }

  try {
    const res = await fetch(`${URL_BASE}/api/ingest/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5000),
    })
    const body = await res.json().catch(() => ({}))
    log(res.ok ? `reported ${body.ref} (${body.steps} steps)` : `refused ${res.status}: ${body.error}`)
  } catch (err) {
    log('could not reach the dashboard:', err.message)
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
