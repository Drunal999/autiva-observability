import { afterEach, expect, it, vi } from 'vitest'
import { batchedGet } from '../swrBatch'

afterEach(() => vi.unstubAllGlobals())

it('sends reads started together as one request and splits the answers', async () => {
  const fetch = vi.fn(async () => Response.json({ results: [{ status: 200, body: { a: 1 } }, { status: 401, body: { error: 'x' } }] }))
  vi.stubGlobal('fetch', fetch)
  const [a, b] = await Promise.allSettled([batchedGet('/api/city'), batchedGet('/api/team')])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ paths: ['/api/city', '/api/team'] })
  expect(a).toEqual({ status: 'fulfilled', value: { a: 1 } })
  expect(b.status).toBe('rejected') // a non-2xx item throws, like the components' own fetchers
})

it('fails every waiter loudly when the batch itself fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
  const r = await Promise.allSettled([batchedGet('/api/city'), batchedGet('/api/agents')])
  expect(r.map((x) => x.status)).toEqual(['rejected', 'rejected'])
})
