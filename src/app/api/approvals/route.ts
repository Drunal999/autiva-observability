import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, tenantScope } from '@/lib/ops/tenant'

/**
 * The approvals queue. Pending first and oldest-first within it, because the
 * thing that has been waiting longest is the thing most likely to be blocking
 * someone. Recently decided rows follow, so a decision is visibly recorded
 * rather than vanishing from the operator's view.
 */
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const [pending, decided] = await Promise.all([
    prisma.approval.findMany({
      where: { ...tenantScope(ctx), status: 'PENDING' },
      include: {
        module: { select: { key: true, displayName: true } },
        run: { select: { ref: true, agent: { select: { name: true } } } },
      },
      orderBy: { requestedAt: 'asc' },
    }),
    prisma.approval.findMany({
      where: { ...tenantScope(ctx), status: { in: ['APPROVED', 'REJECTED'] } },
      include: {
        module: { select: { key: true, displayName: true } },
        run: { select: { ref: true, agent: { select: { name: true } } } },
        decidedBy: { select: { name: true } },
      },
      orderBy: { decidedAt: 'desc' },
      take: 20,
    }),
  ])

  return NextResponse.json({ mode: ctx.mode, pending, decided })
}
