import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ingestCaller } from '@/lib/ops/ingestCaller'

/**
 * Approved plans an engine may now carry out.
 *
 * Engines run in n8n on a laptop that the hosted dashboard cannot call, so the
 * engine asks here on a schedule instead of being told. It gets only what a
 * human APPROVED, for its own module, not yet applied, and decided in the last
 * three days: a week-old "yes" was given for numbers that no longer hold.
 */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const caller = await ingestCaller(req, 'ingest.approvals')
  if (caller instanceof NextResponse) return caller
  const moduleKey = new URL(req.url).searchParams.get('module')?.trim().toLowerCase()
  if (!moduleKey) return NextResponse.json({ error: 'module is required' }, { status: 400 })

  const rows = await prisma.approval.findMany({
    where: {
      tenantId: caller.tenantId,
      status: 'APPROVED',
      appliedAt: null,
      decidedAt: { gte: new Date(Date.now() - MAX_AGE_MS) },
      module: { key: moduleKey },
    },
    select: { id: true, action: true, decidedAt: true, run: { select: { ref: true } }, decidedBy: { select: { name: true } } },
    orderBy: { decidedAt: 'asc' },
    take: 20,
  })
  return NextResponse.json({
    approvals: rows.map((a) => ({ id: a.id, action: a.action, decidedAt: a.decidedAt, decidedBy: a.decidedBy?.name ?? null, runRef: a.run?.ref ?? null })),
  })
}
