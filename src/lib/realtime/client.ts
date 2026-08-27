'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Task } from '@/types/task'

/**
 * ONE realtime connection per tab, shared by every consumer — this dashboard
 * and the city UI both import this hook rather than opening their own socket.
 * A new realtime feature subscribes to a CHANNEL here; it does not add a
 * parallel stack.
 */

export type EventChannel = 'BOARD' | 'COMMENTS' | 'FLEET' | 'RUNS' | 'APPROVALS' | 'SYSTEM'
export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface StreamEvent {
  id: string
  tenantId: string
  channel: EventChannel
  type: string
  payload: unknown
  at: string
}

/** A long-open tab must not grow without bound. */
const MAX_EVENTS = 500
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 30_000

type Listener = (event: StreamEvent) => void

let source: EventSource | null = null
let connectionState: RealtimeConnectionState = 'connecting'
let attempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let lastEventId: string | null = null

const eventListeners = new Set<Listener>()
const stateListeners = new Set<() => void>()
/** Ring buffer of recent events, newest last. */
let buffer: StreamEvent[] = []
const bufferListeners = new Set<() => void>()

function setConnectionState(next: RealtimeConnectionState) {
  if (connectionState === next) return
  connectionState = next
  stateListeners.forEach((l) => l())
}

function pushEvent(event: StreamEvent) {
  lastEventId = event.id
  // New array identity so useSyncExternalStore sees the change.
  buffer = buffer.length >= MAX_EVENTS
    ? [...buffer.slice(buffer.length - MAX_EVENTS + 1), event]
    : [...buffer, event]
  bufferListeners.forEach((l) => l())
  eventListeners.forEach((l) => l(event))
}

/**
 * Exponential backoff with jitter. EventSource reconnects on its own at a
 * fixed interval, which means every client in a fleet retries in the same
 * tick and stampedes a server that has just come back. Managing reconnection
 * manually lets the delay grow and the jitter spread the herd.
 */
function scheduleReconnect() {
  if (reconnectTimer) return
  const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt)
  const jitter = Math.random() * 250
  attempt += 1
  setConnectionState(attempt > 2 ? 'offline' : 'reconnecting')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay + jitter)
}

function connect(): void {
  if (typeof window === 'undefined' || source) return

  // Resume from the last event seen, so a reconnect replays the gap instead
  // of leaving a silent hole in the stream.
  const url = lastEventId
    ? `/api/events?since=${encodeURIComponent(lastEventId)}`
    : '/api/events'

  const es = new EventSource(url)
  source = es

  es.onopen = () => {
    attempt = 0
    setConnectionState('connected')
  }

  es.onmessage = (message: MessageEvent<string>) => {
    try {
      pushEvent(JSON.parse(message.data) as StreamEvent)
    } catch {
      // Malformed frame (or a stray comment) — ignore rather than tear down
      // a connection that is otherwise healthy.
    }
  }

  es.onerror = () => {
    // Close and reconnect ourselves so backoff is under our control.
    es.close()
    if (source === es) source = null
    scheduleReconnect()
  }
}

function ensureConnection(): void {
  if (typeof window !== 'undefined' && !source && !reconnectTimer) connect()
}

/** Test seam — module state would otherwise leak between tests. */
export function __resetRealtime() {
  source?.close()
  source = null
  attempt = 0
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  lastEventId = null
  buffer = []
  connectionState = 'connecting'
  eventListeners.clear()
  stateListeners.clear()
  bufferListeners.clear()
}

// ── Hooks ────────────────────────────────────────────────────────

/**
 * The shared stream. Both the dashboard and the city import this.
 *
 * @param channels Optional filter. Omit to receive everything.
 */
export function useEventStream(channels?: EventChannel[]): {
  events: StreamEvent[]
  state: RealtimeConnectionState
} {
  const events = useSyncExternalStore(
    (cb) => {
      bufferListeners.add(cb)
      ensureConnection()
      return () => bufferListeners.delete(cb)
    },
    () => buffer,
    () => buffer
  )

  const state = useSyncExternalStore(
    (cb) => {
      stateListeners.add(cb)
      ensureConnection()
      return () => stateListeners.delete(cb)
    },
    () => connectionState,
    () => 'connecting' as RealtimeConnectionState
  )

  if (!channels || channels.length === 0) return { events, state }
  return { events: events.filter((e) => channels.includes(e.channel)), state }
}

/** Imperative subscription, for consumers that react to events rather than render them. */
export function useEventListener(
  handler: (event: StreamEvent) => void,
  channels?: EventChannel[]
): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })

  useEffect(() => {
    ensureConnection()
    const listener: Listener = (event) => {
      if (channels && channels.length > 0 && !channels.includes(event.channel)) return
      ref.current(event)
    }
    eventListeners.add(listener)
    return () => {
      eventListeners.delete(listener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels?.join(',')])
}

export function useRealtimeConnectionState(): RealtimeConnectionState {
  const [state, setState] = useState(connectionState)
  useEffect(() => {
    ensureConnection()
    setState(connectionState)
    const l = () => setState(connectionState)
    stateListeners.add(l)
    return () => {
      stateListeners.delete(l)
    }
  }, [])
  return state
}

/**
 * Board compatibility. The task board predates channels; this is now a thin
 * wrapper over the shared stream rather than a second connection.
 */
export function useBoardEvents(handlers: {
  onCreated?: (task: Task) => void
  onUpdated?: (task: Task) => void
  onDeleted?: (id: string) => void
}): void {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEventListener((event) => {
    if (event.type === 'task-created') ref.current.onCreated?.(event.payload as Task)
    if (event.type === 'task-updated') ref.current.onUpdated?.(event.payload as Task)
    if (event.type === 'task-deleted') ref.current.onDeleted?.((event.payload as { id: string }).id)
  }, ['BOARD'])
}
