#!/usr/bin/env node
/**
 * Installs the three reporting hooks into ~/.claude/settings.json.
 *
 *   node scripts/install-hooks.mjs            # add or update
 *   node scripts/install-hooks.mjs --remove   # take them out again
 *   node scripts/install-hooks.mjs --dry-run  # show the result, write nothing
 *
 * The alternative was a block of JSON in a README for three people to paste
 * into a file that already has their own settings in it. That goes wrong
 * quietly — a stray comma, a replaced `hooks` key, and something unrelated
 * stops working with no obvious connection to what they just did.
 *
 * So this MERGES. It reads what is there, removes only entries pointing at this
 * script, adds the current ones back, and leaves every other hook untouched. It
 * writes a timestamped backup first, and running it twice is the same as
 * running it once.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REMOVE = process.argv.includes('--remove')
const DRY = process.argv.includes('--dry-run')

const here = dirname(fileURLToPath(import.meta.url))
const reporter = resolve(here, 'report-session.mjs')
// Forward slashes work in JSON on every platform; a Windows path with single
// backslashes would be read as escape sequences.
const command = `node "${reporter.replace(/\\/g, '/')}"`

/** Fires after every turn as well as at the ends, so the fleet updates live. */
const EVENTS = ['SessionStart', 'Stop', 'SessionEnd']

const settingsPath = join(homedir(), '.claude', 'settings.json')

function load() {
  if (!existsSync(settingsPath)) return {}
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8'))
  } catch (err) {
    console.error(
      `\n${settingsPath} is not valid JSON (${err.message}).\n` +
        `Refusing to touch it — fix or move it first, so nothing of yours is lost.\n`
    )
    process.exit(1)
  }
}

/** Drops only OUR entries, by matching the script path. Everything else stays. */
function withoutOurs(matchers) {
  return (matchers ?? [])
    .map((m) => ({
      ...m,
      hooks: (m.hooks ?? []).filter((h) => !String(h.command ?? '').includes('report-session.mjs')),
    }))
    .filter((m) => (m.hooks ?? []).length > 0)
}

const settings = load()
settings.hooks ??= {}

for (const event of EVENTS) {
  const cleaned = withoutOurs(settings.hooks[event])
  if (REMOVE) {
    if (cleaned.length > 0) settings.hooks[event] = cleaned
    else delete settings.hooks[event]
  } else {
    settings.hooks[event] = [...cleaned, { hooks: [{ type: 'command', command }] }]
  }
}
if (Object.keys(settings.hooks).length === 0) delete settings.hooks

if (DRY) {
  console.log(`\nWould write ${settingsPath}:\n`)
  console.log(JSON.stringify(settings, null, 2))
  process.exit(0)
}

mkdirSync(dirname(settingsPath), { recursive: true })
if (existsSync(settingsPath)) {
  const backup = `${settingsPath}.bak-${Date.now()}`
  copyFileSync(settingsPath, backup)
  console.log(`backed up your settings to ${backup}`)
}
writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)

if (REMOVE) {
  console.log(`\nRemoved the reporting hooks from ${settingsPath}.\n`)
} else {
  console.log(`\nInstalled ${EVENTS.join(', ')} hooks in ${settingsPath}.`)
  console.log(`They run: ${command}\n`)
  const missing = ['AUTIVA_URL', 'AUTIVA_INGEST_TOKEN'].filter((v) => !process.env[v])
  if (missing.length > 0) {
    console.log(`Still needed in your environment: ${missing.join(', ')}`)
    console.log(`Get your token with: node scripts/issue-ingest-token.mjs <github-handle>\n`)
  } else {
    console.log(`Reporting to ${process.env.AUTIVA_URL}. Start a session and watch the fleet.\n`)
  }
}
