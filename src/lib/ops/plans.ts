/**
 * Launch prices, from the 29 Sep launch plan: priced per building per month,
 * tier 2/3 cities first. They are test prices, so every place that shows them
 * says "Launch price". Nothing is charged in the app: a plan becomes a setup
 * request that the team follows up by phone.
 *
 * Profit guard: Starter has no voice and Growth caps it, because voice minutes
 * are the cost that breaks small plans.
 */
export type PlanId = 'starter' | 'growth' | 'pro'
export type Plan = { id: PlanId; name: string; priceInr: number; buildings: number; line: string; from?: boolean }

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', priceInr: 499, buildings: 1, line: '1 building · no voice' },
  { id: 'growth', name: 'Growth', priceInr: 1499, buildings: 3, line: '3 buildings · 15 voice minutes' },
  { id: 'pro', name: 'Pro', priceInr: 3999, buildings: Infinity, line: 'More buildings · priced with you', from: true },
]
export const SETUP_INR = 1999
export const SETUP_FREE_FOR_FIRST = 10

/** The smallest plan that covers this many buildings. */
export function planFor(buildings: number): Plan {
  return PLANS.find(p => buildings <= p.buildings) ?? PLANS[PLANS.length - 1]
}

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
export const priceLabel = (p: Plan) => `${p.from ? 'from ' : ''}${inr(p.priceInr)}/month`
