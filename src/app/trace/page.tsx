'use client'

import { OpsShell } from '@/components/ops/OpsShell'
import { TraceView } from '@/components/ops/TraceView'

export default function TracePage() {
  return (
    <OpsShell>
      <TraceView />
    </OpsShell>
  )
}
