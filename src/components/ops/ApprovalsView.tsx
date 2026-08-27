'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { OK, WARN, ERR, BLOCKED, T } from '@/lib/ops/tokens'
import { inr, relative, absolute } from '@/lib/ops/format'
import { useEventListener, useRealtimeConnectionState } from '@/lib/realtime/client'
import { EmptyState } from './Panel'
import { ThreadToggle, useCommentCounts } from './Thread'
import { CallButton } from './CallButton'
import type { Approval, ApprovalsResponse, ApprovalRisk } from '@/types/approvals'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const RISK: Record<ApprovalRisk, { label: string; tone: string; glyph: string }> = {
  MONEY: { label: 'Money', tone: ERR, glyph: '₹' },
  PUBLISH: { label: 'Publishes publicly', tone: WARN, glyph: '◈' },
  BULK_MESSAGE: { label: 'Messages many people', tone: WARN, glyph: '✉' },
  DATA_DELETE: { label: 'Deletes data', tone: ERR, glyph: '⌫' },
  OTHER: { label: 'Needs review', tone: BLOCKED, glyph: '⏸' },
}

/**
 * A pending row that has been waiting a long time is more urgent, and saying so
 * in words beats relying on a colour nobody has learned yet.
 */
function ageTone(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000
  if (mins > 120) return ERR
  if (mins > 30) return WARN
  return T(0.4)
}

function RiskChip({ risk }: { risk: ApprovalRisk }) {
  const r = RISK[risk]
  return (
    <span
      className="flex items-center gap-1 rounded-[5px] px-1.5 py-[2px] font-mono text-[9px] font-bold uppercase tracking-[0.06em]"
      style={{ color: r.tone, background: `${r.tone}1f` }}
    >
      <span aria-hidden="true">{r.glyph}</span>
      {r.label}
    </span>
  )
}

/**
 * Two-step commit. The first click arms the action and the second confirms it —
 * this is the one screen where a misclick costs money, and an undo after the
 * money has moved is not an undo. Escape disarms.
 */
function DecideControls({
  approval,
  busy,
  onDecide,
}: {
  approval: Approval
  busy: boolean
  onDecide: (decision: 'APPROVED' | 'REJECTED', reason: string) => void
}) {
  const [arming, setArming] = useState<'APPROVED' | 'REJECTED' | null>(null)
  const [reason, setReason] = useState('')
  const reasonRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (arming === 'REJECTED') reasonRef.current?.focus()
  }, [arming])

  function disarm() {
    setArming(null)
    setReason('')
  }

  if (!arming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setArming('APPROVED')}
          className="h-8 rounded-[9px] border border-emerald-400/40 bg-emerald-400/10 px-3 text-[12px] font-bold text-emerald-300 transition hover:bg-emerald-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setArming('REJECTED')}
          className="h-8 rounded-[9px] border border-red-400/40 bg-red-400/10 px-3 text-[12px] font-bold text-red-300 transition hover:bg-red-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    )
  }

  const approving = arming === 'APPROVED'

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          disarm()
        }
      }}
    >
      {!approving && (
        <input
          ref={reasonRef}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejecting (required)"
          aria-label="Reason for rejecting"
          className="h-8 min-w-[220px] flex-1 rounded-[9px] border border-white/10 bg-white/5 px-2.5 text-[12px] text-white/85 outline-none placeholder:text-white/25 focus:border-red-400/50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && reason.trim()) onDecide('REJECTED', reason.trim())
          }}
        />
      )}

      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">
        {approving
          ? approval.amountInr
            ? `Confirm — ${inr(approval.amountInr)} will be paid`
            : 'Confirm this action'
          : 'Confirm rejection'}
      </span>

      <button
        type="button"
        disabled={busy || (!approving && !reason.trim())}
        onClick={() => onDecide(arming, reason.trim())}
        className={`h-8 rounded-[9px] px-3 text-[12px] font-bold transition focus:outline-none focus-visible:ring-2 disabled:opacity-40 ${
          approving
            ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300 focus-visible:ring-emerald-400/60'
            : 'bg-red-400 text-red-950 hover:bg-red-300 focus-visible:ring-red-400/60'
        }`}
      >
        {busy ? 'Working…' : approving ? 'Yes, approve' : 'Yes, reject'}
      </button>
      <button
        type="button"
        onClick={disarm}
        className="h-8 rounded-[9px] border border-white/10 px-3 text-[12px] font-semibold text-white/55 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        Cancel
      </button>
    </div>
  )
}

export function ApprovalsView() {
  const { data, error, isLoading, mutate } = useSWR<ApprovalsResponse>('/api/approvals', fetcher, {
    refreshInterval: 20000,
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const connection = useRealtimeConnectionState()
  const noteCounts = useCommentCounts('APPROVAL')

  // Subscribe to the shared stream rather than opening another connection, so
  // a decision made by a colleague drops out of this queue immediately instead
  // of lingering until the next poll and inviting a duplicate decision.
  useEventListener(() => void mutate(), ['APPROVALS'])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  async function decide(a: Approval, decision: 'APPROVED' | 'REJECTED', reason: string) {
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/approvals/${a.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        // The message says what happened and what to do — never a bare code.
        setToast({ tone: 'err', text: payload.error ?? 'Could not record that decision.' })
        // A 409 means someone else decided first; refresh so the queue is truthful.
        if (res.status === 409) void mutate()
        return
      }

      setToast({
        tone: 'ok',
        text: decision === 'APPROVED' ? 'Approved.' : 'Rejected.',
      })
      void mutate()
    } catch {
      setToast({ tone: 'err', text: 'Network problem — the decision was not recorded.' })
    } finally {
      setBusyId(null)
    }
  }

  const pending = data?.pending ?? []
  const decided = data?.decided ?? []

  return (
    <div className="relative flex h-full flex-col gap-5 overflow-y-auto p-3 md:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
          Approvals
        </h1>
        <span className="font-mono text-[10px] tracking-[0.06em] text-white/30">
          {pending.length} WAITING
          {/* The caveat matters but is not worth a six-line column on a phone. */}
          <span className="hidden sm:inline"> · A DECISION IS RECORDED ONCE AND CANNOT BE EDITED</span>
        </span>
        <span className="flex-1" />
        {/* A stale queue that looks live is how the same action gets approved
            twice, so the connection state is stated rather than implied. */}
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
          <span
            className={`h-[5px] w-[5px] rounded-full ${
              connection === 'connected'
                ? 'bg-emerald-400'
                : connection === 'offline'
                  ? 'bg-red-400'
                  : 'bg-amber-400 animate-pulse'
            }`}
          />
          {connection === 'connected'
            ? 'LIVE'
            : connection === 'offline'
              ? 'OFFLINE — LIST MAY BE STALE'
              : 'RECONNECTING'}
        </span>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[104px] rounded-[16px] border border-white/5 bg-white/[0.02]"
              style={{ animation: `skel 1.6s ease-in-out ${i * 0.06}s infinite` }}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-[16px] border border-red-400/35 border-l-2 border-l-red-400 bg-red-400/[0.06] p-5">
          <p className="text-[13px] font-semibold text-red-300">Could not load the approvals queue</p>
          <p className="mt-1 font-mono text-[11px] text-white/45">
            /api/approvals did not respond. Nothing has been approved or rejected.
          </p>
        </div>
      )}

      {/* Zero-approval state. Distinguishes "you are up to date" from "nothing
          has ever come through here", because those mean different things to
          someone who just signed up. */}
      {!isLoading && !error && pending.length === 0 && (
        <EmptyState
          title={decided.length > 0 ? 'Nothing waiting on you' : 'No approvals yet'}
          detail={
            decided.length > 0
              ? 'Everything requested so far has been decided. New requests appear here the moment an agent pauses.'
              : 'Agents pause here before spending money, publishing publicly, messaging in bulk, or deleting data — so nothing irreversible happens without you.'
          }
        />
      )}

      <div className="flex flex-col gap-3">
        {pending.map((a, i) => (
          <article
            key={a.id}
            className="rounded-[16px] border bg-white/[0.03] p-3 md:p-4"
            style={{
              borderColor: a.risk === 'MONEY' || a.risk === 'DATA_DELETE'
                ? 'rgba(248,113,113,0.30)'
                : 'rgba(255,255,255,0.06)',
              animation: `enter 160ms cubic-bezier(0.16,1,0.3,1) ${Math.min(i, 8) * 0.018}s both`,
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <RiskChip risk={a.risk} />
              {a.module && (
                <span className="font-mono text-[10px] text-white/45">{a.module.displayName}</span>
              )}
              {a.run && (
                <span className="font-mono text-[10px] text-white/25">
                  {a.run.ref} · {a.run.agent.name}
                </span>
              )}
              <span className="flex-1" />
              <span
                className="font-mono text-[10px] tabular-nums"
                style={{ color: ageTone(a.requestedAt) }}
                title={absolute(a.requestedAt)}
              >
                waiting {relative(a.requestedAt).replace(' ago', '')}
              </span>
            </div>

            <h2 className="mt-2 text-[15px] font-semibold leading-snug text-white/92">{a.action}</h2>

            {a.amountInr != null && (
              <p className="mt-1 font-mono text-[18px] font-bold tabular-nums text-red-300">
                {inr(a.amountInr)}
              </p>
            )}

            {a.detail && (
              <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-[1.6] text-white/55">
                {a.detail}
              </p>
            )}

            <div className="mt-3">
              <DecideControls
                approval={a}
                busy={busyId === a.id}
                onDecide={(decision, reason) => decide(a, decision, reason)}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ThreadToggle subjectType="APPROVAL" subjectId={a.id} count={noteCounts[a.id]} />
              <span className="flex-1" />
              <CallButton subjectType="APPROVAL" subjectId={a.id} label="Talk it over" />
            </div>
          </article>
        ))}
      </div>

      {decided.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            Recently decided
          </h2>
          {decided.map((a) => {
            const approved = a.status === 'APPROVED'
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5"
              >
                <span
                  className="flex items-center gap-1 rounded-[5px] px-1.5 py-[2px] font-mono text-[9px] font-bold uppercase"
                  style={{
                    color: approved ? OK : ERR,
                    background: approved ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                  }}
                >
                  <span aria-hidden="true">{approved ? '✓' : '✕'}</span>
                  {a.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/65">{a.action}</span>
                {a.reason && (
                  <span className="max-w-[40ch] truncate font-mono text-[10px] text-white/35" title={a.reason}>
                    “{a.reason}”
                  </span>
                )}
                <span
                  className="font-mono text-[10px] text-white/28"
                  title={a.decidedAt ? absolute(a.decidedAt) : undefined}
                >
                  {a.decidedBy?.name ?? 'unknown'} · {a.decidedAt ? relative(a.decidedAt) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[12px] border px-4 py-2.5 text-[12.5px] backdrop-blur"
          style={{
            borderColor: toast.tone === 'ok' ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)',
            background: toast.tone === 'ok' ? 'rgba(52,211,153,0.14)' : 'rgba(248,113,113,0.14)',
            color: toast.tone === 'ok' ? '#6ee7b7' : '#fca5a5',
            animation: 'riseIn 160ms cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
