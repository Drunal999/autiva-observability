'use client'

import { useEffect, useState } from 'react'

/**
 * Starts an embedded Jitsi call about one subject.
 *
 * We do not run WebRTC signalling ourselves (ADR-004). The room name is minted
 * server-side as an HMAC — never derived in the browser and never taken from
 * the URL — because on a public Jitsi instance anyone who knows the room name
 * can join.
 */
export function CallButton({
  subjectType,
  subjectId,
  label = 'Call',
}: {
  subjectType: 'RUN' | 'APPROVAL' | 'AGENT' | 'MODULE' | 'TENANT'
  subjectId: string
  label?: string
}) {
  const [call, setCall] = useState<{ room: string; domain: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!call) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCall(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [call])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType, subjectId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not start a call.')
        return
      }
      setCall(payload)
    } catch {
      setError('Network problem — the call did not start.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="flex h-7 items-center gap-1.5 rounded-[8px] border border-white/12 px-2.5 font-mono text-[10px] text-white/55 transition hover:border-cyan-400/40 hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-40"
      >
        <span aria-hidden="true">☎</span>
        {busy ? 'Starting…' : label}
      </button>

      {error && <span className="font-mono text-[10px] text-red-300">{error}</span>}

      {call && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#0a1020]/92 backdrop-blur"
          role="dialog"
          aria-label="Call"
        >
          <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
              Call
            </span>
            <span className="font-mono text-[10px] text-white/30">
              {subjectType.toLowerCase()} · {subjectId.slice(0, 8)}
            </span>
            <span className="flex-1" />
            <span className="hidden font-mono text-[9.5px] text-white/25 sm:inline">
              Esc to leave
            </span>
            <button
              type="button"
              onClick={() => setCall(null)}
              className="h-7 rounded-[8px] border border-white/12 px-2.5 font-mono text-[10px] text-white/60 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Leave
            </button>
          </div>
          <iframe
            title="Call"
            // Camera and microphone only; nothing else is granted to the embed.
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            src={`https://${call.domain}/${call.room}#config.prejoinPageEnabled=true`}
            className="min-h-0 flex-1 border-0"
          />
        </div>
      )}
    </>
  )
}
