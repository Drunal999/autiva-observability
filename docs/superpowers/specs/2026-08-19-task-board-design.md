# Task & Assignment Board — Design Spec

**Phase 1 of 8** in the Internal Team Dashboard project. This is the foundation
sub-project; GitHub activity tracking, task-linked chat, notifications,
analytics, the integration hub, the AI agent activity panel, and client demo
mode are separate specs that build on top of this one, in that order.

## Context

Four-person internal team building a shared workspace to track who's working
on what. Once proven internally, a sanitized version becomes the flagship
demo on the company website. This phase delivers a working Kanban task board
with live sync across teammates and lightweight, muteable feedback
animations/sounds on task-state changes.

## Goals

- Any of the 4 team members can create, assign, and update tasks
- Task status changes are visible to everyone within seconds, without a manual refresh
- Task completion, due-soon/overdue, and staleness are communicated through short visual/audio cues, not just text
- Runs entirely on free-tier infrastructure (Vercel, Neon, Pusher, GitHub OAuth)
- Codebase and patterns are simple enough to extend cleanly in the next 7 sub-projects

## Non-Goals (deferred to later specs)

- GitHub commit/PR activity feed
- Task-linked comment threads / chat
- Notifications & @mentions
- Progress/analytics dashboards
- Integration hub (email, calendar, etc.)
- Client-facing demo mode with sample data
- Live AI agent activity panel

## Architecture

- **Framework**: Next.js 14 (App Router, TypeScript), deployed on Vercel with auto-deploy from GitHub
- **Database**: Neon Postgres (serverless, free tier), accessed via Prisma ORM
- **Auth**: NextAuth.js, GitHub OAuth provider only — team members sign in with their existing GitHub accounts. This also establishes user identity ahead of phase 2's commit/PR linking.
- **Data fetching**: SWR on the client, polling/revalidating every ~15–20s and on window focus, as a fallback under realtime
- **Realtime**: Pusher Channels (free tier: 200k messages/day, 100 concurrent connections). API routes emit a Pusher event after each successful task create/update/delete; clients subscribed to a shared board channel mutate their local SWR cache on receipt. If the socket drops, the app falls back silently to SWR polling until it reconnects. The same channel is intended to carry GitHub activity events in phase 2.
- **Styling/animation**: Tailwind CSS, Framer Motion for transitions/animations, native `<audio>` for sound cues
- **Scheduled checks**: Vercel Cron (free tier) runs periodically to flag tasks that just crossed their due date, so the overdue cue fires even when no one has the board open at that moment

## Data Model

```prisma
model User {
  id        String   @id @default(cuid())
  githubId  String   @unique
  name      String
  avatarUrl String?
  email     String?  @unique
  muteSounds Boolean @default(false)
  tasks     Task[]
  createdAt DateTime @default(now())
}

model Task {
  id          String     @id @default(cuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    Priority   @default(MED)
  assignee    User?      @relation(fields: [assigneeId], references: [id])
  assigneeId  String?
  dueDate     DateTime?
  overdueFlaggedAt DateTime? // set by the cron job the moment a task is first detected overdue
  lastStatusChangeAt DateTime @default(now()) // drives the "stale/incomplete" nudge
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

enum Priority {
  LOW
  MED
  HIGH
}
```

## Features

### Kanban board
- Three columns: To Do / In Progress / Done
- Drag-and-drop between columns updates `status` (and `lastStatusChangeAt`)
- Each card shows: title, assignee avatar, due date, priority
- Click a card to open a detail view for editing title/description/assignee/due date/priority, or deleting the task

### Task CRUD & assignment
- Any team member can create a task and assign it to any of the 4 members (including themselves)
- Assignment and edits are available to any team member (no per-task ownership/permissions in v1 — small trusted team)

## Interactive tools: animations & sounds

- **Completion**: moving a task to Done triggers a checkmark/confetti burst (Framer Motion) plus a short (<1s) success chime
- **Due soon / overdue**: card border/badge shifts to amber as the due date approaches, red once overdue. The overdue transition is detected either client-side (on load/poll) or by the Vercel Cron job, which sets `overdueFlaggedAt` — this guarantees the animation/sound fires for whoever next views the board, even if no one was looking at the exact moment it went overdue
- **Incomplete/stale**: a task with no status change in ~3 days (`lastStatusChangeAt`) gets a quiet visual nudge (subtle border pulse) — deliberately silent, to avoid alert fatigue in a shared space
- **Muting**: every sound respects a per-user `muteSounds` flag (stored on `User`, toggleable from a settings menu); default is unmuted

## Error handling

- Task mutations (create/update/delete) apply optimistically in the UI; on API failure, the change is rolled back and a toast error is shown
- Pusher connection loss is silent to the user — the app just relies on SWR polling until reconnected
- Auth failures redirect to the standard NextAuth sign-in page

## Testing

- **Unit/component**: Vitest + React Testing Library, covering task card rendering, status transitions, and animation trigger conditions
- **E2E**: one Playwright smoke test — sign in, create a task, assign it, drag it to Done, assert the completion animation/sound trigger fires
- Pusher is mocked in automated tests; realtime delivery is verified manually via the Pusher dashboard during development

## Deployment

- Repo hosted on GitHub (private, under the team's account/org), connected to Vercel for auto-deploy on push to `main`
- Neon Postgres provisioned via Vercel's Neon integration (or directly, then wired via env vars)
- Environment variables: `DATABASE_URL`, `NEXTAUTH_SECRET`, `GITHUB_ID`/`GITHUB_SECRET` (OAuth app), `PUSHER_APP_ID`/`KEY`/`SECRET`/`CLUSTER`, `CRON_SECRET` (to authorize the Vercel Cron endpoint)

## Roadmap after this phase

Per the original build order: Live Activity Tracking (GitHub integration) →
Live AI Agent Activity Panel → Notifications & Mentions → Task-Linked Team
Chat → Progress & Analytics View → Integration Hub → Client-Facing Demo Mode.
Each gets its own brainstorming pass and spec once this foundation is live.
