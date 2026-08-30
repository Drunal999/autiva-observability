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
AUTIVA_URL=https://autiva-observability.vercel.app
AUTIVA_INGEST_TOKEN=<the token from step 1>
```

On Windows, set them so they survive a restart — a hook inherits Claude Code's
environment, and a variable exported in one terminal is not in it:

```
setx AUTIVA_URL "https://autiva-observability.vercel.app"
setx AUTIVA_INGEST_TOKEN "<your token>"
```

`setx` only affects newly launched processes, so restart Claude Code afterwards.

**3. Install the hooks:**

```
node scripts/install-hooks.mjs
```

It merges into `~/.claude/settings.json` rather than replacing it: your own
hooks and settings are left alone, it backs the file up first, and running it
twice is the same as running it once. `--dry-run` shows the result without
writing; `--remove` takes them out again.

### Three hooks, three meanings

| Hook | What it reports |
|---|---|
| `SessionStart` | the run appears, **RUNNING**, before any work |
| `Stop` | steps so far, **still RUNNING** — fires after every turn |
| `SessionEnd` | the final state, with an end time, settling to **SUCCESS** |

`Stop` firing every turn is what makes the fleet live: a teammate's card updates
while they are working, not once they have finished and gone. Treating `Stop` as
the end would mark somebody finished several times a session and show them idle
mid-task.

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

**Who can sign in at all.** `ALLOWED_GITHUB_LOGINS` is the guest list, and it
fails closed — an empty one denies everyone. It is currently drunal999,
hardikwork05 and adityamondal-ai-spec. Adding somebody means adding them there
(in `.env` locally, and in the Vercel project for production); nothing else
grants access.

**Re-reporting is safe.** The run key is the session id, so a session that
reports twice updates one run rather than creating two. Spans are replaced
wholesale, not appended — a re-report carries the whole session, so appending
would double every step.

**The SAMPLE DATA badge stays until the seeds go.** Real runs arriving does not
make the seeded ones real. When you want the dashboard to show only genuine
work, clear the seeded rows and set `NEXT_PUBLIC_SAMPLE_DATA=false`.

**Timeouts differ on purpose.** `SessionStart` and `Stop` give up after 2.5s —
they repeat, so a missed one costs nothing and a hook must never keep you
waiting. `SessionEnd` waits 10s, because it has no next turn: abandon it and the
run stays `RUNNING` forever and the fleet shows that person still working days
later.

## What this does not do yet

**A session that dies without `SessionEnd`** — a crash, a closed laptop — stays
`RUNNING`, and the fleet keeps showing that person as working until their next
session. Nothing sweeps stale runs.

**It reports what happened, not what was learned.** The "shared knowledge" half
of the idea — decisions, gotchas, why something was done — is what the comment
threads and `@mentions` are for, and nothing writes those automatically.

**Projects are labels, not relations.** `Run.project` is the working directory's
name. Good enough to filter and group by; it does not tie a run to a Module, so
per-project latency targets are not a thing yet.
