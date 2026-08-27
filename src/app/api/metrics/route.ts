import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

// Fleet's telemetry row. Returns the last 24 hourly buckets oldest-first so
// the charts can index straight into the array without re-sorting.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const buckets = await prisma.metricBucket.findMany({
    where: { ...tenantScope(ctx) },
    orderBy: { at: 'desc' },
    take: 24,
  })
  return NextResponse.json(buckets.reverse())
}
