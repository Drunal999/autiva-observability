import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json()) as { muteSounds: boolean }
  const userId = (session.user as { id: string }).id
  const user = await prisma.user.update({ where: { id: userId }, data: { muteSounds: body.muteSounds } })
  return NextResponse.json({ muteSounds: user.muteSounds })
}
