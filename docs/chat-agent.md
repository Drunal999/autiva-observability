# The room agent

A button in the team room that reads the day's chat and posts a summary back
into it, for whoever was away.

It is **off until you switch it on**, and switching it on costs money.

## Turning it on

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free    # optional
```

Locally in `.env`, and in the Vercel project for production. Nothing else
changes — the button notices and enables itself. Swapping models is an env
change, not a deploy.

## What it costs

Nothing, on the default model. `nvidia/nemotron-3.5-lightning:free` is
OpenRouter's free tier, and every response so far has reported `cost: 0`.

Free has a price, and it is paid in time and reliability rather than money:

- **It is slow.** This is a reasoning model — it thinks at length before
  answering. A four-line day measured **45–60 seconds**. A paid non-reasoning
  model would answer in two or three.
- **It queues.** Free tiers throttle when busy, and a 429 there means "wait",
  not "broken". The error says so.
- **It is close to the platform ceiling.** Vercel's Hobby plan kills a function
  at 60 seconds, and this regularly takes 54. The route sets `maxDuration = 60`
  and the request gives up at 55 so the failure is ours and explains itself
  rather than arriving as a bare gateway error — but on a long conversation
  this WILL sometimes run out of road. If it becomes annoying, the fix is a
  faster model in `OPENROUTER_MODEL`, not more waiting.

The response is capped at 4,000 tokens and the endpoint is rate limited to six
summaries a minute per team — habits worth keeping even while the bill is zero,
because the model behind that variable may not always be free.

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
- The model's **chain of thought is excluded** from the reply. Without that it
  arrives inside the message content, and the room would receive "Here's a
  thinking process: 1. Analyze User Input…" as though it were the summary.
- A budget that runs out mid-thought is reported with its numbers — how many
  tokens went on reasoning — because "the agent returned nothing" says only
  that something is wrong, while "spent 3,980 of 4,000 thinking" says what to
  change.

## What it is not

It does not read your runs, calendar or approvals; only the room. It does not
post on its own — somebody presses the button. And it has no memory beyond the
summaries in the room, so deleting those deletes its history.
