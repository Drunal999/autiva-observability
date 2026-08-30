'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { OpsShell } from '@/components/ops/OpsShell'
import { TraceView } from '@/components/ops/TraceView'

/**
 * `?run=<ref>` selects which run to open.
 *
 * This page ignored the parameter entirely and always rendered TraceView's
 * default ref — a seeded run. Every "open this run" link in the product
 * therefore led to the same fixed trace: the calendar builds
 * `/trace?run=${r.ref}` for every run bar on the past layer, and all of them
 * landed on the same place regardless of what was clicked.
 *
 * It matters more now that runs are real: following a teammate's session from
 * the fleet or the calendar is the point of pooling work in one dashboard.
 */
function TracePageInner() {
  const runRef = useSearchParams().get('run')
  return <TraceView {...(runRef ? { runRef } : {})} />
}

export default function TracePage() {
  return (
    <OpsShell>
      {/* useSearchParams needs a Suspense boundary, or the whole route opts out
          of static rendering at build time. */}
      <Suspense fallback={null}>
        <TracePageInner />
      </Suspense>
    </OpsShell>
  )
}
