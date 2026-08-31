'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { WARN, BLOCKED, T } from '@/lib/ops/tokens'
import { relative, absolute } from '@/lib/ops/format'
import { parseCommentBody, MAX_COMMENT_LENGTH } from '@/lib/ops/safeMarkdown'
import { useEventListener } from '@/lib/realtime/client'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export type SubjectType = 'RUN' | 'APPROVAL' | 'AGENT' | 'MODULE' | 'TENANT'

interface Comment {
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

/**
 * Renders a comment body from the token tree, as React elements.
 *
 * There is no HTML string anywhere in this path and no
 * `dangerouslySetInnerHTML` — a body may have arrived from a customer email,
 * so it is text until proven otherwise. Links open in a new tab with
 * `noopener noreferrer`, which stops the opened page reaching back through
 * `window.opener`.
 */
function CommentBody({ body }: { body: string }) {
  const tokens = parseCommentBody(body)
  return (
    <p className="whitespace-pre-wrap text-[14.5px] leading-[1.6] text-white/72">
      {tokens.map((t, i) => {
        switch (t.kind) {
          case 'code':
            return (
              <code key={i} className="rounded-[4px] bg-white/[0.08] px-1 py-[1px] font-mono text-[13.5px] text-cyan-200">
                {t.value}
              </code>
            )
          case 'bold':
            return <strong key={i} className="font-semibold text-white/90">{t.value}</strong>
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

const KIND_STYLE: Record<Comment['authorKind'], { tone: string; label: string | null }> = {
  HUMAN: { tone: T(0.75), label: null },
  // An entry that looks human but was written by a model is how bad decisions
  // get made, so agent and system entries are labelled and tinted.
  AGENT: { tone: BLOCKED, label: 'AGENT' },
  SYSTEM: { tone: WARN, label: 'SYSTEM' },
}

export function Thread({
  subjectType,
  subjectId,
  currentUserId,
  autoFocus = false,
  onClose,
}: {
  subjectType: SubjectType
  subjectId: string
  currentUserId?: string
  autoFocus?: boolean
  onClose?: () => void
}) {
  const key = `/api/comments?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`
  const { data: comments, mutate, isLoading } = useSWR<Comment[]>(key, fetcher)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Same shared stream, one more channel — never a second socket.
  useEventListener(() => void mutate(), ['COMMENTS'])

  const { mutate: mutateGlobal } = useSWRConfig()
  const markedUpTo = useRef<string | null>(null)

  /**
   * Mark read from the thread itself, not from the toggle that opened it.
   *
   * The watermark is the newest comment THIS COMPONENT RENDERED, so a comment
   * that lands between the fetch and the write stays unread rather than being
   * silently swallowed. Re-runs when new comments arrive while the thread is
   * open, which is correct: you are looking at them.
   */
  useEffect(() => {
    const live = (comments ?? []).filter((c) => !c.deletedAt)
    if (live.length === 0) return
    const newest = live[live.length - 1].createdAt
    if (markedUpTo.current === newest) return
    markedUpTo.current = newest

    void fetch('/api/comments/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectType, subjectId, upTo: newest }),
    })
      .then(() => mutateGlobal(`/api/comments/counts?subjectType=${subjectType}`))
      // A failed mark-read leaves the badge up. That is the safe direction to
      // fail in — it over-reports rather than losing something unseen.
      .catch(() => {})
  }, [comments, subjectType, subjectId, mutateGlobal])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType, subjectId, body: text }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error ?? 'Could not post that comment.')
        return
      }
      setDraft('')
      void mutate()
    } catch {
      setError('Network problem — the comment was not posted.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await fetch(`/api/comments/${id}`, { method: 'DELETE' })
    void mutate()
  }

  const visible = comments ?? []

  return (
    <div
      className="flex flex-col gap-2 border-t border-white/[0.06] pt-2.5"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      {isLoading && <p className="font-mono text-[12px] text-white/25">Loading thread…</p>}

      {!isLoading && visible.length === 0 && (
        // An empty thread invites the first comment rather than looking broken.
        <p className="text-[13.5px] text-white/32">
          No notes yet. Anything you work out here stays attached to this item.
        </p>
      )}

      {visible.map((c) => {
        const kind = KIND_STYLE[c.authorKind]
        const mine = !!currentUserId && c.authorId === currentUserId

        if (c.deletedAt) {
          return (
            <p key={c.id} className="font-mono text-[13px] italic text-white/22">
              comment deleted · {relative(c.deletedAt)}
            </p>
          )
        }

        return (
          <div key={c.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[13.5px] font-semibold" style={{ color: kind.tone }}>
                {c.authorName}
              </span>
              {kind.label && (
                <span
                  className="rounded-[4px] px-1 font-mono text-[10.5px] font-bold tracking-[0.08em]"
                  style={{ color: kind.tone, background: `${kind.tone}22` }}
                >
                  {kind.label}
                </span>
              )}
              <span
                className="font-mono text-[11.5px] text-white/25"
                title={absolute(c.createdAt)}
              >
                {relative(c.createdAt)}
                {c.editedAt && ' · edited'}
              </span>
              {mine && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="ml-auto font-mono text-[11.5px] text-white/25 transition hover:text-red-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400/60"
                >
                  delete
                </button>
              )}
            </div>
            <CommentBody body={c.body} />
          </div>
        )
      })}

      <div className="mt-1 flex flex-col gap-1.5">
        <textarea
          ref={inputRef}
          value={draft}
          maxLength={MAX_COMMENT_LENGTH}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter sends; plain Enter keeps a newline, because ops
            // notes are usually more than one line.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Add a note… @mention to notify someone"
          aria-label="Add a comment"
          className="w-full resize-y rounded-[9px] border border-white/10 bg-white/5 px-2.5 py-2 text-[14.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-400/45"
        />
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-white/22">⌘↵ to send</span>
          {error && <span className="font-mono text-[12px] text-red-300">{error}</span>}
          <span className="flex-1" />
          <button
            type="button"
            disabled={!draft.trim() || busy}
            onClick={() => void send()}
            className="h-7 rounded-[8px] border border-cyan-400/40 bg-cyan-400/10 px-2.5 text-[13.5px] font-semibold text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-35"
          >
            {busy ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Comment counts for every card on a screen, in one request rather than one
 * per card.
 */
export interface ThreadBadges {
  /** Every live comment on the thread. */
  total: Record<string, number>
  /** Comments newer than your read watermark, excluding your own. */
  unread: Record<string, number>
  /** Of those, how many name you. */
  mentions: Record<string, number>
}

/**
 * @param subjectIds Narrows the query to specific subjects. Pass this when a
 * screen shows ONE thing — without it a single card would make the database
 * group over every run in the tenant to answer a question about itself.
 */
export function useThreadBadges(subjectType: SubjectType, subjectIds?: string[]): ThreadBadges {
  // Three distinct cases, and conflating the last two is a performance bug:
  //   undefined -> every subject of this kind (a screen full of cards)
  //   [id, ...] -> just these
  //   []        -> nothing to ask about yet; do not fetch at all
  // Falling back to "every subject" for an empty list is how a single card ends
  // up scanning the whole tenant while its own id is still loading.
  const key =
    subjectIds && subjectIds.length === 0
      ? null
      : `/api/comments/counts?subjectType=${subjectType}` +
        (subjectIds ? `&subjectIds=${subjectIds.map(encodeURIComponent).join(',')}` : '')

  const { data } = useSWR<{
    counts: Record<string, number>
    unread?: Record<string, number>
    mentions?: Record<string, number>
  }>(key, fetcher, { refreshInterval: 30000 })

  // A new comment anywhere invalidates these, and the shared stream already
  // carries that — no extra poll.
  const { mutate } = useSWRConfig()
  useEventListener(() => { if (key) void mutate(key) }, ['COMMENTS'])

  return {
    total: data?.counts ?? {},
    unread: data?.unread ?? {},
    mentions: data?.mentions ?? {},
  }
}

/** Totals only, for callers that do not show an unread state. */
export function useCommentCounts(subjectType: SubjectType): Record<string, number> {
  return useThreadBadges(subjectType).total
}

/**
 * Collapsed-by-default wrapper: status at a glance first, conversation second.
 *
 * Pressing `c` while the card is focused (or hovered) opens the thread — the
 * point of attaching conversation to a thing is that reaching it costs nothing.
 */
export function ThreadToggle({
  subjectType,
  subjectId,
  currentUserId,
  count,
  unread = 0,
  mentions = 0,
  shortcutScopeRef,
}: {
  subjectType: SubjectType
  subjectId: string
  currentUserId?: string
  count?: number
  /** Comments newer than this user's watermark, excluding their own. */
  unread?: number
  /** Of those, how many name this user. */
  mentions?: number
  /** Element that must contain focus for `c` to apply to this thread. */
  shortcutScopeRef?: React.RefObject<HTMLElement>
}) {
  const [open, setOpen] = useState(false)

  // Once opened, the thread marks itself read and the badge would flicker back
  // on until the counts refetch lands. Suppressing it locally on open keeps the
  // transition in one direction.
  const showUnread = !open && unread > 0

  useEffect(() => {
    if (!shortcutScopeRef) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return
      // Never steal the key from someone typing.
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      const scope = shortcutScopeRef.current
      if (!scope || !scope.matches(':hover') && !scope.contains(el)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutScopeRef])

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 font-mono text-[12px] text-white/35 transition hover:text-white/65 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {count && count > 0 ? `${count} note${count === 1 ? '' : 's'}` : 'Add a note'}

        {/* Two states, not one. A mention is someone asking YOU for something
            and gets a filled marker; plain new activity gets a dot. Both carry
            text as well as colour — a badge that is only a colour says nothing
            to a screen reader or to anyone who cannot separate these two. */}
        {showUnread && mentions > 0 && (
          <span
            className="rounded-[4px] border border-cyan-400/45 bg-cyan-400/15 px-1 font-mono text-[11px] font-bold text-cyan-200"
            title={`${unread} new, ${mentions} mentioning you`}
          >
            @{unread}
          </span>
        )}
        {showUnread && mentions === 0 && (
          <span className="flex items-center gap-1 text-cyan-300/85" title={`${unread} new`}>
            <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-cyan-300/85" />
            <span className="font-mono text-[11px]">{unread} new</span>
          </span>
        )}
        {showUnread && (
          <span className="sr-only">
            {mentions > 0
              ? `${unread} unread, ${mentions} mentioning you`
              : `${unread} unread`}
          </span>
        )}

        {!open && <span className="text-white/20">c</span>}
      </button>
      {open && (
        <Thread
          subjectType={subjectType}
          subjectId={subjectId}
          currentUserId={currentUserId}
          autoFocus
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
