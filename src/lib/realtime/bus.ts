import { EventEmitter } from 'events'

// Payloads are typed `unknown` here deliberately: server call sites publish
// Prisma's Task shape (Date objects, no resolved `assignee`), which only
// becomes the wire-shape `Task` from `@/types/task` (ISO date strings)
// once it round-trips through JSON — the client asserts that shape after
// parsing, the same way the old Pusher-based handlers did.
export type BoardEvent =
  | { type: 'task-created'; payload: unknown }
  | { type: 'task-updated'; payload: unknown }
  | { type: 'task-deleted'; payload: { id: string } }

const globalForBus = globalThis as unknown as { boardBus?: EventEmitter }

// Singleton across hot-reloads in dev, same pattern as src/lib/prisma.ts —
// otherwise each recompiled module would create its own emitter and SSE
// subscribers would stop receiving events published from a newer instance.
export const boardBus: EventEmitter = globalForBus.boardBus ?? new EventEmitter()
if (process.env.NODE_ENV !== 'production') {
  globalForBus.boardBus = boardBus
}
// Many SSE connections (one per open dashboard tab) all listen on the same
// emitter — raise the default 10-listener warning threshold.
boardBus.setMaxListeners(0)

const BOARD_EVENT = 'board-event'

export function publishBoardEvent(event: BoardEvent): void {
  boardBus.emit(BOARD_EVENT, event)
}

export function subscribeToBoardEvents(listener: (event: BoardEvent) => void): () => void {
  boardBus.on(BOARD_EVENT, listener)
  return () => boardBus.off(BOARD_EVENT, listener)
}
