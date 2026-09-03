/**
 * Which district a module belongs to.
 *
 * The catalog groups modules into eight districts (AUTIVA ARCHITECTURE.md §6.1)
 * and the city draws one block per district. `Module` has no `district` column,
 * and adding one is a migration on a model this change does not otherwise
 * touch — so the mapping lives here until the city has earned the column.
 *
 * Two key shapes are covered on purpose. This deployment seeds flat keys
 * (`seo-audit`), while AUTIVA's own Supabase catalog uses dotted ones
 * (`marketing.seo_audit`). The two catalogs are not in sync and nobody has
 * decided which is canonical, so the city reads whichever it is given rather
 * than forcing that decision now.
 */

export const DISTRICTS = [
  'sales',
  'marketing',
  'support',
  'operations',
  'finance',
  'people',
  'security',
  'intelligence',
] as const

export type District = (typeof DISTRICTS)[number]

/** Flat keys, as seeded by prisma/seed-agent-ops.mjs. */
const BY_KEY: Record<string, District> = {
  'seo-audit': 'marketing',
  'review-replies': 'marketing',
  'lead-followup': 'sales',
  'inbox-triage': 'support',
  'invoice-chase': 'finance',
  'weekly-digest': 'operations',
}

/**
 * A module we have never seen still has to appear somewhere: a building in the
 * wrong district is a cosmetic error, a module missing from the city is an
 * operator believing nothing is running when something is. So this never
 * throws and never drops a row.
 */
export function districtFor(key: string): District {
  const k = key.toLowerCase()

  // Dotted keys carry their district already: `marketing.seo_audit`.
  const prefix = k.split('.')[0] as District
  if (k.includes('.') && (DISTRICTS as readonly string[]).includes(prefix)) return prefix

  if (BY_KEY[k]) return BY_KEY[k]

  // Last resort: a word in the key that happens to name a district.
  const hit = DISTRICTS.find((d) => k.includes(d))
  return hit ?? 'operations'
}
