'use client'

import { OpsShell } from '@/components/ops/OpsShell'
import { MissionControlView } from '@/components/ops/MissionControlView'

export default function BoardPage() {
  return (
    <OpsShell>
      <MissionControlView />
    </OpsShell>
  )
}
