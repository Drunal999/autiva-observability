import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/ops/tenant'

/**
 * The owner's agent stack (Claude, Codex, Hermes, Ollama, OmniRoute), as Jarvis
 * on the owner's own machine measures it. Jarvis listens on loopback only, so
 * this answers `reachable: false` anywhere else (a hosted deploy) — the widget
 * then says so instead of showing a status it cannot know.
 *
 * GET never triggers a probe. POST asks Jarvis to re-probe, which spends real
 * subscription quota, so it only happens when someone presses Recheck.
 */
const JARVIS = process.env.JARVIS_URL ?? 'http://127.0.0.1:8090'

type Agent = { ready?: boolean; label?: string }
const ROSTER: { id: string; name: string; role: string }[] = [
  { id: 'claude', name: 'Claude', role: 'Specs and judgement' },
  { id: 'codex', name: 'Codex', role: 'Builds and activates' },
  { id: 'hermes', name: 'Hermes', role: 'Bulk research' },
  { id: 'ollama', name: 'Ollama', role: 'Local voice model' },
  { id: 'omniroute', name: 'OmniRoute', role: 'Model router' },
]

async function read() {
  try {
    const res = await fetch(`${JARVIS}/api/status`, { signal: AbortSignal.timeout(2000), cache: 'no-store' })
    if (!res.ok) return { reachable: false as const, agents: [] }
    const body = (await res.json()) as { agents?: Record<string, Agent> }
    return {
      reachable: true as const,
      agents: ROSTER.map((a) => {
        const s = body.agents?.[a.id]
        return { ...a, ready: Boolean(s?.ready), label: s?.label ?? 'not reported' }
      }),
    }
  } catch {
    return { reachable: false as const, agents: [] }
  }
}

export async function GET() {
  if (!(await getTenantContext())) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  return NextResponse.json(await read())
}

export async function POST() {
  if (!(await getTenantContext())) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  try {
    await fetch(`${JARVIS}/api/recheck`, { method: 'POST', signal: AbortSignal.timeout(60000) })
  } catch {
    // Unreachable: the GET below reports that honestly.
  }
  return NextResponse.json(await read())
}
