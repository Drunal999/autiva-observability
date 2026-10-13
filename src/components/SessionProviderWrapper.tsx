'use client'

import { SessionProvider } from 'next-auth/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import { swrBatch } from '@/lib/ops/swrBatch'

export function SessionProviderWrapper({ children }: { children: ReactNode }) {
  return <SessionProvider><SWRConfig value={{ use: [swrBatch] }}>{children}</SWRConfig></SessionProvider>
}
