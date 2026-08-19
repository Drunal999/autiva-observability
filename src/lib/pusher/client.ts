'use client'

import { useEffect, useState } from 'react'
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

export type PusherConnectionState = 'connecting' | 'connected' | 'unavailable' | 'disconnected'

// Real connection health, not a decorative status light — reflects
// pusher-js's own `connection.state` so the UI never claims "Live" when
// the socket has actually dropped.
export function usePusherConnectionState(): PusherConnectionState {
  const [state, setState] = useState<PusherConnectionState>('connecting')

  useEffect(() => {
    const pusher = getPusherClient()
    setState(pusher.connection.state as PusherConnectionState)
    const handler = () => setState(pusher.connection.state as PusherConnectionState)
    pusher.connection.bind('state_change', handler)
    return () => {
      pusher.connection.unbind('state_change', handler)
    }
  }, [])

  return state
}
