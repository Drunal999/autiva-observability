#!/usr/bin/env node
/**
 * Issues one teammate's ingest token.
 *
 *   node scripts/issue-ingest-token.mjs <github-handle>
 *
 * The token is DERIVED, not stored: an HMAC of the tenant and the user id under
 * INGEST_SECRET. There is no token table to manage, and rotating INGEST_SECRET
 * revokes everyone's at once.
 *
 * Treat it as a password. Anyone holding it can post runs as that person — the
 * same trust model as the rest of this deployment (ADR-002), which is fine for
 * a small team and would not be for strangers.
 */
import { PrismaClient } from '@prisma/client'
import { createHmac } from 'node:crypto'

const handle = process.argv[2]?.toLowerCase()
if (!handle) {
  console.error('usage: node scripts/issue-ingest-token.mjs <github-handle>')
  process.exit(1)
}

const secret = process.env.INGEST_SECRET
if (!secret || secret.length < 32) {
  console.error(
    'INGEST_SECRET is not set (or is under 32 characters).\n' +
      'Generate one and add it to .env:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
  )
  process.exit(1)
}

const prisma = new PrismaClient()
try {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'autiva' }, select: { id: true } })
  const user = await prisma.user.findFirst({ where: { handle }, select: { id: true, name: true } })
  if (!tenant) throw new Error('no tenant configured')
  if (!user) throw new Error(`no user with handle "${handle}" — have they signed in yet?`)

  const token = createHmac('sha256', secret)
    .update(`ingest:${tenant.id}:${user.id}`)
    .digest('base64url')
    .slice(0, 32)

  console.log(`\nToken for ${user.name} (@${handle}):\n`)
  console.log(`  AUTIVA_URL=http://localhost:3000`)
  console.log(`  AUTIVA_INGEST_TOKEN=${token}\n`)
  console.log('Set those two in their environment, then add the Stop hook from')
  console.log('scripts/report-session.mjs to their ~/.claude/settings.json.\n')
} catch (err) {
  console.error('failed:', err.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
