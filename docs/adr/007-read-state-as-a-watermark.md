# 007 — Thread read-state is a watermark, not a receipt

**Status:** Accepted

## Decision

`ThreadRead` stores **one row per (tenant, user, thread)** with a single
`lastReadAt` timestamp. Everything authored at or before that instant has been
seen.

It is not one row per comment per user.

## Why not read receipts

A receipt table is `users x comments` rows. At one internal tenant that is
already tens of thousands of rows to answer a question no interface asks at
that resolution — nothing in this product needs to know *which* comments you
read, only whether anything has happened since you last looked. A watermark
answers that in one row per thread you have actually opened.

The cost is that "mark this one comment unread" becomes impossible. That
feature does not exist and is not planned; if it ever is, this decision is what
has to change first.

## Why not reuse `Notification`

`Notification` already has a `readAt`, so reusing it looks cheaper. It cannot
work: a `Notification` row only exists when someone **mentions you**. It can
never answer "is there new activity in a thread I am merely watching", which is
the common case. The two coexist and mean different things:

- `Notification.readAt` — you have seen the thing that named you.
- `ThreadRead.lastReadAt` — you have seen the conversation.

## A missing row means UNREAD

This is the part worth stating loudly, because the opposite is the tempting
default.

If no `ThreadRead` row exists, the entire thread counts as unread. That is the
honest reading — you have not opened it. The consequence is that **every
pre-existing thread lights up the first time this ships**, and that is correct
rather than a bug to backfill away. Backfilling `lastReadAt = now` for existing
threads would silently mark as read a pile of comments nobody has looked at,
which is the exact failure the badge exists to prevent.

## Invariants

These are enforced in `src/lib/ops/threadRead.ts` and tested:

1. **The watermark only ever moves forward.** Opening a stale view of a thread
   must not un-read comments you have already seen.
2. **`upTo` is clamped to now.** It is client-supplied, and an unclamped future
   value would mute a thread permanently.
3. **The client sends the newest comment it actually rendered**, not "now", so
   a comment landing mid-render stays unread.
4. **Your own comments never count as unread**, and posting one marks the
   thread read.
5. **A failed mark-read leaves the badge up.** Over-reporting is the safe
   direction to fail in; the alternative loses something unseen.

The unique constraint `(tenantId, userId, subjectType, subjectId)` is the
arbiter for a concurrent first-open in two tabs — the loser catches P2002 and
has nothing to move.

## Counting unread

Unread cannot be a `groupBy`: the cut-off is a **different instant for every
thread**. It is a single `LEFT JOIN` from `Comment` to `ThreadRead` in
`/api/comments/counts`, returning totals, unread and mention counts for a whole
screen in one round trip rather than one request per card.

That route is the only raw SQL in the codebase. It is parameterised through
`Prisma.sql` and was verified against real Postgres — own and deleted comments
excluded, mentions counted, a comment posted after the watermark correctly
reappearing.

## Two badge states, deliberately

A mention renders as a filled `@n` marker; ordinary new activity renders as a
dot. A mention is someone asking **you** for something and must not look like
background chatter. Both carry text and an `sr-only` label, so neither is
communicated by colour alone.

## Known gap

`TraceView` shows a thread but no unread badge. Badges there would need counts
for every run in the tenant — an unbounded query for one card. If run threads
need badges, the counts route needs a subject-id filter first.
