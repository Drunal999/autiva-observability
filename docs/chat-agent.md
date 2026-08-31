# The room agent

A button in the team room that reads the day's chat and posts a summary back
into it, for whoever was away.

It is **off until you switch it on**, and switching it on costs money.

## Turning it on

```
ANTHROPIC_API_KEY=sk-ant-...
```

Locally in `.env`, and in the Vercel project for production. Nothing else
changes — the button notices and enables itself.

Get a key from `console.anthropic.com`. **A Claude subscription does not
include API access**; they are separate products with separate billing. This is
the single most common and most expensive misunderstanding about it.

## What it costs

`claude-haiku-4-5`, at $1 per million input tokens and $5 per million output.

A day of team chat is roughly 3,000–6,000 tokens in and a few hundred out, so
**one summary is under a cent** — call it a rupee. Pressed a few times a day by
three people, it is small change. The response is capped at 1,200 tokens so a
runaway answer cannot become a runaway bill, and every response reports its own
token usage so the cost is visible rather than hidden.

The endpoint is rate limited to six summaries a minute per team. That is not
about capacity; it is about a stuck button not spending your money.

## What "grows and learns with us" actually means

Worth being exact, because the phrase invites a wrong expectation.

**The model does not learn from your chats.** Nothing here trains anything.
Weights are fixed, and a conversation leaves no trace in them.

**What it has is memory.** Past summaries live in the room as messages, and each
new summary is handed the three most recent as context. So it knows what was
already decided, does not re-explain it, and can say "this follows on from
Tuesday". That continuity is supplied by us, not learned by it.

The distinction matters the first time somebody asks why it "forgot" something:
the answer will be that the thing was never in the context, not that it failed
to learn.

## How it behaves

- Summaries are posted as real messages with `authorKind: AGENT`, so they carry
  the AGENT label and tint. An entry that looks human but was written by a model
  is how bad decisions get made — the distinction is stored, not styled on.
- Its own summaries are **excluded** from the input. Feeding them back would
  have it summarising its own summary, drifting further from what anyone said
  with each pass.
- It is told to say when something was discussed but *not* settled. An invented
  decision in a summary teammates trust is the worst thing this can do.
- With no key it returns **503** — a capability that is off, not something
  broken — and the button says "summary · not configured" rather than failing
  when pressed.

## What it is not

It does not read your runs, calendar or approvals; only the room. It does not
post on its own — somebody presses the button. And it has no memory beyond the
summaries in the room, so deleting those deletes its history.
