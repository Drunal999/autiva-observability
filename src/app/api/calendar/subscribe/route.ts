import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantContext } from '@/lib/ops/tenant'
import { icsToken } from '@/lib/ops/ics'

/** Returns this user's personal feed URL. Session-gated; the feed itself is not. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !ctx || !userId) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const origin = new URL(req.url).origin
  const token = icsToken(ctx.tenantId, userId)
  const feedUrl = `${origin}/api/calendar/feed?t=${ctx.tenantId}&u=${userId}&k=${token}`

  return NextResponse.json({
    feedUrl,
    // Said plainly, because people paste these into group chats.
    warning:
      'Treat this link like a password. Anyone who has it can read this workspace calendar, and calendar apps store it in plain text.',
  })
}
