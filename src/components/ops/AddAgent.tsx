'use client'

import { useEffect, useRef, useState } from 'react'
import { AGENT_MODELS, MAX_AGENT_NAME, isValidAgentName } from '@/lib/ops/agentModels'

interface ModuleOption {
  key: string
  displayName: string
}

/**
 * Adds an agent to the fleet.
 *
 * Collapsed to a single button until asked for: the fleet screen is for
 * watching what is running, and a form sitting open at the top of it competes
 * with the thing you came to look at.
 *
 * The codename rule is enforced here AND on the server, from the same module,
 * so the two cannot drift. The client copy exists to answer before a round
 * trip, not to be trusted.
 */
export function AddAgent({
  modules,
  onCreated,
}: {
  modules: ModuleOption[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [model, setModel] = useState<string>(AGENT_MODELS[1])
  const [moduleKey, setModuleKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) nameRef.current?.focus()
  }, [open])

  const trimmed = name.trim().toLowerCase()
  // Only complain once there is something to complain about — a rule shown
  // against an empty box reads as an error you already made.
  const nameProblem = trimmed.length > 0 && !isValidAgentName(trimmed)

  function close() {
    setOpen(false)
    setName('')
    setError(null)
  }

  async function submit() {
    if (!trimmed || nameProblem || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, model, moduleKey: moduleKey || undefined }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error ?? 'Could not add that agent.')
        return
      }
      close()
      onCreated()
    } catch {
      setError('Network problem — the agent was not added.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-7 rounded-[8px] border border-cyan-400/40 bg-cyan-400/10 px-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        + Agent
      </button>
    )
  }

  return (
    <div
      className="flex flex-wrap items-start gap-2 rounded-[12px] border border-cyan-400/30 bg-white/[0.03] p-2.5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
      }}
    >
      <div className="flex flex-col gap-1">
        <input
          ref={nameRef}
          value={name}
          maxLength={MAX_AGENT_NAME}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="codename, e.g. nightly-crawler"
          aria-label="Agent codename"
          aria-invalid={nameProblem}
          className="h-7 w-[220px] rounded-[8px] border bg-white/5 px-2 font-mono text-[11px] text-white/85 outline-none placeholder:text-white/25"
          style={{ borderColor: nameProblem ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.12)' }}
        />
        {nameProblem && (
          <span className="font-mono text-[9px] text-red-300">
            lowercase letters, numbers and hyphens, starting with a letter
          </span>
        )}
      </div>

      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        aria-label="Model"
        className="h-7 rounded-[8px] border border-white/12 bg-[#0b1220] px-2 font-mono text-[11px] text-white/85 outline-none"
      >
        {AGENT_MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        value={moduleKey}
        onChange={(e) => setModuleKey(e.target.value)}
        aria-label="Engine"
        className="h-7 rounded-[8px] border border-white/12 bg-[#0b1220] px-2 font-mono text-[11px] text-white/85 outline-none"
      >
        {/* Optional on purpose: an agent can exist before anyone has decided
            which engine it belongs to. Latency is then judged against no
            target rather than a borrowed one. */}
        <option value="">no engine</option>
        {modules.map((m) => (
          <option key={m.key} value={m.key}>
            {m.displayName}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={!trimmed || nameProblem || busy}
        onClick={() => void submit()}
        className="h-7 rounded-[8px] border border-cyan-400/45 bg-cyan-400/12 px-2.5 font-mono text-[10px] font-bold text-cyan-300 transition hover:bg-cyan-400/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-35"
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
      <button
        type="button"
        onClick={close}
        className="h-7 px-1 font-mono text-[10px] text-white/35 transition hover:text-white/70"
      >
        esc
      </button>

      {error && (
        <span className="w-full font-mono text-[10px] text-red-300" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
