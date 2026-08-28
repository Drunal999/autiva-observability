# JARVIS Mission Control — Agent Operations Workspace
## Design brief (v3)

---

## MANDATE

Design the live operations workspace for a fleet of autonomous coding
agents: the surface an operator keeps open on a second monitor all day to
see what every agent is doing right now, why a run went wrong, and what
automations fired.

Reference bar — match the best surface for each problem, not a generic
"dashboard look":

| Surface            | Reference standard                                   |
|--------------------|------------------------------------------------------|
| Trace / run tree   | LangSmith run trees · Datadog flame graphs           |
| Execution history  | Temporal Workflow UI · Dagster run timeline          |
| Streaming logs     | Vercel build output · Modal container logs           |
| Terminal fidelity  | Warp · Ghostty                                       |
| Automation canvas  | n8n · Retool Workflows · GitHub Actions graph        |
| Time-series        | Grafana · Honeycomb                                  |
| Density & keyboard | Linear · Superhuman                                  |
| Command surface    | Raycast                                              |

The design goal is **operator confidence at a glance**: within 3 seconds of
looking, the operator knows whether the fleet is healthy, and within one
click knows exactly which span failed and why.

---

## DESIGN TOKENS — inherit, do not reinvent

    Canvas        #0a0a0c
    Surface       rgba(255,255,255,0.03)   Hairline  rgba(255,255,255,0.05)
    Raised        #0e0e12                  Overlay   #101015
    Foreground    #f5f5f7

    Accent        #22d3ee   interactive / active state ONLY
    Running       #22d3ee   Queued  #64748b   Blocked  #a78bfa
    Success       #34d399   Warn    #fbbf24   Error    #f87171

    Type          Plus Jakarta Sans 400–800  (human labels, headings)
                  JetBrains Mono 400–700     (machine output, IDs, time,
                                              counts, shortcuts, code)
    Radii         20 panel · 13 card · 11 control · 8 chip · 5 mono-tag
    Control       36px h / 11px r · chip 28px h / 8px r
    Contrast      no readable text below rgba(255,255,255,0.45)

Rule: proportional type is for humans, monospace is for machines. A number
that a machine produced is always mono. Never mix within a value.

---

## THE SEVEN SURFACES

### 1 · Fleet strip — "is anything on fire?"

A horizontal rail of agent cards, one per worker, always visible.

Anatomy: status dot · agent name · current step (truncating, live) ·
elapsed timer counting in mono · token burn · cost · a 12-bar micro
sparkline of the last 12 steps' durations.

- Status dot **breathes only while running** (2.4s ease-in-out opacity
  0.55→1). Idle, done, and failed dots are static. Motion means work.
- Elapsed timers tick at 1Hz and are `font-variant-numeric: tabular-nums`
  so digits never reflow.
- A failed agent gets a left rail in error red and sorts to the front.
- Acceptance: an operator can count healthy vs. unhealthy agents without
  reading a single word.

### 2 · Run trace — the flame graph

The core artifact. A span waterfall of one agent run: nested tool calls,
LLM calls, sub-agent spawns, file writes.

Anatomy: left gutter = collapsible span tree with type glyphs; right =
proportional duration bars against a shared time axis with tick marks in
mono; a critical-path highlight; a hairline "now" cursor for live runs.

- Depth is expressed by **indent + a 1px connector line**, never by hue.
- Bar color encodes span *type* at low saturation; **only failure is
  saturated**. A red bar must be the only red thing on screen.
- Live spans render open-ended with a 12px accent gradient fading to
  transparent at the leading edge — they grow, they do not pulse.
- Hover any span → a tooltip with exact ms, token count, and model.
- Acceptance: the slowest span in a 40-span run is identifiable in under
  two seconds without sorting.

### 3 · Live terminal — real, not decorative

A streaming console with genuine terminal fidelity.

- JetBrains Mono 12px / 1.55 line-height, `white-space: pre-wrap`,
  text **selectable and copyable**.
- ANSI-equivalent 16-color mapping onto the palette above. Timestamp
  gutter at rgba(255,255,255,0.28), right-aligned, tabular.
- Structured blocks interleave with raw output: a tool-call block (name,
  args, collapsed result), a unified diff block (+ green / − red at 10%
  backgrounds), a stack trace block (collapsed to 3 frames, expandable).
- A 7×15px block caret at the stream head, blinking at 1.06s square wave.
- New lines enter by translateY(2px)+fade over 90ms — a *nudge*, not a
  slide. Autoscroll pins to bottom, and detaches with a "Jump to live ↓"
  pill the moment the operator scrolls up.
- **Never** fake a progress bar for work of unknown duration. Indeterminate
  work gets a step label and an elapsed timer, nothing more.

### 4 · Automation canvas — the DAG

Triggers → conditions → actions, drawn as a node graph.

- Nodes: 13px radius, hairline border, trigger nodes get a left accent
  bar. Edges are 1.5px orthogonal paths with 6px corner radii — no
  bezier spaghetti, no crossing where a routing detour would avoid it.
- **Active edges animate a dash-offset flow** (`stroke-dasharray: 4 8`,
  1.2s linear infinite) and *only* while a packet is actually in flight.
  An idle DAG is completely still.
- A firing node gets a 240ms scale 1→1.03→1 and a ring flash. Once.
- Each node carries a run count and p95 duration in mono. A node that has
  failed in the last hour carries an error badge with the count.
- Acceptance: an idle canvas is visually silent; a firing automation is
  traceable end to end by following one moving dash pattern.

### 5 · Telemetry — graphs that earn their pixels

Four charts, no more. Each answers one operator question.

| Chart                    | Question                          | Form                  |
|--------------------------|-----------------------------------|-----------------------|
| Runs over time, stacked  | Are we shipping more or less?     | stacked bars, 24 buckets |
| Latency p50 / p95 / p99  | Is the tail getting worse?        | 3 lines, p99 emphasized  |
| Token burn & spend       | What is this costing?             | area + right axis in $  |
| Success rate             | Is quality degrading?             | line with a 95% threshold rule |

- Direct-label series at the line's end. **No legends** — a legend is a
  lookup table charging the reader for the designer's laziness.
- Gridlines at rgba(255,255,255,0.05), horizontal only. Y axes start at
  zero unless annotated otherwise.
- Axis labels, tick values and tooltips all in mono, tabular.
- The most recent bucket renders in accent; history in
  rgba(255,255,255,0.10). That single rule makes "now" findable in every
  chart without a title.
- On mount, bars grow from baseline over 420ms with a 12ms per-bar stagger
  — once, never on re-render.

### 6 · Workspace — what the agent actually touched

A file tree with live per-file status: reading (dim), writing (accent
shimmer on the row's left rail), modified (+n/−m in mono), committed
(green check). Beside it, the diff of the currently-focused file with
syntax highlighting and line numbers in the mono gutter.

- Writing state is a 1.8s linear shimmer on a 2px rail — the only
  looping animation permitted anywhere in the design, because it maps to
  genuinely continuous work.
- Acceptance: the operator can tell at a glance which files an agent has
  already touched this run.

### 7 · Command surface — ⌘K

Fuzzy across agents, runs, files and actions. Groups: Agents · Runs ·
Actions · Navigate. Actions must include: pause agent, retry run, retry
from span, kill run, open workspace, copy trace ID.

---

## MOTION SYSTEM

Motion is a language. Each entry below means exactly one thing, and
nothing animates without a meaning.

    Enter / reveal      160ms   cubic-bezier(0.16, 1, 0.3, 1)
    State change        200ms   cubic-bezier(0.4, 0, 0.2, 1)
    Layout / expand     280ms   cubic-bezier(0.4, 0, 0.2, 1)
    Exit                120ms   cubic-bezier(0.4, 0, 1, 1)
    Number roll         320ms   counters only, tabular-nums
    Stagger             12–24ms per item, capped at 8 items

Semantic bindings — a loop is permitted ONLY where the underlying work is
genuinely continuous:

    running status dot   →  2.4s breathe
    packet in flight     →  1.2s dash-offset flow
    file being written   →  1.8s rail shimmer
    terminal caret       →  1.06s blink

Everything else fires once, on a real state transition.

Honour `prefers-reduced-motion: reduce`: drop every loop to a static
state, collapse transitions to 0ms, keep opacity crossfades only.

Perception budget: any control must give feedback within 100ms; anything
past 400ms shows a determinate indicator or an elapsed timer. Never block
the whole surface on one panel's data — panels load independently.

---

## DATA MODEL — design against this shape

    Agent   { id, name, model, status: idle|running|blocked|failed|done,
              currentStep, startedAt, tokensIn, tokensOut, costUsd,
              stepDurationsMs[] }

    Run     { id, agentId, trigger: manual|cron|webhook|agent,
              status, startedAt, endedAt, spans[], exitCode }

    Span    { id, parentId, type: llm|tool|shell|file|subagent,
              name, startMs, durMs, status, tokens?, model?, error? }

    LogLine { runId, ts, stream: stdout|stderr|system,
              level: debug|info|warn|error, text, ansi? }

    Flow    { id, name, trigger, nodes[], edges[], runsToday,
              p95Ms, failures1h, enabled }

Populate with realistic content drawn from this repo — SSE reconnect
backoff, Prisma migration indexes, Playwright flakes, the overdue cron.
Sample values are fine and must be labelled as such; no fabricated
external facts.

---

## STATE MATRIX — every panel, all five

Expose as a `dataState` tweak so each can be reviewed without faking data:

    loading    skeletons at the real content's geometry — never a spinner
    streaming  partial content + live indicator, layout already settled
    ready      the happy path
    empty      designed: one line of cause, one action, nothing more
    error      what failed, when, the retry, and the trace ID to copy

A layout that shifts between `loading` and `ready` is a defect.

---

## FORBIDDEN

- Fake "AI is thinking…" shimmer, orbs, or brain iconography
- Confidence percentages or health scores with no defined formula
- Gradient-mesh backgrounds, glow for its own sake, particle fields
- Legends where direct labels fit
- Pie/donut charts for anything
- Decorative telemetry — a number on screen an operator would never act on
- Emoji as UI · Inter/Roboto · centered modals for detail
- `animate-pulse` as a general-purpose "look, activity!" effect
- Any looping animation not in the four semantic bindings above

---

## DELIVERABLE — artboards

    Fleet.dc.html       1600 × 1000   fleet strip + telemetry row + activity
    Trace.dc.html       1600 × 1000   run trace flame graph + span inspector
    Terminal.dc.html    1280 ×  900   live terminal + workspace file tree
    Automations.dc.html 1440 ×  900   automation DAG canvas + run history
    States.dc.html      1440 × 1100   the five states × four panel types
    Motion.dc.html      1100 ×  800   motion spec: durations, easings,
                                      semantic bindings, live demos
    Mobile.dc.html       390 ×  844   on-call view: fleet health + alerts

Interactive: agent selection, span expand/collapse, terminal tab switching,
DAG node focus, ⌘K palette, and the `dataState` / `density` / `accent`
tweaks.

Tweaks (exactly these — levers, never copy):
`accent` (color) · `density` (comfortable | compact) ·
`dataState` (loading | streaming | ready | empty | error) ·
`showActivityRail` (boolean)

---

## TECHNICAL CONSTRAINTS

Self-contained: no external scripts, no CDN, no network fetches. Google
Fonts is the sole permitted remote host. Charts are hand-authored inline
SVG. Animation is CSS keyframes and transitions plus `setInterval` driven
from the component's own state for simulated streaming — start intervals
in `componentDidMount`, clear them in `componentWillUnmount`.

Every value on screen must be traceable to the data model above. If a
number cannot be derived from it, it does not belong on the screen.
