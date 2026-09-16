#!/usr/bin/env node
/**
 * Local-only fixture for the Agentic City dashboard.
 *
 * It refuses every database except the existing local Docker database named
 * `autiva_obs`; this must never be pointed at a production connection.
 */
import { spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATABASE = 'autiva_obs'
const CONTAINER = 'supabase_db_cafeccino'

export const LOCAL_DEMO_USER = Object.freeze({
  id: 'local_aditya',
  githubId: 'local-dev-aditya',
  handle: 'aditya',
  email: 'aditya@local.demo',
  name: 'Aditya (local demo)',
})

export function assertLocalDemoDatabase(value) {
  if (!value) throw new Error('DATABASE_URL is required for the local city demo.')
  let url
  try { url = new URL(value) } catch { throw new Error('DATABASE_URL is not a valid PostgreSQL URL.') }
  const database = decodeURIComponent(url.pathname).replace(/^\//, '')
  const localHost = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !localHost || url.port !== '54322' || database !== DATABASE || url.searchParams.size > 1 || (url.searchParams.size === 1 && url.searchParams.get('schema') !== 'public')) {
    throw new Error(
      'LOCAL-ONLY fixture refused: DATABASE_URL must target localhost:54322/autiva_obs. ' +
      'It will never run against another database.',
    )
  }
  return { url, database }
}

function loadDotEnv() {
  const file = resolve(root, '.env')
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]] !== undefined) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[match[1]] = value
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

function dockerPsql(sql) {
  return run('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', sql])
}

export function ingestToken(secret, tenantId, userId) {
  if (!secret || secret.length < 32) throw new Error('INGEST_SECRET is missing or shorter than 32 characters.')
  return createHmac('sha256', secret).update(`ingest:${tenantId}:${userId}`).digest('base64url').slice(0, 32)
}

async function ensureDatabase() {
  const exists = dockerPsql(`SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'`)
  if (exists === '1') {
    console.log(`Database ${DATABASE} already exists.`)
    return
  }
  dockerPsql(`CREATE DATABASE ${DATABASE}`)
  console.log(`Created local database ${DATABASE}.`)
}

async function upsertDemoUser(databaseUrl) {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const user = await prisma.user.upsert({
      where: { githubId: LOCAL_DEMO_USER.githubId },
      update: LOCAL_DEMO_USER,
      create: LOCAL_DEMO_USER,
    })
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'autiva' }, select: { id: true } })
    if (!tenant) throw new Error('Seed did not create the autiva tenant.')
    return { user, tenant }
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  loadDotEnv()
  const { url } = assertLocalDemoDatabase(process.env.DATABASE_URL)
  if (process.env.NODE_ENV === 'production') throw new Error('LOCAL-ONLY fixture refuses production mode.')
  ingestToken(process.env.INGEST_SECRET, 'preflight', 'preflight')
  // Prisma and child processes must use the same validated connection.
  process.env.DIRECT_URL = url.toString()
  console.log('\nLOCAL-ONLY Agentic City fixture — never use this against a real database.\n')
  await ensureDatabase()
  run('npx', ['prisma', 'db', 'push'], { env: process.env })
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
  try {
    // The existing seed deletes operations tables. Bootstrap only an empty
    // database; an existing tenant means its activity must be preserved.
    if (await db.tenant.count() === 0) {
      run('node', ['prisma/seed-agent-ops.mjs'], { env: process.env })
      console.log('Seeded the empty local fixture.')
    } else {
      console.log('Existing fixture preserved; destructive seed skipped.')
    }
  } finally { await db.$disconnect() }
  const { user, tenant } = await upsertDemoUser(url.toString())
  const token = ingestToken(process.env.INGEST_SECRET, tenant.id, user.id)
  console.log(`Upserted fake local user ${user.id} (@${LOCAL_DEMO_USER.handle}, ${LOCAL_DEMO_USER.email}).`)
  console.log('\nUse this LOCAL-ONLY ingest token for a local run:')
  console.log(`AUTIVA_CITY_INGEST_TOKEN=${token}`)
  console.log('Endpoint: http://127.0.0.1:3111/api/ingest/runs')
  console.log('\nExisting runs are preserved. Sign in at http://127.0.0.1:3111/api/auth/signin')
  console.log('Choose E2E Test Login; githubId: local-dev-aditya. City: http://127.0.0.1:3111/city')
  console.log('If the dev server is stopped: E2E_TEST_MODE=true NEXTAUTH_URL=http://127.0.0.1:3111 npx next dev -H 127.0.0.1 -p 3111')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`local city demo failed: ${error.message}`); process.exitCode = 1 })
}
