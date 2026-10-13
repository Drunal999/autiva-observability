import type { Middleware } from 'swr'

/**
 * Sends the GETs that SWR starts in the same moment as ONE request to
 * /api/batch. Components keep their own keys, fetchers and refresh intervals;
 * only the trip to the server is shared. Must match the HANDLERS in
 * src/app/api/batch/route.ts (a test checks it).
 */
export const BATCHABLE = ['/api/city', '/api/approvals', '/api/calendar', '/api/agents', '/api/notifications', '/api/presence', '/api/user/prefs', '/api/team']

type Waiter = { path: string; resolve: (v: unknown) => void; reject: (e: Error) => void }
let queue: Waiter[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  const batch = queue
  queue = []
  timer = null
  try {
    const res = await fetch('/api/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: batch.map((w) => w.path) }) })
    if (!res.ok) throw new Error(String(res.status))
    const { results } = (await res.json()) as { results: { status: number; body: unknown }[] }
    batch.forEach((w, i) => {
      const r = results[i]
      // Same contract as the components' own fetchers: a non-2xx answer throws.
      if (r && r.status >= 200 && r.status < 300) w.resolve(r.body)
      else w.reject(new Error(String(r?.status ?? 'missing')))
    })
  } catch (err) {
    batch.forEach((w) => w.reject(err as Error))
  }
}

export function batchedGet(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    queue.push({ path, resolve, reject })
    // 10 ms gathers every hook that mounts in the same render.
    timer ??= setTimeout(flush, 10)
  })
}

const canBatch = (key: unknown): key is string => typeof key === 'string' && BATCHABLE.includes(key.split('?')[0])

export const swrBatch: Middleware = (useSWRNext) => (key, fetcher, config) =>
  useSWRNext(key, canBatch(key) && fetcher ? ((() => batchedGet(key)) as typeof fetcher) : fetcher, config)
