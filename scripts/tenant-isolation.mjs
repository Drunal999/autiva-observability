/**
 * THE TWO-TENANT TEST.
 *
 * ADR-002: this runs on Neon, so there is no Row Level Security. Every
 * tenant-scoped query has to carry `tenantId` by hand, and a query that
 * forgets it returns EVERY tenant's rows with no error anywhere.
 *
 * With one tenant that bug is invisible: there is nothing to leak. It becomes
 * visible on the day a second tenant exists — which is the worst possible day
 * to find out.
 *
 * So: create a second tenant, fill it with recognisable data, sign in as the
 * first tenant's user, and read every endpoint. Nothing belonging to tenant B
 * may appear. Everything is torn down at the end, including on failure.
 *
 * RUN IT whenever a tenant-scoped query is added or changed, and certainly
 * before a second tenant ever shares an instance:
 *
 *   E2E_TEST_MODE=true NEXTAUTH_URL=http://localhost:3001  *     NEXT_DIST_DIR=.next-e2e npx next dev -p 3001
 *   node scripts/tenant-isolation.mjs
 *
 * It needs E2E_TEST_MODE for a sign-in it can drive, its own NEXTAUTH_URL
 * (that variable pins the OAuth callback origin, so a second port bounces back
 * to the first), and its own NEXT_DIST_DIR (a build or second server sharing
 * .next leaves the primary dev server serving 404s for every asset).
 *
 * This cannot live in vitest: it needs a real server, a real session and the
 * real database. Mocked Prisma would assert the mock, which is precisely the
 * thing that cannot prove tenant isolation.
 */
import { chromium } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const MARK = 'ZZLEAK'
let tenantB

async function seedTenantB() {
  tenantB = await prisma.tenant.create({
    data: { slug: 'zzleak-tenant', name: `${MARK} Rival Corp`, isInternal: false },
  })
  const mod = await prisma.module.create({
    data: { tenantId: tenantB.id, key: `${MARK}-engine`, displayName: `${MARK} Secret Engine` },
  })
  const agent = await prisma.agent.create({
    data: { tenantId: tenantB.id, moduleId: mod.id, name: `${MARK}-agent`, model: 'claude-opus-5' },
  })
  const run = await prisma.run.create({
    data: {
      tenantId: tenantB.id, agentId: agent.id, ref: `${MARK}-run`,
      status: 'SUCCESS', trigger: 'MANUAL', summary: `${MARK} confidential run`,
      startedAt: new Date(), endedAt: new Date(), tokens: 10, costInr: 1,
    },
  })
  const approval = await prisma.approval.create({
    data: {
      tenantId: tenantB.id, moduleId: mod.id, status: 'PENDING',
      action: `${MARK} pay rival vendor`, detail: `${MARK} 9,99,999 INR`, requestedAt: new Date(),
    },
  })
  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: tenantB.id, kind: 'HUMAN', title: `${MARK} board meeting`,
      startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000),
    },
  })
  const comment = await prisma.comment.create({
    data: {
      tenantId: tenantB.id, subjectType: 'AGENT', subjectId: agent.id,
      authorKind: 'HUMAN', authorName: `${MARK} rival`, body: `${MARK} confidential note`,
    },
  })
  await prisma.metricBucket.create({
    data: {
      tenantId: tenantB.id, moduleId: mod.id, at: new Date(),
      runs: 999, failed: 99, p50Ms: 1, p95Ms: 2, p99Ms: 3,
      tokens: 999, costInr: 999, successRate: 1,
    },
  })
  return { mod, agent, run, approval, event, comment }
}

async function cleanup() {
  if (!tenantB) return
  // Every child cascades from the tenant.
  await prisma.tenant.delete({ where: { id: tenantB.id } }).catch(async () => {
    await prisma.comment.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.metricBucket.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.approval.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.run.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.agent.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.calendarEvent.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.module.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.tenant.delete({ where: { id: tenantB.id } })
  })
}

const b = await chromium.launch()
const p = await b.newPage()
let leaks = 0

try {
  const seeded = await seedTenantB()
  console.log(`RESULT seeded tenant B (${tenantB.slug}) with agent, run, approval, event, comment, metrics`)

  for (let a = 1; a <= 3; a++) {
    await p.goto('http://localhost:3001/api/auth/signin?callbackUrl=%2Fapi%2Fauth%2Fsession', { waitUntil: 'load', timeout: 120000 })
    await p.getByLabel('githubId').fill('e2e-test-user')
    await Promise.all([
      p.waitForURL((u) => !u.pathname.includes('/api/auth/signin'), { timeout: 120000 }).catch(() => {}),
      p.getByRole('button', { name: /sign in with e2e test login/i }).click(),
    ])
    if (!p.url().includes('/api/auth/signin')) break
  }
  const sess = await (await p.request.get('http://localhost:3001/api/auth/session')).json()
  console.log('RESULT signed in as tenant A user:', sess?.user?.name ?? 'NOBODY')

  const from = new Date(Date.now() - 86400000).toISOString()
  const to = new Date(Date.now() + 86400000).toISOString()
  const endpoints = [
    '/api/agents',
    '/api/approvals',
    `/api/calendar?from=${from}&to=${to}`,
    '/api/metrics',
    '/api/runs',
    '/api/flows',
    '/api/notifications',
    '/api/comments/counts?subjectType=AGENT',
    `/api/comments?subjectType=AGENT&subjectId=${seeded.agent.id}`,
    `/api/runs/${seeded.run.ref}`,
  ]

  for (const url of endpoints) {
    const res = await p.request.get('http://localhost:3001' + url)
    const text = await res.text()
    const hitMark = text.includes(MARK)
    const hitId = [seeded.agent.id, seeded.run.id, seeded.approval.id, seeded.event.id, seeded.comment.id, seeded.mod.id]
      .some((id) => text.includes(id))
    const leaked = hitMark || hitId
    if (leaked) leaks++
    console.log(
      `RESULT ${leaked ? 'LEAK  ' : 'clean '} ${String(res.status()).padEnd(3)} ${url}`
    )
  }

  console.log(`RESULT ==== ${leaks === 0 ? 'NO LEAKS' : leaks + ' ENDPOINT(S) LEAKED'} ====`)
} finally {
  await cleanup()
  const left = await prisma.tenant.count({ where: { slug: 'zzleak-tenant' } })
  console.log('RESULT tenant B removed:', left === 0)
  await prisma.$disconnect()
  await b.close()
}
