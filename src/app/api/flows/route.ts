import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const flows = await prisma.flow.findMany({
    where: { ...tenantScope(ctx) },
    include: {
      nodes: { orderBy: { x: 'asc' } },
      runsLog: { orderBy: { at: 'desc' }, take: 20 },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(flows)
}
