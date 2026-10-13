'use client'
import { useSyncExternalStore } from 'react'
import type { BuildingId } from './cityMarketplace'

/**
 * "My plan": what this visitor has picked, from the city card or the
 * marketplace, before asking for setup. Kept in this browser only, as a
 * convenience; the request itself is what gets stored (POST /api/setup-requests).
 */
export type PlanItem = { key: string; name: string; building: BuildingId; ready: boolean }

const KEY = 'autiva.myplan.v1'
let items: PlanItem[] = []
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded) return
  loaded = true
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); if (Array.isArray(v)) items = v } catch { /* private window: start empty */ }
}
function save(next: PlanItem[]) {
  items = next
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* still works for this visit */ }
  listeners.forEach(l => l())
}

export const myPlan = {
  toggle(item: PlanItem) { load(); save(items.some(i => i.key === item.key) ? items.filter(i => i.key !== item.key) : [...items, item]) },
  remove(key: string) { load(); save(items.filter(i => i.key !== key)) },
  clear() { save([]) },
}

const EMPTY: PlanItem[] = []
export function useMyPlan(): PlanItem[] {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l) },
    () => { load(); return items },
    () => EMPTY,
  )
}
