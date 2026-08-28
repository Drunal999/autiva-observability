import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publishBoardEvent } from '@/lib/realtime/bus'
import type { CreateTaskInput } from '@/types/task'
import { TASK_INCLUDE } from '@/lib/ops/taskShape'



export async function GET() {
  const tasks = await prisma.task.findMany({
    include: TASK_INCLUDE,
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(tasks)
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreateTaskInput
  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      priority: body.priority ?? 'MED',
    },
    include: TASK_INCLUDE,
  })

  publishBoardEvent({ type: 'task-created', payload: task })
  return NextResponse.json(task)
}
