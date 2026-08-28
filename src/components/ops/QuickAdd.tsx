'use client'

import { useState } from 'react'
import { toDateOnly } from '@/lib/ops/allDay'
import { quickAdd } from '@/lib/ops/quickAdd'
import { validateRRule } from '@/lib/ops/recurrence'
import { OK, ERR, WARN } from '@/lib/ops/tokens'

/**
 * Inline event creation. No modal for the simple case — a modal to type six
 * words is friction for its own sake.
 *
 * The parse is ALWAYS shown back before anything is saved. A schedule that
 * silently differs from what someone meant is worse than an error, because
 * nobody finds out until the thing fires at the wrong time.
 */
export function QuickAdd({ onCreated }: { onCreated?: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const parsed = text.trim() ? quickAdd(text) : null

  // A rule the parser produced can still be one the server would reject, so
  // it is checked here too rather than only on submit.
  const ruleCheck =
    parsed?.ok && parsed.rrule && parsed.startsAt
      ? validateRRule(parsed.rrule, parsed.startsAt)
      : null

  const canSave = !!parsed?.ok && (!ruleCheck || ruleCheck.ok) && !busy

  async function save() {
    if (!parsed?.ok || !parsed.startsAt || !parsed.endsAt) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: parsed.title,
          // An all-day result is submitted as DATES: the parser ran here, in
          // the viewer's timezone, so this is the only place that knows which
          // day "tomorrow" meant.
          startsAt: parsed.allDay ? toDateOnly(parsed.startsAt) : parsed.startsAt.toISOString(),
          endsAt: parsed.allDay ? toDateOnly(parsed.endsAt) : parsed.endsAt.toISOString(),
          allDay: parsed.allDay,
          rrule: parsed.rrule,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error ?? 'Could not save that event.')
        return
      }
      setSaved(parsed.title ?? 'Event')
      setText('')
      onCreated?.()
      setTimeout(() => setSaved(null), 4000)
    } catch {
      setError('Network problem — the event was not saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] border border-white/[0.07] bg-white/[0.025] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          maxLength={200}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) void save()
            if (e.key === 'Escape') setText('')
          }}
          placeholder='Add an event — try "standup every weekday 9:30"'
          aria-label="Add an event"
          className="h-8 min-w-[240px] flex-1 rounded-[8px] border border-white/10 bg-white/5 px-2.5 text-[12.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-400/45"
        />
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className="h-8 rounded-[8px] border border-cyan-400/40 bg-cyan-400/10 px-3 text-[12px] font-semibold text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-35"
        >
          {busy ? 'Saving…' : 'Add'}
        </button>
      </div>

      {/* The read-back. Shown for every keystroke that parses, so nobody saves
          a schedule they have not seen stated plainly. */}
      {parsed?.ok && (
        <p className="font-mono text-[10px]" style={{ color: ruleCheck && !ruleCheck.ok ? ERR : OK }}>
          {ruleCheck && !ruleCheck.ok
            ? ruleCheck.error
            : `will save: ${parsed.summary}${
                ruleCheck?.text ? ` · repeats ${ruleCheck.text}` : ''
              }`}
        </p>
      )}

      {parsed && !parsed.ok && (
        <p className="font-mono text-[10px]" style={{ color: WARN }}>
          {parsed.error}
        </p>
      )}

      {error && <p className="font-mono text-[10px] text-red-300">{error}</p>}
      {saved && (
        <p className="font-mono text-[10px] text-emerald-300" role="status">
          Added “{saved}”.
        </p>
      )}
    </div>
  )
}
