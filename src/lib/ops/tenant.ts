import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * TENANT BOUNDARY.
 *
 * On Supabase this would be Row Level Security. This deployment runs on Neon,
 * where Prisma connects as the schema owner and no policy engine sits between
 * the query and the rows — so the boundary lives here instead, and every
 * tenant-scoped query MUST go through `tenantScope()`.
 *
 * The consequences, stated plainly so nobody relies on a guarantee we do not
 * have (see ADR-002):
 *   - A query that forgets `tenantId` returns every tenant's rows. There is no
 *     backstop. Treat a missing scope as a security bug, not a missing filter.
 *   - This module is server-only. It reads the session; it must never be
 *     imported into a client component.
 *   - Tenant identity comes from the session, never from a query string, path
 *     segment, header or request body. A caller-supplied tenant id is an
 *     escalation vector.
 */

export const INTERNAL_TENANT_SLUG = 'autiva'

export type ViewMode = 'internal' | 'client'

export interface TenantContext {
  tenantId: string
  slug: string
  name: string
  /** Internal tenants see agent codenames and file paths; clients never do. */
  mode: ViewMode
}

/**
 * Resolves the tenant for the current request from the session alone.
 *
 * Today every signed-in user belongs to the internal tenant — there is no
 * membership table yet. That is a deliberate stub, and the single place to
 * change when real tenant membership lands: callers already treat the result
 * as opaque, so none of them need to change with it.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const tenant = await prisma.tenant.findUnique({
    where: { slug: INTERNAL_TENANT_SLUG },
    select: { id: true, slug: true, name: true, isInternal: true },
  })
  if (!tenant) return null

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    mode: tenant.isInternal ? 'internal' : 'client',
  }
}

/**
 * The `where` fragment every tenant-scoped query must spread. Using this rather
 * than writing `{ tenantId }` by hand keeps the boundary greppable: one symbol
 * to audit, and a route missing it is visible in review.
 */
export function tenantScope(ctx: TenantContext) {
  return { tenantId: ctx.tenantId } as const
}
