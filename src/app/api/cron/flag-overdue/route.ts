import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pusherServer, BOARD_CHANNEL } from '@/lib/pusher/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    await pusherServer.trigger(BOARD_CHANNEL, 'task-updated', updated)
  }

  return NextResponse.json({ flagged: newlyOverdue.length })
}
