'use client'

import dynamic from 'next/dynamic'

// react-day-picker formats its `data-day` values through a locale-aware date
// lib, and Node's ICU data does not always match the browser's — the server
// rendered `26/7/2026` where Chrome rendered `26/07/2026`, tripping a
// hydration mismatch on every day cell. A date picker has no SSR value
// (it is inert until the user interacts), so render it on the client only.
export const CalendarClient = dynamic(
  () => import('@/components/ui/calendar').then((m) => m.Calendar),
  {
    ssr: false,
    loading: () => <div className="h-[300px] w-full" aria-hidden="true" />,
  }
)
