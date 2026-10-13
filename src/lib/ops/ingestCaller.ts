import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { INTERNAL_TENANT_SLUG } from './tenant'
import { rateLimit } from './rateLimit'
import { resolveIngestUser } from './ingestToken'

/**
 * Who is calling a token-authenticated /api/ingest route: an engine on someone's
 * laptop, holding that person's ingest token. Same rules as /api/ingest/runs —
 * bearer token, rate limit, tenant from the server's own configuration, never
 * from the request. Returns the caller or the response to send back.
 */
export async function ingestCaller(req: Request, route: string): Promise<{ tenantId: string; userId: string } | NextResponse> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
  if (!token) return NextResponse.json({ error: 'a bearer ingest token is required' }, { status: 401 })
  const limited = rateLimit(`${route}:${token.slice(0, 8)}`, 60, 60_000)
  if (!limited.ok) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } })
  const tenant = await prisma.tenant.findUnique({ where: { slug: INTERNAL_TENANT_SLUG }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: 'no tenant configured' }, { status: 500 })
  const users = await prisma.user.findMany({ select: { id: true } })
  const userId = resolveIngestUser(tenant.id, users, token)
  if (!userId) return NextResponse.json({ error: 'unrecognised ingest token' }, { status: 401 })
  return { tenantId: tenant.id, userId }
}
