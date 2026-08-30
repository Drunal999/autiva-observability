# Pooling three people's work into one dashboard

The goal: each of you keeps working exactly as you do now, and the dashboard
fills up with what actually happened — so you can see each other's progress
without asking.

## What changed

The fleet, the trace waterfall and the calendar's past layer were always able to
*show* agent work. Nothing could *report* any. Every run, span and rupee came
from `prisma/seed-agent-ops.mjs`, which is why the **SAMPLE DATA** badge is
nailed to the header.

There is now a door: `POST /api/ingest/runs`. A Claude Code session goes in, and
a Run comes out that every existing screen already knows how to draw.

| Claude Code | Dashboard |
|---|---|
| a session | a **Run** — summary, tokens, start/end, status |
| each tool call | a **Span** — Bash → `SHELL`, Read/Write/Edit → `FILE`, Task → `SUBAGENT`, everything else → `TOOL` |
| the person | an **Agent**, one per teammate, created on first report |

So the fleet becomes a list of *people working* rather than fictional processes,
and clicking one opens the actual steps they took.

## Setup, once per person

**1. Get your token** (whoever runs the dashboard does this):

```
node scripts/issue-ingest-token.mjs <github-handle>
```

The handle has to exist — that means they've signed in at least once, or been
seeded with `scripts/add-teammate.mjs`.

**2. Set two environment variables** on that person's machine:

```
AUTIVA_URL=http://localhost:3000
AUTIVA_INGEST_TOKEN=<the token from step 1>
```

**3. Add the hook** to their `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node C:/absolute/path/to/Dashboard/scripts/report-session.mjs"
          }
        ]
      }
    ]
  }
}
```

Use an absolute path — the hook runs from whatever directory the session is in,
not from the dashboard.

**Check it works:** run the script by hand with `--verbose`. It prints why
nothing arrived instead of staying quiet.

```
echo '{"session_id":"test-1"}' | node scripts/report-session.mjs --verbose
```

## Things worth knowing before you rely on it

**The reporter fails silently, deliberately.** If the dashboard is down, a
laptop is offline, or a token is wrong, it exits 0 and says nothing. A script
that reports on your work must never break the work. `--verbose` is how you find
out why something is missing.

**The token is a password.** Anyone holding another person's token can post runs
as them. That is the same trust model as the rest of this deployment — there is
no authorization model yet (ADR-002) — and it is fine for three people who
already trust each other. It would not be fine for strangers. Rotating
`INGEST_SECRET` revokes everyone's token at once.

**`AUTIVA_URL` must be reachable from each machine.** On `localhost:3000` only
the person running the dashboard reports anything. For all three of you to
share one fleet, it has to be hosted somewhere all three can reach.

**Re-reporting is safe.** The run key is the session id, so a session that
reports twice updates one run rather than creating two. Spans are replaced
wholesale, not appended — a re-report carries the whole session, so appending
would double every step.

**The SAMPLE DATA badge stays until the seeds go.** Real runs arriving does not
make the seeded ones real. When you want the dashboard to show only genuine
work, clear the seeded rows and set `NEXT_PUBLIC_SAMPLE_DATA=false`.

## What this does not do yet

The hook fires at the **end** of a session, so the fleet shows work after the
fact rather than live. A `SessionStart` hook posting the same session id would
make the card go `RUNNING` while somebody is actually working — the ingest path
already supports it (a report with no `endedAt` is `RUNNING`); nothing calls it
yet.

It also reports *what happened*, not *what was learned*. The "shared knowledge"
half of the idea — decisions, gotchas, why something was done — is what the
comment threads and `@mentions` are for, and nothing writes those automatically.
