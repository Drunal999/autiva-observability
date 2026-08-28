import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publishBoardEvent } from '@/lib/realtime/bus'
import { bearerMatches } from '@/lib/ops/bearerAuth'

export async function GET(req: Request) {
  // Was a plain !== against `Bearer ${process.env.CRON_SECRET}`. With the
  // variable unset that compares to the literal "Bearer undefined", which
  // anyone can send. An unset secret now denies, and the compare is
  // constant-time so this endpoint is not an oracle for the token.
  if (!bearerMatches(req.headers.get('Authorization'), 'CRON_SECRET')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const newlyOverdue = await prisma.task.findMany({
    where: { dueDate: { lt: new Date() }, status: { not: 'DONE' }, overdueFlaggedAt: null },
  })

  for (const task of newlyOverdue) {
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { overdueFlaggedAt: new Date() },
    })
    publishBoardEvent({ type: 'task-updated', payload: updated })
  }

  return NextResponse.json({ flagged: newlyOverdue.length })
}
