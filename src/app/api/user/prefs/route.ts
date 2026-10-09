import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { clean } from '@/lib/ops/prefsShape'

/** The signed-in person's workspace preferences. Only clean() output is ever stored or returned. */
async function me() {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET() {
  const id = await me()
  if (!id) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id }, select: { prefs: true } })
  return NextResponse.json({ prefs: user?.prefs ? clean(user.prefs) : null })
}

export async function PUT(req: Request) {
  const id = await me()
  if (!id) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Send the settings as a JSON object.' }, { status: 400 })
  const prefs = clean(raw)
  // clean() has already reduced it to known keys and values, so it is plain JSON.
  await prisma.user.update({ where: { id }, data: { prefs: prefs as unknown as Prisma.InputJsonObject } })
  return NextResponse.json({ prefs })
}
