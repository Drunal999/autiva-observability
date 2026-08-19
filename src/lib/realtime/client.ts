'use client'

import { useEffect, useRef, useState } from 'react'
import type { BoardEvent } from './bus'
import type { Task } from '@/types/task'

export type RealtimeConnectionState = 'connecting' | 'connected' | 'disconnected'

type Listener = (event: BoardEvent) => void

let source: EventSource | null = null
let connectionState: RealtimeConnectionState = 'connecting'
const eventListeners = new Set<Listener>()
const stateListeners = new Set<(state: RealtimeConnectionState) => void>()

function setConnectionState(next: RealtimeConnectionState) {
  connectionState = next
  stateListeners.forEach((listener) => listener(next))
}

// One EventSource per browser tab, shared by every component that calls
// useBoardEvents/useRealtimeConnectionState — mirrors the old Pusher
// client's module-level singleton so we don't open a redundant HTTP
// connection per component.
function ensureConnection(): void {
  if (source || typeof window === 'undefined') return

  source = new EventSource('/api/events')
  source.onopen = () => setConnectionState('connected')
  // The browser's EventSource auto-reconnects after an error unless the
  // connection was closed deliberately — "connecting" reflects that retry,
  // not a permanent failure.
  source.onerror = () => setConnectionState('connecting')
  source.onmessage = (message: MessageEvent<string>) => {
    try {
      const event = JSON.parse(message.data) as BoardEvent
      eventListeners.forEach((listener) => listener(event))
    } catch {
      // malformed frame (e.g. a stray heartbeat comment) — ignore
    }
  }
}

export function useBoardEvents(handlers: {
  onCreated?: (task: Task) => void
  onUpdated?: (task: Task) => void
  onDeleted?: (id: string) => void
}): void {
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    ensureConnection()
    const listener: Listener = (event) => {
      if (event.type === 'task-created') handlersRef.current.onCreated?.(event.payload as Task)
      if (event.type === 'task-updated') handlersRef.current.onUpdated?.(event.payload as Task)
      if (event.type === 'task-deleted') handlersRef.current.onDeleted?.(event.payload.id)
    }
    eventListeners.add(listener)
    return () => {
      eventListeners.delete(listener)
    }
  }, [])
}

export function useRealtimeConnectionState(): RealtimeConnectionState {
  const [state, setState] = useState(connectionState)

  useEffect(() => {
    ensureConnection()
    setState(connectionState)
    stateListeners.add(setState)
    return () => {
      stateListeners.delete(setState)
    }
  }, [])

  return state
}
