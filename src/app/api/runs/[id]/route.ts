import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

// Trace and Terminal both hang off a single run, so one round trip carries the
// span tree, the log stream and the workspace file list together. `id` accepts
// either the cuid or the human ref ("r-8f2c") the UI shows in its chrome.
//
// The id is caller-supplied, which makes this the one route where a missing
// tenant scope is a direct object reference into another tenant's data. The
// scope sits OUTSIDE the OR so it is ANDed with it, never an alternative to it.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const run = await prisma.run.findFirst({
    where: {
      ...tenantScope(ctx),
      OR: [{ id: params.id }, { ref: params.id }],
    },
    include: {
      agent: { select: { id: true, name: true, model: true } },
      spans: { orderBy: { startMs: 'asc' } },
      logLines: { orderBy: { ts: 'asc' } },
      files: { orderBy: { path: 'asc' } },
    },
  })

  // A run in another tenant is "not found", not "forbidden" — a 403 would
  // confirm the ref exists.
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 })
  }
  return NextResponse.json(run)
}
