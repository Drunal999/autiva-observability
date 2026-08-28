import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

/**
 * Fleet telemetry.
 *
 * `?engine=<module key>` returns that engine's series; omitting it returns the
 * fleet-wide rollup. Each engine carries its own `targetMs`, because a single
 * global latency threshold is meaningless across engines: 3.5s is fine for a
 * weekly digest and unacceptable for an inbound reply someone is waiting on.
 */
export async function GET(req: Request) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const engineKey = new URL(req.url).searchParams.get('engine')

  const engines = await prisma.module.findMany({
    where: { ...tenantScope(ctx) },
    select: { key: true, displayName: true, targetMs: true },
    orderBy: { targetMs: 'asc' },
  })

  const engine = engineKey ? engines.find((e) => e.key === engineKey) ?? null : null

  // An unknown engine key falls back to the fleet rollup rather than erroring:
  // a stale bookmark should show something true, not a broken panel.
  const moduleId = engine
    ? (
        await prisma.module.findFirst({
          where: { ...tenantScope(ctx), key: engine.key },
          select: { id: true },
        })
      )?.id ?? null
    : null

  const buckets = await prisma.metricBucket.findMany({
    where: { ...tenantScope(ctx), moduleId },
    orderBy: { at: 'desc' },
    take: 24,
  })

  return NextResponse.json({
    engines,
    // Null when showing the fleet rollup — the UI then has no single target to
    // judge against and says so rather than inventing one.
    engine,
    buckets: buckets.reverse(),
  })
}
