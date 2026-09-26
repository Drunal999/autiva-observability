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

/**
 * Which business department a district groups under, for the city's left
 * navigation (product brief: Marketing, Sales & Clients, Finance, Operations,
 * Security, Legal & Compliance, Knowledge). Departments, not districts, are
 * what an owner recognises — "Sales & Clients" reads as a business function,
 * "sales" reads as an internal key.
 *
 * The mapping is not 1:1 and says so rather than hiding the judgment call:
 * `support` (inbox triage) joins Sales & Clients because it is the same
 * client-facing correspondence, not a separate helpdesk function; `people`
 * joins Operations because nothing in the current catalog has grown into an
 * HR-shaped module yet; `intelligence` (market trends) joins Knowledge
 * because it is business memory, not a campaign. Reasonable people could
 * place `intelligence` under Marketing instead — this is a judgment call,
 * not a measured fact, and can move without ceremony if it stops fitting.
 *
 * `Legal & Compliance` has no district behind it at all. That is deliberate:
 * it exists so the department can render as a discoverable "Set up" building
 * rather than not exist in the nav — AUTIVA has no legal engine yet.
 */
export const DEPARTMENTS = [
  'Marketing',
  'Sales & Clients',
  'Finance',
  'Operations',
  'Security',
  'Legal & Compliance',
  'Knowledge',
] as const

export type Department = (typeof DEPARTMENTS)[number]

const DEPARTMENT_BY_DISTRICT: Record<District, Department> = {
  marketing: 'Marketing',
  sales: 'Sales & Clients',
  support: 'Sales & Clients',
  finance: 'Finance',
  operations: 'Operations',
  people: 'Operations',
  security: 'Security',
  intelligence: 'Knowledge',
}

export function departmentFor(district: District): Department {
  return DEPARTMENT_BY_DISTRICT[district]
}

/** One line each — shown when a department has no connected modules yet. */
export const DEPARTMENT_PURPOSE: Record<Department, string> = {
  Marketing: 'Campaigns, content and lead generation.',
  'Sales & Clients': 'CRM, follow-up drafts and onboarding.',
  Finance: 'Invoices, payment tracking and expense reports.',
  Operations: 'Tasks, calendars and workflow monitoring.',
  Security: 'Access reviews, audit logs and authorised checks.',
  'Legal & Compliance': 'Contract drafts, document review and renewal reminders.',
  Knowledge: 'Business memory, SOPs and project documents.',
}
