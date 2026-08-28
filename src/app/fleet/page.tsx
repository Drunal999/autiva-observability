'use client'

import { OpsShell } from '@/components/ops/OpsShell'
import { FleetView } from '@/components/ops/FleetView'

export default function FleetPage() {
  return (
    <OpsShell>
      <FleetView />
    </OpsShell>
  )
}
