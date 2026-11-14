import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/ops/tenant'

// Proxy to the Instagram/leads worker (ig.autivex.in). The key stays on the server; the browser only
// talks to this route with its session. GET list|health, POST move (Approve/Skip/Done, same rules as Telegram).
export const dynamic = 'force-dynamic'
const WORKER = process.env.LEADS_URL ?? 'https://ig.autivex.in'
const GETS: Record<string, string> = { list: '/leads.json', health: '/leads/health.json' }

const missing = () => NextResponse.json({ error: 'LEADS_KEY is not set on the server, so the pipeline cannot load.' }, { status: 503 })
const no = (status: number, error: string) => NextResponse.json({ error }, { status })

async function relay(res: Response) {
  const body = await res.json().catch(() => ({ error: `Worker answered ${res.status}` }))
  return NextResponse.json(body, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  if (!(await getTenantContext())) return no(401, 'unauthorised')
  const key = process.env.LEADS_KEY
  if (!key) return missing()
  const path = GETS[params.path.join('/')]
  if (!path) return no(404, 'Not found')
  try {
    return await relay(await fetch(`${WORKER}${path}?k=${encodeURIComponent(key)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) }))
  } catch {
    return no(502, 'Leads worker unreachable')
  }
}

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  if (!(await getTenantContext())) return no(401, 'unauthorised')
  const url = new URL(req.url)
  if (req.headers.get('origin') !== `${url.protocol}//${req.headers.get('host') || url.host}`) return no(403, 'Invalid origin')
  if (params.path.join('/') !== 'move') return no(404, 'Not found')
  const key = process.env.LEADS_KEY
  if (!key) return missing()
  const { id, act } = await req.json().catch(() => ({}))
  if (typeof id !== 'string' || !['a', 's', 'd'].includes(act)) return no(400, 'id and act (a|s|d) required')
  try {
    return await relay(await fetch(`${WORKER}/leads/move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ id, act }), cache: 'no-store', signal: AbortSignal.timeout(15000),
    }))
  } catch {
    return no(502, 'Leads worker unreachable')
  }
}
