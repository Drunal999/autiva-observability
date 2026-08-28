import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publishBoardEvent } from '@/lib/realtime/bus'
import { TASK_INCLUDE } from '@/lib/ops/taskShape'
import type { UpdateTaskInput } from '@/types/task'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json()) as UpdateTaskInput
  const data: Record<string, unknown> = { ...body }
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  }
  if (body.status !== undefined) {
    data.lastStatusChangeAt = new Date()
    if (body.status !== 'DONE') {
      // leaving DONE or changing between non-DONE states clears any stale overdue flag
      data.overdueFlaggedAt = null
    }
  }

  // Same include as GET: a realtime payload must not be a poorer version
  // of the row the client already has.
  const task = await prisma.task.update({
    where: { id: params.id },
    data,
    include: TASK_INCLUDE,
  })
  publishBoardEvent({ type: 'task-updated', payload: task })
  return NextResponse.json(task)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.task.delete({ where: { id: params.id } })
  publishBoardEvent({ type: 'task-deleted', payload: { id: params.id } })
  return NextResponse.json({ id: params.id })
}
