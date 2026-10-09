import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Sign in to view your jobs' }, { status: 401 })
  const origin = req.headers.get('origin')
  const url = new URL(req.url)
  const expectedOrigin = `${url.protocol}//${req.headers.get('host') || url.host}`
  if (origin !== expectedOrigin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  const action = params.path.join('/')
  if (!['state', 'status', 'download', 'prepare'].includes(action)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const endpoint = process.env.JOB_HUNT_URL, token = process.env.JOB_HUNT_TOKEN
  if (!endpoint || !token) return NextResponse.json({ error: 'Job Hunt worker is not connected' }, { status: 503 })
  try {
    const body = await req.text()
    if (body.length > 4096) return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    const input = JSON.parse(body)
    const response = await fetch(new URL('/rpc', endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, userId, key: input.key, filename: input.filename, status: input.status, confirmed: input.confirmed, nightShift: input.nightShift }), cache: 'no-store', signal: AbortSignal.timeout(action === 'prepare' ? 70000 : 15000) })
    const result = await response.json()
    if (!response.ok) return NextResponse.json(result, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
    if (action === 'download') {
      if (!['resume.txt', 'resume.html', 'application.txt'].includes(result.filename)) throw new Error('Invalid download')
      return new Response(Buffer.from(result.content, 'base64'), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${result.filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Job Hunt unavailable. Check the Windows worker connection.' }, { status: 503 }) }
}
