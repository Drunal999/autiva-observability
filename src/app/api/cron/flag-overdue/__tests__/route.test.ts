import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock('@/lib/realtime/bus', () => ({
  publishBoardEvent: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { publishBoardEvent } from '@/lib/realtime/bus'
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
    expect(publishBoardEvent).toHaveBeenCalledTimes(2)
  })
})
