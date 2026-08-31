'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { WARN, BLOCKED, T } from '@/lib/ops/tokens'
import { relative, absolute } from '@/lib/ops/format'
import { parseCommentBody, MAX_COMMENT_LENGTH } from '@/lib/ops/safeMarkdown'
import { useEventListener } from '@/lib/realtime/client'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * The team room.
 *
 * BUILT ON COMMENTS, NOT A NEW TABLE. A room is `subjectType: 'TENANT'` with a
 * fixed subject id; every query is already tenant-scoped, so one constant is
 * all it takes to isolate a room per team. That decision is the whole reason
 * this is small: it inherits, rather than reimplements, the parts of a chat
 * that are easy to get dangerously wrong —
 *
 *   - bodies render from a token tree, never `dangerouslySetInnerHTML`, so a
 *     message pasted from an email cannot execute
 *   - @mentions resolve and notify through the same path as everywhere else
 *   - unread is the same read watermark, so the badge means one thing
 *   - deletes are soft and leave a tombstone
 *   - the realtime channel, the rate limit, and the 2000-character cap already
 *     exist and are already tested
 *
 * A bespoke `Message` table would have meant writing all of that again, badly.
 */

const ROOM = { subjectType: 'TENANT' as const, subjectId: 'team' }
const KEY = `/api/comments?subjectType=${ROOM.subjectType}&subjectId=${ROOM.subjectId}`

interface Message {
  id: string
  authorId: string | null
  authorKind: 'HUMAN' | 'AGENT' | 'SYSTEM'
  authorName: string
  body: string
  mentions: string[]
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
}

const KIND: Record<Message['authorKind'], { tone: string; label: string | null }> = {
  HUMAN: { tone: '#67e8f9', label: null },
  // An entry that looks human but was written by a model is how bad decisions
  // get made, so agent and system messages are labelled and tinted.
  AGENT: { tone: BLOCKED, label: 'AGENT' },
  SYSTEM: { tone: WARN, label: 'SYSTEM' },
}

function MessageBody({ body }: { body: string }) {
  const tokens = parseCommentBody(body)
  return (
    <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.6] text-white/80">
      {tokens.map((t, i) => {
        switch (t.kind) {
          case 'code':
            return (
              <code key={i} className="rounded-[4px] bg-white/[0.09] px-1 py-[1px] font-mono text-[13px] text-cyan-200">
                {t.value}
              </code>
            )
          case 'bold':
            return <strong key={i} className="font-semibold text-white/95">{t.value}</strong>
          case 'italic':
            return <em key={i} className="italic">{t.value}</em>
          case 'mention':
            return (
              <span key={i} className="rounded-[4px] bg-cyan-400/15 px-1 font-medium text-cyan-300">
                @{t.value}
              </span>
            )
          case 'link':
            return (
              <a
                key={i}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-cyan-300 underline decoration-cyan-300/40 underline-offset-2"
              >
                {t.value}
              </a>
            )
          default:
            return <span key={i}>{t.value}</span>
        }
      })}
    </p>
  )
}

const dayOf = (iso: string) => new Date(iso).toDateString()

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function ChatView({ currentUserId }: { currentUserId?: string }) {
  const { data, mutate, isLoading } = useSWR<Message[]>(KEY, fetcher, { refreshInterval: 20000 })
  const { mutate: mutateGlobal } = useSWRConfig()

  // Whether the agent is switched on at all. Asked once, so the button can say
  // "not configured" up front rather than failing when somebody presses it.
  const { data: agent } = useSWR<{ configured: boolean; model: string }>(
    '/api/chat/summary',
    fetcher
  )
  const [summarising, setSummarising] = useState(false)

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const messages = data ?? []

  useEventListener(() => void mutate(), ['COMMENTS'])

  /**
   * Follow new messages only if you were already at the bottom.
   *
   * Scrolling someone to the bottom while they are reading history is the
   * single most irritating thing a chat window does — it takes the page away
   * mid-sentence every time anybody types.
   */
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages.length])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    // A few pixels of slack: "at the bottom" should survive sub-pixel rounding
    // and a trackpad that stops one pixel short.
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  // Opening the room is reading it.
  const marked = useRef<string | null>(null)
  useEffect(() => {
    const live = messages.filter((m) => !m.deletedAt)
    if (live.length === 0) return
    const newest = live[live.length - 1].createdAt
    if (marked.current === newest) return
    marked.current = newest
    void fetch('/api/comments/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ROOM, upTo: newest }),
    })
      .then(() => mutateGlobal(`/api/comments/counts?subjectType=${ROOM.subjectType}`))
      .catch(() => {})
  }, [messages, mutateGlobal])

  async function summarise() {
    if (summarising) return
    setSummarising(true)
    setError(null)
    try {
      const res = await fetch('/api/chat/summary', { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not summarise.')
        return
      }
      atBottom.current = true
      void mutate()
    } catch {
      setError('Network problem — nothing was summarised.')
    } finally {
      setSummarising(false)
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ROOM, body: text }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error ?? 'Could not send that.')
        return
      }
      setDraft('')
      atBottom.current = true
      void mutate()
    } catch {
      setError('Network problem — the message was not sent.')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline gap-3 border-b border-white/[0.06] px-5 py-3">
        <h1 className="font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white/45">
          Team room
        </h1>
        <span className="font-mono text-[12px] tracking-[0.06em] text-white/30">
          EVERYONE ON THE DASHBOARD SEES THIS
        </span>
        <span className="flex-1" />
        {/* Disabled rather than hidden when unconfigured: a button that is
            simply absent leaves somebody wondering whether the feature exists,
            while one that says why can be acted on. */}
        <button
          type="button"
          onClick={() => void summarise()}
          disabled={summarising || agent?.configured === false}
          title={
            agent?.configured === false
              ? 'Set OPENROUTER_API_KEY to switch the room agent on.'
              : `Summarise today with ${agent?.model ?? 'the room agent'}`
          }
          className="h-7 shrink-0 rounded-[8px] border border-white/12 px-2.5 font-mono text-[12px] text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/12 disabled:hover:text-white/60"
        >
          {summarising
            ? 'summarising…'
            : agent?.configured === false
              ? 'summary · not configured'
              : 'summarise today'}
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-5 py-4"
      >
        {isLoading && !data && (
          <p className="font-mono text-[12px] text-white/25">Loading the room…</p>
        )}

        {data && messages.length === 0 && (
          <div className="m-auto max-w-[46ch] text-center">
            <p className="text-[14px] text-white/45">Nothing here yet.</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/30">
              This room is shared by everyone with access. Mention someone with
              @their-github-handle and they get a notification.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt)
          // Consecutive messages from one person within a few minutes read as
          // one turn, so the name and time are printed once rather than
          // stuttering down the page.
          const grouped =
            !newDay &&
            prev &&
            prev.authorName === m.authorName &&
            prev.authorKind === m.authorKind &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000

          const kind = KIND[m.authorKind]
          const mine = !!currentUserId && m.authorId === currentUserId

          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/[0.07]" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/30">
                    {dayLabel(m.createdAt)}
                  </span>
                  <span className="h-px flex-1 bg-white/[0.07]" />
                </div>
              )}

              {m.deletedAt ? (
                <p className="py-0.5 font-mono text-[12px] italic text-white/22">
                  message deleted · {relative(m.deletedAt)}
                </p>
              ) : (
                <div className={`group flex flex-col ${grouped ? 'mt-0.5' : 'mt-3'}`}>
                  {!grouped && (
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold" style={{ color: kind.tone }}>
                        {m.authorName}
                      </span>
                      {kind.label && (
                        <span
                          className="rounded-[4px] px-1 font-mono text-[10.5px] font-bold tracking-[0.08em]"
                          style={{ color: kind.tone, background: `${kind.tone}22` }}
                        >
                          {kind.label}
                        </span>
                      )}
                      <span className="font-mono text-[11.5px] text-white/25" title={absolute(m.createdAt)}>
                        {relative(m.createdAt)}
                        {m.editedAt && ' · edited'}
                      </span>
                      {mine && (
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/comments/${m.id}`, { method: 'DELETE' })
                            void mutate()
                          }}
                          className="ml-auto font-mono text-[11.5px] text-white/0 transition group-hover:text-white/30 hover:!text-red-300 focus:outline-none focus-visible:!text-red-300"
                        >
                          delete
                        </button>
                      )}
                    </div>
                  )}
                  <MessageBody body={m.body} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-5 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            maxLength={MAX_COMMENT_LENGTH}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a newline — the convention every
              // chat app uses. The ops threads deliberately use Cmd+Enter
              // instead, because a note attached to a failing run is usually
              // several lines and sending it half-written is the worse mistake.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Message the team…  @handle to notify someone"
            aria-label="Message"
            className="max-h-[160px] min-h-[38px] flex-1 resize-y rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-400/45"
          />
          <button
            type="button"
            disabled={!draft.trim() || busy}
            onClick={() => void send()}
            className="h-[38px] rounded-[10px] border border-cyan-400/40 bg-cyan-400/10 px-3.5 text-[13px] font-semibold text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-35"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/22">
            ↵ send · ⇧↵ newline
          </span>
          {error && <span className="font-mono text-[11.5px] text-red-300">{error}</span>}
          <span className="flex-1" />
          {draft.length > MAX_COMMENT_LENGTH * 0.8 && (
            <span className="font-mono text-[11px] tabular-nums" style={{ color: T(0.4) }}>
              {MAX_COMMENT_LENGTH - draft.length} left
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
