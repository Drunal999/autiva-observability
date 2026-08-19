import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock('@/lib/pusher/server', () => ({
  pusherServer: { trigger: vi.fn() },
  BOARD_CHANNEL: 'board',
}))

import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher/server'
import { GET } from '../route'

describe('/api/cron/flag-overdue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('rejects requests without the correct bearer token', async () => {
    const req = new Request('http://localhost/api/cron/flag-overdue')
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('flags newly-overdue tasks and broadcasts updates', async () => {
    ;(prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1' }, { id: 't2' }])
    ;(prisma.task.update as ReturnType<typeof vi.fn>).mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, overdueFlaggedAt: new Date() })
    )

    const req = new Request('http://localhost/api/cron/flag-overdue', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledTimes(2)
    expect(pusherServer.trigger).toHaveBeenCalledTimes(2)
  })
})
