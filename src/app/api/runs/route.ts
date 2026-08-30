import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const runs = await prisma.run.findMany({
    where: { ...tenantScope(ctx) },
    include: { agent: { select: { id: true, name: true, model: true } } },
    orderBy: { startedAt: 'desc' },
  })
  return NextResponse.json(runs)
}

