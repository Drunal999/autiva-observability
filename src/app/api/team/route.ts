import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/lib/ops/tenant'
import { isAllowedLogin } from '@/lib/ops/allowlist'

/**
 * The team, online or not: everyone the allowlist lets in who has a user row.
 * Presence (/api/presence) says who is active right now; this says who exists,
 * so a teammate who is offline still shows up as offline instead of vanishing.
 *
 * Scoped by the allowlist because `User` has no tenant yet (see tenant.ts):
 * the allowlist is the only real boundary of "the team" today.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  if (!session?.user || !ctx) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const me = (session.user as { id?: string }).id
  const users = await prisma.user.findMany({ select: { id: true, name: true, handle: true, avatarUrl: true } })
  const members = users
    .filter((u) => isAllowedLogin(u.handle))
    .map((u) => ({ id: u.id, name: u.name ?? u.handle ?? 'Teammate', handle: u.handle, avatarUrl: u.avatarUrl, me: u.id === me }))
    .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name))
  return NextResponse.json({ members })
}
