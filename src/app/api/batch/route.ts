import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/ops/tenant'
import { GET as city } from '../city/route'
import { GET as approvals } from '../approvals/route'
import { GET as calendar } from '../calendar/route'
import { GET as agents } from '../agents/route'
import { GET as notifications } from '../notifications/route'
import { GET as presence } from '../presence/route'
import { GET as prefs } from '../user/prefs/route'
import { GET as team } from '../team/route'

/**
 * Several GETs in one round trip.
 *
 * Opening Home fired ten API calls at once. From India each one crossed to the
 * US and back (~400 ms) and each was its own function invocation, so the screen
 * filled in piece by piece. The client now sends the reads it makes in the same
 * moment here, and this route runs the very same handlers in-process.
 *
 * Only the routes below can be batched: each does its own auth, reads nothing
 * but the session cookie and the query string, and writes nothing. stack-status
 * is left out on purpose: it waits up to 2 s on the owner's machine, which would
 * hold every other answer back.
 */
const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  '/api/city': () => city(),
  '/api/approvals': () => approvals(),
  '/api/calendar': (req) => calendar(req),
  '/api/agents': () => agents(),
  '/api/notifications': () => notifications(),
  '/api/presence': () => presence(),
  '/api/user/prefs': () => prefs(),
  '/api/team': () => team(),
}
const MAX = 20

export async function POST(req: Request) {
  if (!(await getTenantContext())) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { paths?: unknown } | null
  const paths = body?.paths
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX || !paths.every((p) => typeof p === 'string')) {
    return NextResponse.json({ error: `paths must be 1-${MAX} strings` }, { status: 400 })
  }
  const origin = new URL(req.url).origin
  const results = await Promise.all(
    (paths as string[]).map(async (path) => {
      const url = new URL(path, origin)
      const handler = url.origin === origin ? HANDLERS[url.pathname] : undefined
      if (!handler) return { status: 400, body: { error: 'not batchable' } }
      try {
        const res = await handler(new Request(url, { headers: req.headers }))
        return { status: res.status, body: await res.json().catch(() => null) }
      } catch (err) {
        // One failing read must not sink the others, but it must not look like success either.
        console.error('batch', url.pathname, err)
        return { status: 500, body: { error: 'failed' } }
      }
    }),
  )
  return NextResponse.json({ results })
}
