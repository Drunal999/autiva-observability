import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
import { POST } from '../[...path]/route'
const call = (action: string, body = {}, origin = 'http://localhost:3111') => POST(new Request(`http://localhost:3111/api/job-hunt/${action}`, { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) }), { params: { path: [action] } })
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'user-a' } }); vi.stubGlobal('fetch', mocks.fetch); vi.stubEnv('JOB_HUNT_URL', 'http://localhost:8096'); vi.stubEnv('JOB_HUNT_TOKEN', 'test-token') })
it('rejects signed-out and foreign-origin requests without contacting worker', async () => {
  mocks.session.mockResolvedValue(null)
  expect((await call('state')).status).toBe(401)
  mocks.session.mockResolvedValue({ user: { id: 'user-a' } })
  expect((await call('state', {}, 'https://evil.example')).status).toBe(403)
  expect(mocks.fetch).not.toHaveBeenCalled()
})
it('uses session identity, ignoring a browser-selected profile or user', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ name: 'A' }), { status: 200 }))
  expect((await call('state', { userId: 'user-b', profile: 'runal' })).status).toBe(200)
  const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body)
  expect(sent.userId).toBe('user-a'); expect(sent.profile).toBeUndefined()
})
it('accepts the actual host when local forwarding changes the internal request URL', async () => {
  mocks.fetch.mockResolvedValue(new Response('{}'))
  const req = new Request('http://localhost:3111/api/job-hunt/state', { method: 'POST', headers: { Host: '127.0.0.1:3111', Origin: 'http://127.0.0.1:3111' }, body: '{}' })
  expect((await POST(req, { params: { path: ['state'] } })).status).toBe(200)
})
it('reports unavailable configuration and failed worker explicitly', async () => {
  vi.stubEnv('JOB_HUNT_TOKEN', '')
  expect((await call('state')).status).toBe(503)
  vi.stubEnv('JOB_HUNT_TOKEN', 'test-token'); mocks.fetch.mockRejectedValue(new Error('offline'))
  expect((await call('state')).status).toBe(503)
})
it('rejects unsupported downloads returned by worker', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ filename: '../private.json', content: '' })))
  expect((await call('download')).status).toBe(503)
})
it('prepares using authenticated identity and forwards only explicit eligibility', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ state: 'blocked', submitted: false })))
  const response = await call('prepare', { key: 'abc', userId: 'user-b', nightShift: true, url: 'https://evil.example' })
  expect(response.status).toBe(200)
  const body = JSON.parse(mocks.fetch.mock.calls[0][1].body)
  expect(body.userId).toBe('user-a'); expect(body.nightShift).toBe(true); expect(body.url).toBeUndefined()
  expect((await response.json()).submitted).toBe(false)
})
