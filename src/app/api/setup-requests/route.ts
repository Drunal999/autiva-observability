import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/lib/ops/tenant'
import { rateLimit } from '@/lib/ops/rateLimit'
import { CATALOG } from '@/lib/ops/marketplaceCatalog'
import { BUILDINGS } from '@/lib/ops/cityMarketplace'
import { planFor, priceLabel, SETUP_INR, SETUP_FREE_FOR_FIRST, inr } from '@/lib/ops/plans'

/**
 * "Request setup" from My plan. No payment happens here: the request lands in
 * the team's approvals queue ("Needs your OK"), and the team calls back to set
 * it up. The plan and price are worked out here from catalog keys, never taken
 * from the browser, so a request always states the published launch price.
 */
const MAX_ITEMS = 30

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const ctx = await getTenantContext()
  const user = session?.user as { id?: string; name?: string | null } | undefined
  if (!ctx || !user?.id) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const limited = rateLimit(`setup-requests:${user.id}`, 5, 60_000)
  if (!limited.ok) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } })

  const body = (await req.json().catch(() => null)) as { keys?: unknown } | null
  const keys = body?.keys
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_ITEMS || !keys.every(k => typeof k === 'string')) {
    return NextResponse.json({ error: `keys must be 1-${MAX_ITEMS} automation keys` }, { status: 400 })
  }
  const items = Array.from(new Set(keys as string[])).map(k => CATALOG.find(c => c.key === k))
  if (items.some(i => !i)) return NextResponse.json({ error: 'unknown automation in the plan' }, { status: 400 })

  const picked = items as NonNullable<(typeof items)[number]>[]
  const buildingIds = Array.from(new Set(picked.map(i => i.building)))
  const names = buildingIds.map(id => BUILDINGS.find(b => b.id === id)?.name ?? id)
  const plan = planFor(buildingIds.length)
  const lines = [
    `${plan.name} plan, ${priceLabel(plan)} (launch price). Setup ${inr(SETUP_INR)} once, free for the first ${SETUP_FREE_FOR_FIRST}.`,
    ...picked.map(i => `${i.stage === 'ready' ? 'Set up' : 'Reserve (coming soon)'}: ${i.name}`),
    `Requested by ${user.name ?? 'a signed-in user'}. Call back to confirm; nothing has been charged.`,
  ]
  const approval = await prisma.approval.create({
    data: {
      tenantId: ctx.tenantId,
      action: `Setup request: ${names.join(', ')} (${plan.name}, ${priceLabel(plan)})`.slice(0, 200),
      detail: lines.join('\n').slice(0, 500),
      risk: 'OTHER',
      amountInr: plan.priceInr,
    },
    select: { id: true },
  })
  return NextResponse.json({ id: approval.id, plan: plan.id, priceInr: plan.priceInr, buildings: buildingIds.length })
}
