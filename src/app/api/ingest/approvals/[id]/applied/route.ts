import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ingestCaller } from '@/lib/ops/ingestCaller'

const MAX_NOTE = 500

/**
 * The engine reports what happened when it carried out an approved plan.
 *
 * Recorded once, success or not: a plan that half-applied must not be picked
 * up again and applied twice. `ok: false` with a note is how a failure shows
 * on the approval instead of disappearing.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const caller = await ingestCaller(req, 'ingest.approvals.applied')
  if (caller instanceof NextResponse) return caller

  const body = (await req.json().catch(() => null)) as { ok?: unknown; note?: unknown } | null
  if (typeof body?.ok !== 'boolean' || typeof body.note !== 'string' || !body.note.trim()) {
    return NextResponse.json({ error: 'body must be { ok: boolean, note: string }' }, { status: 400 })
  }

  // Conditional update: only an approved, not-yet-applied row in this tenant moves.
  const { count } = await prisma.approval.updateMany({
    where: { id: params.id, tenantId: caller.tenantId, status: 'APPROVED', appliedAt: null },
    data: { appliedAt: new Date(), applyOk: body.ok, applyNote: body.note.trim().slice(0, MAX_NOTE) },
  })
  if (count === 0) return NextResponse.json({ error: 'not an approved, unapplied approval' }, { status: 409 })
  return NextResponse.json({ id: params.id, applied: true, ok: body.ok })
}
