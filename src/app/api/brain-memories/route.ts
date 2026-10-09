import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/ops/tenant'

/**
 * The brain's newest dated entries (AUTIVA brain/server.mjs GET /api/memories),
 * read server-side because the brain only answers its own origin. It listens on
 * loopback, so anywhere else this says `reachable: false` rather than inventing
 * a list.
 */
const BRAIN = process.env.BRAIN_URL ?? 'http://127.0.0.1:8095'

export async function GET() {
  if (!(await getTenantContext())) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  try {
    const res = await fetch(`${BRAIN}/api/memories`, { signal: AbortSignal.timeout(2000), cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ reachable: false, memories: [] })
    const body = (await res.json()) as { memories?: { date: string; title: string; kind: string; source: string }[] }
    const memories = (body.memories ?? []).slice(0, 8).map(({ date, title, kind, source }) => ({ date, title, kind, source }))
    return NextResponse.json({ reachable: true, memories })
  } catch {
    return NextResponse.json({ reachable: false, memories: [] })
  }
}
