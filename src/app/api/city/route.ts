import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'
import { districtFor } from '@/lib/ops/districts'

/**
 * The city's opening state: every module this tenant can see, plus whatever
 * each one has done recently.
 *
 * The city is a renderer over activity, not a second source of truth — it adds
 * no table and invents no row. A building is lit because a Run exists, and dark
 * because one does not. Live updates then arrive over the existing SSE bus
 * (`/api/events`, RUNS and FLEET), so this route is only the first paint.
 */
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const modules = await prisma.module.findMany({
    where: { ...tenantScope(ctx) },
    select: {
      id: true,
      key: true,
      displayName: true,
      targetMs: true,
      agents: { select: { id: true, name: true, status: true } },
    },
    orderBy: { key: 'asc' },
  })

  // Last 24h of runs, so a building can open already lit rather than waiting
  // for the next event to arrive. Capped: the city needs a pulse per module,
  // not the full history, and Trace is where the detail belongs.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const runs = await prisma.run.findMany({
    where: { ...tenantScope(ctx), startedAt: { gte: since } },
    select: {
      id: true,
      ref: true,
      status: true,
      summary: true,
      project: true,
      startedAt: true,
      endedAt: true,
      agent: { select: { id: true, name: true, moduleId: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
  })

  const byModule = new Map<string, typeof runs>()
  for (const run of runs) {
    const id = run.agent?.moduleId
    if (!id) continue
    const list = byModule.get(id) ?? []
    // A busy module should not push every other building off the page.
    if (list.length < 12) list.push(run)
    byModule.set(id, list)
  }

  return NextResponse.json({
    districts: modules.map((m) => ({
      id: m.id,
      key: m.key,
      displayName: m.displayName,
      targetMs: m.targetMs,
      district: districtFor(m.key),
      agents: m.agents,
      runs: byModule.get(m.id) ?? [],
    })),
    /** Mirrors the shell's own sample-data warning: never claim seeded rows are real. */
    sample: process.env.NEXT_PUBLIC_SAMPLE_DATA !== 'false',
  })
}
