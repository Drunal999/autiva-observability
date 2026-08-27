'use client'

import { OpsShell } from '@/components/ops/OpsShell'
import { StatesView } from '@/components/ops/StatesView'

export default function StatesPage() {
  return (
    <OpsShell>
      <StatesView />
    </OpsShell>
  )
}
