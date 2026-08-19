import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock('@/lib/pusher/server', () => ({
  pusherServer: { trigger: vi.fn() },
  BOARD_CHANNEL: 'board',
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher/server'
import { GET, POST } from '../route'

describe('/api/tasks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET returns all tasks', async () => {
    ;(prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1' }])
    const res = await GET()
    const body = await res.json()
    expect(body).toEqual([{ id: 't1' }])
  })

  it('POST creates a task and broadcasts task-created', async () => {
    const created = { id: 't2', title: 'New task' }
    ;(prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue(created)
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'New task' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body).toEqual(created)
    expect(pusherServer.trigger).toHaveBeenCalledWith('board', 'task-created', created)
  })

  it('POST rejects a missing title with 400', async () => {
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
