import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pusherServer, BOARD_CHANNEL } from '@/lib/pusher/server'
import type { CreateTaskInput } from '@/types/task'

export async function GET() {
  const tasks = await prisma.task.findMany({
    include: { assignee: { select: { id: true, name: true, avatarUrl: true } } },
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
  })

  await pusherServer.trigger(BOARD_CHANNEL, 'task-created', task)
  return NextResponse.json(task)
}
