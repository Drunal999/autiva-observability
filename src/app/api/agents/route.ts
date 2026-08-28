import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { statusOrder } from '@/lib/ops/status'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

// Fleet sorts failed → running → awaiting_approval → success → idle so anything
// on fire reaches the operator first. Postgres has no enum ordering that
// matches, so the sort is applied here — but the ordering itself lives in the
// shared status module, not duplicated in this file.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const agents = await prisma.agent.findMany({
    where: { ...tenantScope(ctx) },
    include: { module: { select: { key: true, displayName: true, targetMs: true } } },
    orderBy: { name: 'asc' },
  })
  agents.sort((a, b) => statusOrder(a.status) - statusOrder(b.status))

  // Mode is decided server-side from the tenant, never sent up by the client.
  return NextResponse.json({ mode: ctx.mode, agents })
}
