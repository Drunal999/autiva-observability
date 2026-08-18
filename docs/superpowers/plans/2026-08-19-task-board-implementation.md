# Task & Assignment Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Kanban Task & Assignment Board — phase 1 of the Internal Team Dashboard — with GitHub login, realtime sync across the 4-person team, and animated/audio feedback on task-state changes.

**Architecture:** Next.js 14 App Router + TypeScript app on Vercel. Neon Postgres via Prisma for storage. NextAuth (GitHub OAuth) for login. Pusher Channels for realtime task-change broadcast, with SWR polling as a fallback. Framer Motion + native `<audio>` for the completion/overdue/stale feedback. Vercel Cron flags overdue tasks server-side.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Prisma, Neon Postgres, NextAuth.js, Pusher Channels (`pusher` + `pusher-js`), SWR, Framer Motion, @dnd-kit/core, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-task-board-design.md`

## Global Constraints

- Auth is GitHub OAuth only — no email/password (spec: Architecture)
- No per-task permissions — any of the 4 team members can edit/assign any task (spec: Task CRUD & assignment)
- Every sound must respect a per-user `muteSounds` flag; default unmuted (spec: Interactive tools)
- Stale/incomplete nudges are visual only, never audio (spec: Interactive tools)
- Realtime uses Pusher; SWR polling (~15–20s, revalidate-on-focus) is the fallback, not the primary path (spec: Architecture)
- Overdue detection must work even when no one has the board open — this requires the Vercel Cron job, not just client-side checks (spec: Interactive tools)
- All infrastructure must stay on free tiers: Vercel, Neon, Pusher (spec: Goals)

## Prerequisites (human setup — cannot be automated)

Before certain tasks can be fully verified end-to-end, these accounts/secrets must exist. Tasks that need them say so explicitly; until then, work proceeds against mocks.

1. **Neon Postgres project** → `DATABASE_URL`
2. **GitHub OAuth App** (Settings → Developer settings → OAuth Apps), callback URL `http://localhost:3000/api/auth/callback/github` for local dev → `GITHUB_ID`, `GITHUB_SECRET`
3. **NextAuth secret** → generate with `openssl rand -base64 32` → `NEXTAUTH_SECRET`
4. **Pusher app** (dashboard.pusher.com, free "Sandbox" plan) → `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, plus `NEXT_PUBLIC_PUSHER_KEY`/`NEXT_PUBLIC_PUSHER_CLUSTER` for the client
5. **Cron secret** → any random string → `CRON_SECRET`
6. **GitHub repo for this project** — the user has not yet decided **personal account vs. team/org** or **private vs. public**. Task 13 (deployment config) stops and asks for this decision before creating/pushing the repo. Default assumption until told otherwise: private, personal account.

---

## File Structure

```
Dashboard/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                       # Kanban board page (protected)
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── tasks/route.ts             # GET (list), POST (create)
│   │   │   ├── tasks/[id]/route.ts        # PATCH (update), DELETE
│   │   │   ├── user/settings/route.ts     # PATCH muteSounds
│   │   │   └── cron/flag-overdue/route.ts
│   ├── components/
│   │   ├── KanbanBoard.tsx
│   │   ├── TaskCard.tsx
│   │   ├── TaskDetailModal.tsx
│   │   └── CompletionAnimation.tsx
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── taskVisualState.ts
│   │   ├── sounds.ts
│   │   └── pusher/
│   │       ├── server.ts
│   │       └── client.ts
│   ├── types/
│   │   └── task.ts
│   └── middleware.ts
├── public/sounds/
│   └── success.mp3                        # sourced by human, see Task 6
├── e2e/
│   └── board-flow.spec.ts
├── vitest.config.ts
├── playwright.config.ts
├── vercel.json
├── .env.example
└── README.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx` (placeholder)
- Create: `.env.example`

**Interfaces:**
- Produces: a running Next.js dev server at `localhost:3000`; every later task builds inside `src/`.

- [ ] **Step 1: Scaffold the app**

```bash
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Answer "No" to any prompt about overwriting `docs/` (it already contains the spec/plan).

- [ ] **Step 2: Install remaining dependencies**

```bash
npm install prisma @prisma/client next-auth pusher pusher-js swr framer-motion @dnd-kit/core @dnd-kit/sortable
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

- [ ] **Step 3: Write `.env.example`**

```
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""
GITHUB_ID=""
GITHUB_SECRET=""
PUSHER_APP_ID=""
PUSHER_KEY=""
PUSHER_SECRET=""
PUSHER_CLUSTER=""
NEXT_PUBLIC_PUSHER_KEY=""
NEXT_PUBLIC_PUSHER_CLUSTER=""
CRON_SECRET=""
E2E_TEST_MODE=""
```

- [ ] **Step 4: Verify the scaffold builds and runs**

Run: `npm run build`
Expected: build succeeds with the default Next.js starter page.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, TypeScript, and dependencies"
```

---

## Task 2: Shared Types & Task Visual-State Logic

**Files:**
- Create: `src/types/task.ts`
- Create: `src/lib/taskVisualState.ts`
- Test: `src/lib/__tests__/taskVisualState.test.ts`

**Interfaces:**
- Produces:
  - `TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'`
  - `Priority = 'LOW' | 'MED' | 'HIGH'`
  - `Task` interface (wire shape, dates as ISO strings)
  - `CreateTaskInput`, `UpdateTaskInput` interfaces
  - `getTaskVisualState(task: Task, now?: Date): { dueBadge: 'none' | 'due-soon' | 'overdue', isStale: boolean }`
    - `dueBadge` is `'due-soon'` when `dueDate` is within 24h and not yet passed, `'overdue'` when `dueDate` has passed (or `overdueFlaggedAt` is set) and status isn't `DONE`, else `'none'`
    - `isStale` is `true` when `lastStatusChangeAt` is more than 3 days before `now` and status isn't `DONE`

- [ ] **Step 1: Write `src/types/task.ts`**

```typescript
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
export type Priority = 'LOW' | 'MED' | 'HIGH'

export interface TaskAssignee {
  id: string
  name: string
  avatarUrl: string | null
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  assignee: TaskAssignee | null
  assigneeId: string | null
  dueDate: string | null
  overdueFlaggedAt: string | null
  lastStatusChangeAt: string
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  description?: string
  assigneeId?: string
  dueDate?: string
  priority?: Priority
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  status?: TaskStatus
  assigneeId?: string | null
  dueDate?: string | null
  priority?: Priority
}
```

- [ ] **Step 2: Write the failing test for visual state**

```typescript
// src/lib/__tests__/taskVisualState.test.ts
import { describe, it, expect } from 'vitest'
import { getTaskVisualState } from '../taskVisualState'
import type { Task } from '@/types/task'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Test task',
    description: null,
    status: 'TODO',
    priority: 'MED',
    assignee: null,
    assigneeId: null,
    dueDate: null,
    overdueFlaggedAt: null,
    lastStatusChangeAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('getTaskVisualState', () => {
  const now = new Date('2026-08-19T12:00:00Z')

  it('returns none when there is no due date', () => {
    const task = makeTask()
    expect(getTaskVisualState(task, now).dueBadge).toBe('none')
  })

  it('returns due-soon when due within 24h', () => {
    const task = makeTask({ dueDate: new Date('2026-08-19T20:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).dueBadge).toBe('due-soon')
  })

  it('returns overdue when due date has passed and status is not DONE', () => {
    const task = makeTask({ dueDate: new Date('2026-08-18T12:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).dueBadge).toBe('overdue')
  })

  it('returns none when overdue but status is DONE', () => {
    const task = makeTask({ dueDate: new Date('2026-08-18T12:00:00Z').toISOString(), status: 'DONE' })
    expect(getTaskVisualState(task, now).dueBadge).toBe('none')
  })

  it('returns overdue when overdueFlaggedAt is set even without a future check', () => {
    const task = makeTask({ overdueFlaggedAt: new Date('2026-08-18T12:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).dueBadge).toBe('overdue')
  })

  it('flags stale when lastStatusChangeAt is more than 3 days old and not DONE', () => {
    const task = makeTask({ lastStatusChangeAt: new Date('2026-08-15T00:00:00Z').toISOString() })
    expect(getTaskVisualState(task, now).isStale).toBe(true)
  })

  it('does not flag stale when DONE regardless of age', () => {
    const task = makeTask({ lastStatusChangeAt: new Date('2026-08-01T00:00:00Z').toISOString(), status: 'DONE' })
    expect(getTaskVisualState(task, now).isStale).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/taskVisualState.test.ts`
Expected: FAIL — `taskVisualState` module not found.

- [ ] **Step 4: Implement `src/lib/taskVisualState.ts`**

```typescript
import type { Task } from '@/types/task'

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000
const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

export interface TaskVisualState {
  dueBadge: 'none' | 'due-soon' | 'overdue'
  isStale: boolean
}

export function getTaskVisualState(task: Task, now: Date = new Date()): TaskVisualState {
  const isDone = task.status === 'DONE'

  let dueBadge: TaskVisualState['dueBadge'] = 'none'
  if (!isDone) {
    if (task.overdueFlaggedAt) {
      dueBadge = 'overdue'
    } else if (task.dueDate) {
      const due = new Date(task.dueDate).getTime()
      const diff = due - now.getTime()
      if (diff <= 0) {
        dueBadge = 'overdue'
      } else if (diff <= DUE_SOON_WINDOW_MS) {
        dueBadge = 'due-soon'
      }
    }
  }

  const isStale =
    !isDone && now.getTime() - new Date(task.lastStatusChangeAt).getTime() > STALE_THRESHOLD_MS

  return { dueBadge, isStale }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/taskVisualState.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/types/task.ts src/lib/taskVisualState.ts src/lib/__tests__/taskVisualState.test.ts
git commit -m "feat: add shared task types and due/stale visual-state logic"
```

---

## Task 3: Prisma Schema & Client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

**Interfaces:**
- Produces: `prisma` singleton export from `src/lib/prisma.ts`, typed via generated Prisma Client (`User`, `Task`, `TaskStatus`, `Priority`).
- Consumes: nothing.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id         String   @id @default(cuid())
  githubId   String   @unique
  name       String
  avatarUrl  String?
  email      String?  @unique
  muteSounds Boolean  @default(false)
  tasks      Task[]
  createdAt  DateTime @default(now())
}

model Task {
  id                 String     @id @default(cuid())
  title              String
  description        String?
  status             TaskStatus @default(TODO)
  priority           Priority   @default(MED)
  assignee           User?      @relation(fields: [assigneeId], references: [id])
  assigneeId         String?
  dueDate            DateTime?
  overdueFlaggedAt   DateTime?
  lastStatusChangeAt DateTime   @default(now())
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt
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

- [ ] **Step 2: Write `src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 3: Validate the schema without a live database**

Create a local `.env` with a syntactically valid but non-connecting placeholder so Prisma can parse the datasource:

```bash
echo 'DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"' >> .env
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Generate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds, generates typed client into `node_modules/@prisma/client`.

- [ ] **Step 5: If `DATABASE_URL` from Prerequisite #1 is available, run the real migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `User` and `Task` tables in Neon. **If the real `DATABASE_URL` isn't available yet, skip this step and note it as outstanding** — later tasks that hit the database (Task 5 onward, real execution) are still testable via mocked Prisma calls until this is run.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/prisma.ts
git commit -m "feat: add Prisma schema and client singleton"
```

---

## Task 4: NextAuth (GitHub OAuth + Test-Only Credentials Provider) and Route Protection

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Test: `src/lib/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/prisma.ts` (Task 3)
- Produces: `authOptions` (NextAuth config, default export target for the route handler), used by every protected route/component via `getServerSession(authOptions)`.

- [ ] **Step 1: Write the failing test for provider configuration**

```typescript
// src/lib/__tests__/auth.test.ts
import { describe, it, expect } from 'vitest'
import { authOptions } from '../auth'

describe('authOptions', () => {
  it('configures the GitHub provider', () => {
    const providerIds = authOptions.providers.map((p) => p.id)
    expect(providerIds).toContain('github')
  })

  it('includes the test-only credentials provider only when E2E_TEST_MODE is set', () => {
    const providerIds = authOptions.providers.map((p) => p.id)
    if (process.env.E2E_TEST_MODE === 'true') {
      expect(providerIds).toContain('e2e-test-login')
    } else {
      expect(providerIds).not.toContain('e2e-test-login')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/auth.test.ts`
Expected: FAIL — `../auth` module not found.

- [ ] **Step 3: Implement `src/lib/auth.ts`**

```typescript
import type { NextAuthOptions } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'

const providers: NextAuthOptions['providers'] = [
  GitHubProvider({
    clientId: process.env.GITHUB_ID ?? '',
    clientSecret: process.env.GITHUB_SECRET ?? '',
  }),
]

// Only enabled in E2E test runs — lets Playwright log in as a seeded
// user without a real GitHub OAuth round-trip. Never active in production.
if (process.env.E2E_TEST_MODE === 'true') {
  providers.push(
    CredentialsProvider({
      id: 'e2e-test-login',
      name: 'E2E Test Login',
      credentials: { githubId: { label: 'githubId', type: 'text' } },
      async authorize(credentials) {
        if (!credentials?.githubId) return null
        const user = await prisma.user.findUnique({ where: { githubId: credentials.githubId } })
        if (!user) return null
        return { id: user.id, name: user.name, email: user.email ?? undefined, image: user.avatarUrl }
      },
    })
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        const githubProfile = profile as { id: number; login: string; avatar_url?: string }
        await prisma.user.upsert({
          where: { githubId: String(githubProfile.id) },
          update: { name: user.name ?? githubProfile.login, avatarUrl: user.image ?? null },
          create: {
            githubId: String(githubProfile.id),
            name: user.name ?? githubProfile.login,
            avatarUrl: user.image ?? null,
            email: user.email ?? null,
          },
        })
      }
      return true
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (dbUser) {
          ;(session.user as typeof session.user & { id: string; muteSounds: boolean }).id = dbUser.id
          ;(session.user as typeof session.user & { id: string; muteSounds: boolean }).muteSounds =
            dbUser.muteSounds
        }
      }
      return session
    },
  },
  pages: { signIn: '/api/auth/signin' },
}
```

- [ ] **Step 4: Write the route handler**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

- [ ] **Step 5: Write `src/middleware.ts` to protect app routes**

```typescript
export { default } from 'next-auth/middleware'

export const config = {
  matcher: ['/', '/api/tasks/:path*', '/api/user/:path*'],
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/auth.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth src/middleware.ts src/lib/__tests__/auth.test.ts
git commit -m "feat: add NextAuth GitHub login, test-only credentials provider, and route protection"
```

---

## Task 5: Task API Routes (CRUD) with Pusher Broadcast

**Files:**
- Create: `src/lib/pusher/server.ts`
- Create: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/route.ts`
- Test: `src/app/api/tasks/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `Task`/`CreateTaskInput`/`UpdateTaskInput` types (Task 2), `authOptions` (Task 4)
- Produces:
  - `pusherServer.trigger(channel: string, event: string, data: unknown): Promise<unknown>` from `src/lib/pusher/server.ts`
  - `GET /api/tasks` → `Task[]`
  - `POST /api/tasks` (body: `CreateTaskInput`) → created `Task`, triggers Pusher event `'task-created'` on channel `'board'`
  - `PATCH /api/tasks/[id]` (body: `UpdateTaskInput`) → updated `Task`, triggers `'task-updated'`
  - `DELETE /api/tasks/[id]` → `{ id: string }`, triggers `'task-deleted'`

- [ ] **Step 1: Write `src/lib/pusher/server.ts`**

```typescript
import Pusher from 'pusher'

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID ?? '',
  key: process.env.PUSHER_KEY ?? '',
  secret: process.env.PUSHER_SECRET ?? '',
  cluster: process.env.PUSHER_CLUSTER ?? '',
  useTLS: true,
})

export const BOARD_CHANNEL = 'board'
```

- [ ] **Step 2: Write the failing test for the task routes**

```typescript
// src/app/api/tasks/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock('@/lib/pusher/server', () => ({
  pusherServer: { trigger: vi.fn() },
  BOARD_CHANNEL: 'board',
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher/server'
import { GET, POST } from '../route'

describe('/api/tasks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET returns all tasks', async () => {
    ;(prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1' }])
    const res = await GET()
    const body = await res.json()
    expect(body).toEqual([{ id: 't1' }])
  })

  it('POST creates a task and broadcasts task-created', async () => {
    const created = { id: 't2', title: 'New task' }
    ;(prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue(created)
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'New task' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body).toEqual(created)
    expect(pusherServer.trigger).toHaveBeenCalledWith('board', 'task-created', created)
  })

  it('POST rejects a missing title with 400', async () => {
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/api/tasks/__tests__/route.test.ts`
Expected: FAIL — `../route` module not found.

- [ ] **Step 4: Implement `src/app/api/tasks/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pusherServer, BOARD_CHANNEL } from '@/lib/pusher/server'
import type { CreateTaskInput } from '@/types/task'

export async function GET() {
  const tasks = await prisma.task.findMany({
    include: { assignee: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(tasks)
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreateTaskInput
  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      priority: body.priority ?? 'MED',
    },
  })

  await pusherServer.trigger(BOARD_CHANNEL, 'task-created', task)
  return NextResponse.json(task)
}
```

- [ ] **Step 5: Implement `src/app/api/tasks/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pusherServer, BOARD_CHANNEL } from '@/lib/pusher/server'
import type { UpdateTaskInput } from '@/types/task'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json()) as UpdateTaskInput
  const data: Record<string, unknown> = { ...body }
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  }
  if (body.status !== undefined) {
    data.lastStatusChangeAt = new Date()
    if (body.status !== 'DONE') {
      // leaving DONE or changing between non-DONE states clears any stale overdue flag
      data.overdueFlaggedAt = null
    }
  }

  const task = await prisma.task.update({ where: { id: params.id }, data })
  await pusherServer.trigger(BOARD_CHANNEL, 'task-updated', task)
  return NextResponse.json(task)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.task.delete({ where: { id: params.id } })
  await pusherServer.trigger(BOARD_CHANNEL, 'task-deleted', { id: params.id })
  return NextResponse.json({ id: params.id })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/app/api/tasks/__tests__/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/pusher/server.ts src/app/api/tasks
git commit -m "feat: add task CRUD API routes with Pusher broadcast"
```

---

## Task 6: Sounds/Mute Helper and User Settings Route

**Files:**
- Create: `src/lib/sounds.ts`
- Create: `src/app/api/user/settings/route.ts`
- Test: `src/lib/__tests__/sounds.test.ts`
- Note: `public/sounds/success.mp3` must be sourced by a human (e.g. a short CC0 chime from mixkit.co or freesound.org) — this task's code tolerates the file being absent (playback failure is caught, not thrown) so tests don't depend on it existing.

**Interfaces:**
- Produces: `playSound(name: 'success', muted: boolean): void` from `src/lib/sounds.ts`; `PATCH /api/user/settings` (body: `{ muteSounds: boolean }`) → updated user.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/sounds.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playSound } from '../sounds'

describe('playSound', () => {
  let playMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    playMock = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error jsdom doesn't implement audio playback
    global.Audio = vi.fn().mockImplementation(() => ({ play: playMock }))
  })

  it('plays the sound when not muted', () => {
    playSound('success', false)
    expect(playMock).toHaveBeenCalled()
  })

  it('does not play the sound when muted', () => {
    playSound('success', true)
    expect(playMock).not.toHaveBeenCalled()
  })

  it('does not throw if playback fails (e.g. missing file)', () => {
    playMock.mockRejectedValue(new Error('no source'))
    expect(() => playSound('success', false)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/sounds.test.ts`
Expected: FAIL — `../sounds` module not found.

- [ ] **Step 3: Implement `src/lib/sounds.ts`**

```typescript
const SOUND_PATHS = {
  success: '/sounds/success.mp3',
} as const

export type SoundName = keyof typeof SOUND_PATHS

export function playSound(name: SoundName, muted: boolean): void {
  if (muted) return
  try {
    const audio = new Audio(SOUND_PATHS[name])
    audio.play()?.catch(() => {
      // missing/blocked audio is non-fatal — the visual feedback still fires
    })
  } catch {
    // Audio unavailable in this environment (e.g. SSR) — no-op
  }
}
```

- [ ] **Step 4: Implement `src/app/api/user/settings/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json()) as { muteSounds: boolean }
  const userId = (session.user as { id: string }).id
  const user = await prisma.user.update({ where: { id: userId }, data: { muteSounds: body.muteSounds } })
  return NextResponse.json({ muteSounds: user.muteSounds })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/sounds.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/sounds.ts src/app/api/user/settings src/lib/__tests__/sounds.test.ts
git commit -m "feat: add mute-aware sound playback and user settings route"
```

---

## Task 7: TaskCard Component

**Files:**
- Create: `src/components/TaskCard.tsx`
- Test: `src/components/__tests__/TaskCard.test.tsx`

**Interfaces:**
- Consumes: `Task` type (Task 2), `getTaskVisualState` (Task 2)
- Produces: `<TaskCard task={Task} onClick={() => void} />`, a `data-testid="task-card"` root element with `data-due-badge` and `data-stale` attributes reflecting `getTaskVisualState`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/__tests__/TaskCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskCard } from '../TaskCard'
import type { Task } from '@/types/task'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Write the plan',
    description: null,
    status: 'TODO',
    priority: 'HIGH',
    assignee: { id: 'u1', name: 'Alex', avatarUrl: null },
    assigneeId: 'u1',
    dueDate: null,
    overdueFlaggedAt: null,
    lastStatusChangeAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('TaskCard', () => {
  it('renders the title and assignee name', () => {
    render(<TaskCard task={makeTask()} onClick={() => {}} />)
    expect(screen.getByText('Write the plan')).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  it('marks overdue tasks with data-due-badge="overdue"', () => {
    render(<TaskCard task={makeTask({ overdueFlaggedAt: new Date().toISOString() })} onClick={() => {}} />)
    expect(screen.getByTestId('task-card')).toHaveAttribute('data-due-badge', 'overdue')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<TaskCard task={makeTask()} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('task-card'))
    expect(onClick).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/TaskCard.test.tsx`
Expected: FAIL — `../TaskCard` module not found.

- [ ] **Step 3: Implement `src/components/TaskCard.tsx`**

```tsx
'use client'

import { getTaskVisualState } from '@/lib/taskVisualState'
import type { Task } from '@/types/task'

const badgeStyles: Record<string, string> = {
  none: '',
  'due-soon': 'border-amber-400 ring-1 ring-amber-300',
  overdue: 'border-red-500 ring-1 ring-red-400 animate-pulse',
}

export function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { dueBadge, isStale } = getTaskVisualState(task)

  return (
    <button
      type="button"
      data-testid="task-card"
      data-due-badge={dueBadge}
      data-stale={isStale}
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 shadow-sm transition ${badgeStyles[dueBadge]} ${
        isStale ? 'opacity-70' : ''
      }`}
    >
      <p className="font-medium">{task.title}</p>
      <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
        <span>{task.assignee?.name ?? 'Unassigned'}</span>
        <span>{task.priority}</span>
      </div>
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/TaskCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/TaskCard.tsx src/components/__tests__/TaskCard.test.tsx
git commit -m "feat: add TaskCard component with due/stale visual states"
```

---

## Task 8: KanbanBoard with SWR + Pusher Client Subscription

**Files:**
- Create: `src/lib/pusher/client.ts`
- Create: `src/components/KanbanBoard.tsx`
- Test: `src/components/__tests__/KanbanBoard.test.tsx`

**Interfaces:**
- Consumes: `TaskCard` (Task 7), `Task` type (Task 2)
- Produces:
  - `getPusherClient(): Pusher` (singleton) from `src/lib/pusher/client.ts`
  - `<KanbanBoard />` — fetches `GET /api/tasks` via SWR (key `'/api/tasks'`), subscribes to Pusher channel `'board'`, on `task-created`/`task-updated`/`task-deleted` mutates the SWR cache locally, renders three columns (`data-testid="column-TODO"`, `-IN_PROGRESS`, `-DONE`)

- [ ] **Step 1: Write `src/lib/pusher/client.ts`**

```typescript
import PusherClient from 'pusher-js'

let client: PusherClient | null = null

export function getPusherClient(): PusherClient {
  if (!client) {
    client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY ?? '', {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? '',
    })
  }
  return client
}

export const BOARD_CHANNEL = 'board'
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/components/__tests__/KanbanBoard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import useSWR from 'swr'

vi.mock('swr')
vi.mock('@/lib/pusher/client', () => ({
  getPusherClient: () => ({
    subscribe: () => ({ bind: vi.fn(), unbind_all: vi.fn() }),
    unsubscribe: vi.fn(),
  }),
  BOARD_CHANNEL: 'board',
}))

import { KanbanBoard } from '../KanbanBoard'

describe('KanbanBoard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders tasks into their status columns', async () => {
    ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        { id: 't1', title: 'A', status: 'TODO', priority: 'MED', assignee: null, dueDate: null, overdueFlaggedAt: null, lastStatusChangeAt: new Date().toISOString() },
        { id: 't2', title: 'B', status: 'DONE', priority: 'MED', assignee: null, dueDate: null, overdueFlaggedAt: null, lastStatusChangeAt: new Date().toISOString() },
      ],
      mutate: vi.fn(),
      isLoading: false,
    })

    render(<KanbanBoard />)

    await waitFor(() => {
      expect(screen.getByTestId('column-TODO')).toHaveTextContent('A')
      expect(screen.getByTestId('column-DONE')).toHaveTextContent('B')
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/KanbanBoard.test.tsx`
Expected: FAIL — `../KanbanBoard` module not found.

- [ ] **Step 4: Implement `src/components/KanbanBoard.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { TaskCard } from './TaskCard'
import { getPusherClient, BOARD_CHANNEL } from '@/lib/pusher/client'
import type { Task, TaskStatus } from '@/types/task'

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'DONE', label: 'Done' },
]

export function KanbanBoard() {
  const { data: tasks, mutate } = useSWR<Task[]>('/api/tasks', fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  })

  useEffect(() => {
    const pusher = getPusherClient()
    const channel = pusher.subscribe(BOARD_CHANNEL)

    channel.bind('task-created', (task: Task) => {
      mutate((current) => (current ? [...current, task] : [task]), { revalidate: false })
    })
    channel.bind('task-updated', (task: Task) => {
      mutate((current) => current?.map((t) => (t.id === task.id ? task : t)), { revalidate: false })
    })
    channel.bind('task-deleted', ({ id }: { id: string }) => {
      mutate((current) => current?.filter((t) => t.id !== id), { revalidate: false })
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(BOARD_CHANNEL)
    }
  }, [mutate])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => (
        <div key={col.status} data-testid={`column-${col.status}`} className="rounded-lg bg-gray-50 p-3">
          <h2 className="mb-3 font-semibold">{col.label}</h2>
          <div className="space-y-2">
            {(tasks ?? [])
              .filter((t) => t.status === col.status)
              .map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => {}} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/KanbanBoard.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add src/lib/pusher/client.ts src/components/KanbanBoard.tsx src/components/__tests__/KanbanBoard.test.tsx
git commit -m "feat: add KanbanBoard with SWR fetching and Pusher live updates"
```

---

## Task 9: Drag-and-Drop Status Updates with Optimistic Rollback

**Files:**
- Modify: `src/components/KanbanBoard.tsx`
- Test: `src/components/__tests__/KanbanBoard.dnd.test.tsx`

**Interfaces:**
- Consumes: `@dnd-kit/core` (`DndContext`, `useDraggable`, `useDroppable`), `KanbanBoard` (Task 8)
- Produces: dragging a `TaskCard` into a column calls `PATCH /api/tasks/[id]` with `{ status }`, applies the SWR cache update optimistically, and rolls back with the prior data if the request fails.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/__tests__/KanbanBoard.dnd.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import useSWR from 'swr'

vi.mock('swr')
vi.mock('@/lib/pusher/client', () => ({
  getPusherClient: () => ({ subscribe: () => ({ bind: vi.fn(), unbind_all: vi.fn() }), unsubscribe: vi.fn() }),
  BOARD_CHANNEL: 'board',
}))

import { KanbanBoard } from '../KanbanBoard'

const baseTask = {
  id: 't1',
  title: 'A',
  priority: 'MED',
  assignee: null,
  dueDate: null,
  overdueFlaggedAt: null,
  lastStatusChangeAt: new Date().toISOString(),
}

describe('KanbanBoard drag-and-drop', () => {
  let mutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mutate = vi.fn()
    global.fetch = vi.fn()
    ;(useSWR as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ ...baseTask, status: 'TODO' }],
      mutate,
      isLoading: false,
    })
  })

  it('rolls back the optimistic update when the PATCH request fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })
    render(<KanbanBoard />)

    const { moveTaskStatus } = await import('../KanbanBoard')
    await moveTaskStatus('t1', 'DONE', [{ ...baseTask, status: 'TODO' }] as never, mutate)

    await waitFor(() => {
      // first call is the optimistic update, second is the rollback to original data
      expect(mutate).toHaveBeenCalledTimes(2)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/KanbanBoard.dnd.test.tsx`
Expected: FAIL — `moveTaskStatus` is not exported.

- [ ] **Step 3: Add drag-and-drop and the exported `moveTaskStatus` helper to `src/components/KanbanBoard.tsx`**

Replace the file's contents with:

```tsx
'use client'

import { useEffect, useState } from 'react'
import useSWR, { type KeyedMutator } from 'swr'
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { TaskCard } from './TaskCard'
import { CompletionAnimation } from './CompletionAnimation'
import { getPusherClient, BOARD_CHANNEL } from '@/lib/pusher/client'
import { playSound } from '@/lib/sounds'
import type { Task, TaskStatus } from '@/types/task'

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'DONE', label: 'Done' },
]

export async function moveTaskStatus(
  taskId: string,
  status: TaskStatus,
  currentTasks: Task[],
  mutate: KeyedMutator<Task[]>
) {
  const optimistic = currentTasks.map((t) => (t.id === taskId ? { ...t, status } : t))
  await mutate(optimistic, { revalidate: false })

  const res = await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

  if (!res.ok) {
    await mutate(currentTasks, { revalidate: false })
    return { ok: false as const }
  }
  return { ok: true as const }
}

function DraggableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard task={task} onClick={onClick} />
    </div>
  )
}

function DroppableColumn({ status, label, tasks }: { status: TaskStatus; label: string; tasks: Task[] }) {
  const { setNodeRef } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} data-testid={`column-${status}`} className="rounded-lg bg-gray-50 p-3">
      <h2 className="mb-3 font-semibold">{label}</h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} onClick={() => {}} />
        ))}
      </div>
    </div>
  )
}

export function KanbanBoard({ muteSounds = false }: { muteSounds?: boolean }) {
  const { data: tasks, mutate } = useSWR<Task[]>('/api/tasks', fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  })
  const [celebrating, setCelebrating] = useState<string | null>(null)

  useEffect(() => {
    const pusher = getPusherClient()
    const channel = pusher.subscribe(BOARD_CHANNEL)
    channel.bind('task-created', (task: Task) => {
      mutate((current) => (current ? [...current, task] : [task]), { revalidate: false })
    })
    channel.bind('task-updated', (task: Task) => {
      mutate((current) => current?.map((t) => (t.id === task.id ? task : t)), { revalidate: false })
    })
    channel.bind('task-deleted', ({ id }: { id: string }) => {
      mutate((current) => current?.filter((t) => t.id !== id), { revalidate: false })
    })
    return () => {
      channel.unbind_all()
      pusher.unsubscribe(BOARD_CHANNEL)
    }
  }, [mutate])

  async function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id)
    const newStatus = event.over?.id as TaskStatus | undefined
    if (!newStatus || !tasks) return

    const previous = tasks
    const result = await moveTaskStatus(taskId, newStatus, tasks, mutate)
    if (result.ok && newStatus === 'DONE') {
      setCelebrating(taskId)
      playSound('success', muteSounds)
    }
    void previous
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.status}
            status={col.status}
            label={col.label}
            tasks={(tasks ?? []).filter((t) => t.status === col.status)}
          />
        ))}
      </div>
      {celebrating && (
        <CompletionAnimation taskId={celebrating} onComplete={() => setCelebrating(null)} />
      )}
    </DndContext>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/KanbanBoard.dnd.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Re-run Task 8's test to confirm no regression**

Run: `npx vitest run src/components/__tests__/KanbanBoard.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/KanbanBoard.tsx src/components/__tests__/KanbanBoard.dnd.test.tsx
git commit -m "feat: add drag-and-drop status updates with optimistic rollback"
```

---

## Task 10: CompletionAnimation Component

**Files:**
- Create: `src/components/CompletionAnimation.tsx`
- Test: `src/components/__tests__/CompletionAnimation.test.tsx`

**Interfaces:**
- Consumes: `framer-motion`
- Produces: `<CompletionAnimation taskId={string} onComplete={() => void} />` — renders a brief burst overlay (`data-testid="completion-animation"`) and calls `onComplete` after ~900ms.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/__tests__/CompletionAnimation.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CompletionAnimation } from '../CompletionAnimation'

describe('CompletionAnimation', () => {
  it('renders and calls onComplete after its duration', async () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<CompletionAnimation taskId="t1" onComplete={onComplete} />)

    expect(screen.getByTestId('completion-animation')).toBeInTheDocument()

    vi.advanceTimersByTime(1000)
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/CompletionAnimation.test.tsx`
Expected: FAIL — `../CompletionAnimation` module not found.

- [ ] **Step 3: Implement `src/components/CompletionAnimation.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function CompletionAnimation({ taskId, onComplete }: { taskId: string; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 900)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <AnimatePresence>
      <motion.div
        key={taskId}
        data-testid="completion-animation"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1.1 }}
        exit={{ opacity: 0, scale: 1.4 }}
        transition={{ duration: 0.6 }}
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      >
        <span className="text-6xl">✅</span>
      </motion.div>
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/CompletionAnimation.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/CompletionAnimation.tsx src/components/__tests__/CompletionAnimation.test.tsx
git commit -m "feat: add completion animation for tasks moved to Done"
```

---

## Task 11: TaskDetailModal (Create/Edit/Delete)

**Files:**
- Create: `src/components/TaskDetailModal.tsx`
- Test: `src/components/__tests__/TaskDetailModal.test.tsx`

**Interfaces:**
- Consumes: `CreateTaskInput`/`UpdateTaskInput`/`Task` types (Task 2)
- Produces: `<TaskDetailModal task={Task | null} onClose={() => void} onSaved={() => void} />`. `task === null` means "create" mode; otherwise "edit" mode with a delete button. Calls `POST /api/tasks` or `PATCH /api/tasks/[id]` / `DELETE /api/tasks/[id]`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/__tests__/TaskDetailModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskDetailModal } from '../TaskDetailModal'

describe('TaskDetailModal', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('shows a validation error and does not submit when title is empty', async () => {
    const onSaved = vi.fn()
    render(<TaskDetailModal task={null} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('POSTs a new task when title is provided', async () => {
    const onSaved = vi.fn()
    render(<TaskDetailModal task={null} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Ship it' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({ method: 'POST' })
      )
      expect(onSaved).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/TaskDetailModal.test.tsx`
Expected: FAIL — `../TaskDetailModal` module not found.

- [ ] **Step 3: Implement `src/components/TaskDetailModal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { Task } from '@/types/task'

export function TaskDetailModal({
  task,
  onClose,
  onSaved,
}: {
  task: Task | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setError(null)

    if (task) {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
    }
    onSaved()
  }

  async function handleDelete() {
    if (!task) return
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
        <label className="block text-sm font-medium" htmlFor="task-title">
          Title
        </label>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-3 w-full rounded border p-2"
        />
        <label className="block text-sm font-medium" htmlFor="task-description">
          Description
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-3 w-full rounded border p-2"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-between">
          <div>
            {task && (
              <button type="button" onClick={handleDelete} className="text-red-600">
                Delete
              </button>
            )}
          </div>
          <div className="space-x-2">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} className="rounded bg-blue-600 px-3 py-1 text-white">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/TaskDetailModal.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire the modal into `src/app/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TaskDetailModal } from '@/components/TaskDetailModal'

export default function Page() {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <main className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team Board</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded bg-blue-600 px-3 py-1 text-white"
        >
          New Task
        </button>
      </div>
      <KanbanBoard />
      {showCreate && (
        <TaskDetailModal task={null} onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}
    </main>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TaskDetailModal.tsx src/components/__tests__/TaskDetailModal.test.tsx src/app/page.tsx
git commit -m "feat: add task create/edit/delete modal and wire into board page"
```

---

## Task 12: Overdue-Flagging Cron Endpoint

**Files:**
- Create: `src/app/api/cron/flag-overdue/route.ts`
- Test: `src/app/api/cron/flag-overdue/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `pusherServer`/`BOARD_CHANNEL` (Task 5)
- Produces: `GET /api/cron/flag-overdue` — requires header `Authorization: Bearer ${CRON_SECRET}`; finds tasks with `dueDate < now`, `status != DONE`, `overdueFlaggedAt == null`, sets `overdueFlaggedAt = now` on each, and broadcasts `task-updated` per task.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/cron/flag-overdue/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock('@/lib/pusher/server', () => ({
  pusherServer: { trigger: vi.fn() },
  BOARD_CHANNEL: 'board',
}))

import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher/server'
import { GET } from '../route'

describe('/api/cron/flag-overdue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('rejects requests without the correct bearer token', async () => {
    const req = new Request('http://localhost/api/cron/flag-overdue')
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('flags newly-overdue tasks and broadcasts updates', async () => {
    ;(prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1' }, { id: 't2' }])
    ;(prisma.task.update as ReturnType<typeof vi.fn>).mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, overdueFlaggedAt: new Date() })
    )

    const req = new Request('http://localhost/api/cron/flag-overdue', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledTimes(2)
    expect(pusherServer.trigger).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/cron/flag-overdue/__tests__/route.test.ts`
Expected: FAIL — `../route` module not found.

- [ ] **Step 3: Implement `src/app/api/cron/flag-overdue/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pusherServer, BOARD_CHANNEL } from '@/lib/pusher/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const newlyOverdue = await prisma.task.findMany({
    where: { dueDate: { lt: new Date() }, status: { not: 'DONE' }, overdueFlaggedAt: null },
  })

  for (const task of newlyOverdue) {
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { overdueFlaggedAt: new Date() },
    })
    await pusherServer.trigger(BOARD_CHANNEL, 'task-updated', updated)
  }

  return NextResponse.json({ flagged: newlyOverdue.length })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/cron/flag-overdue/__tests__/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/flag-overdue
git commit -m "feat: add cron endpoint to flag newly-overdue tasks"
```

---

## Task 13: Deployment Configuration (Vercel, Cron Schedule, README)

**Files:**
- Create: `vercel.json`
- Create/Modify: `README.md`

**Interfaces:**
- Produces: a documented, deployable configuration. This task does not touch application code.

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/flag-overdue",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Vercel Cron authenticates its own requests via the `CRON_SECRET` env var check already in Task 12's handler — set `CRON_SECRET` in the Vercel project settings to match.

- [ ] **Step 2: STOP — confirm the GitHub repo decision with the user**

Before writing the deployment section of the README or creating/pushing a GitHub repo, ask the user (if not already answered): personal account or team/org, and private or public. Do not assume — this was left open in the spec's Prerequisites section. Once answered, use their choice in Step 3 below and when actually creating the repo (`gh repo create <owner>/<name> --private|--public`).

- [ ] **Step 3: Write `README.md`**

```markdown
# Internal Team Dashboard — Task & Assignment Board

Phase 1 of the Internal Team Dashboard. Kanban task board with GitHub login,
realtime sync, and animated/audio feedback on task-state changes.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in every value (see
   "Accounts you need" below).
2. `npm install`
3. `npx prisma migrate dev --name init`
4. `npm run dev` → http://localhost:3000

## Accounts you need

- **Neon** (neon.tech, free tier) — create a project, copy the pooled
  connection string into `DATABASE_URL`.
- **GitHub OAuth App** (github.com/settings/developers) — callback URL
  `http://localhost:3000/api/auth/callback/github` for local dev, and your
  production URL's equivalent once deployed. Copy Client ID/Secret into
  `GITHUB_ID`/`GITHUB_SECRET`.
- **Pusher** (dashboard.pusher.com, free "Sandbox" plan) — create an app,
  copy App ID/Key/Secret/Cluster into `PUSHER_*` and the client-facing
  `NEXT_PUBLIC_PUSHER_*` variables.
- **`NEXTAUTH_SECRET`** — generate with `openssl rand -base64 32`.
- **`CRON_SECRET`** — any random string; must match what you set in Vercel's
  project environment variables.

## Deploying

1. Push this repo to GitHub.
2. Import it in Vercel; add all `.env.example` variables (with production
   values — a new GitHub OAuth App or an updated callback URL, the same
   Neon/Pusher credentials) in Vercel's project settings.
3. Vercel reads `vercel.json` and schedules the overdue-flagging cron
   automatically on deploy.

## Testing

- `npx vitest run` — unit/component tests
- `npx playwright test` — E2E smoke test (see Task 14 in the implementation
  plan for how login is stubbed for this)
```

- [ ] **Step 4: Verify the production build still succeeds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add vercel.json README.md
git commit -m "docs: add Vercel cron config and setup/deployment README"
```

---

## Task 14: Playwright E2E Smoke Test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/board-flow.spec.ts`
- Modify: `package.json` (add `test:e2e` script)

**Interfaces:**
- Consumes: the `e2e-test-login` Credentials provider (Task 4), which requires `E2E_TEST_MODE=true` and a seeded `User` row with a known `githubId`
- Produces: one Playwright test proving the full user journey: sign in → create task → assign → drag to Done → completion animation appears.

- [ ] **Step 1: Write `playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: { E2E_TEST_MODE: 'true' },
  },
  use: { baseURL: 'http://localhost:3000' },
})
```

- [ ] **Step 2: Add the `test:e2e` script to `package.json`**

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Write `e2e/board-flow.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

// Requires: E2E_TEST_MODE=true, and a User row seeded with githubId
// "e2e-test-user" (e.g. via `npx prisma db seed`, added if not already
// present — see Task 3's schema). This bypasses real GitHub OAuth.
test('sign in, create a task, assign it, and complete it', async ({ page }) => {
  await page.goto('/api/auth/signin')
  await page.getByLabel('githubId').fill('e2e-test-user')
  await page.getByRole('button', { name: /sign in with e2e test login/i }).click()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Team Board' })).toBeVisible()

  await page.getByRole('button', { name: 'New Task' }).click()
  await page.getByLabel('Title').fill('E2E smoke task')
  await page.getByRole('button', { name: 'Save' }).click()

  const card = page.getByText('E2E smoke task')
  await expect(card).toBeVisible()

  const doneColumn = page.getByTestId('column-DONE')
  await card.dragTo(doneColumn)

  await expect(page.getByTestId('completion-animation')).toBeVisible()
})
```

- [ ] **Step 4: Run the E2E test**

Run: `E2E_TEST_MODE=true npm run test:e2e`
Expected: PASS. **Requires**: a live `DATABASE_URL` (Prerequisite #1) and a seeded `e2e-test-user` row — if these aren't available yet, this step is blocked and should be flagged as outstanding rather than skipped silently.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e package.json
git commit -m "test: add Playwright E2E smoke test for the core task flow"
```

---

## Self-Review Notes

- **Spec coverage**: Kanban board (Task 8–9), task CRUD/assignment (Task 5, 11), completion animation/sound (Task 10, 6, 9), due-soon/overdue/stale visuals (Task 2, 7), mute toggle (Task 6), realtime via Pusher with polling fallback (Task 5, 8), overdue cron (Task 12), error handling — optimistic rollback (Task 9), Pusher-drop silent fallback (inherent in SWR polling, Task 8), auth failure redirect (NextAuth default, Task 4), testing (unit tests throughout, E2E in Task 14), deployment (Task 13). All spec sections are covered.
- **Type consistency checked**: `Task`, `CreateTaskInput`, `UpdateTaskInput` (Task 2) are the only types referenced by API routes (Task 5, 12) and components (Task 7, 8, 9, 11) — no divergent shapes introduced.
- **Open dependency on the human**: Tasks 3, 4, 14 note explicitly where a real `DATABASE_URL`/GitHub OAuth app/seeded user is required and cannot be faked — these are the only steps that may need to pause for Prerequisites rather than fail outright.
