'use client'

import { OpsShell } from '@/components/ops/OpsShell'
import { ApprovalsView } from '@/components/ops/ApprovalsView'

export default function ApprovalsPage() {
  return (
    <OpsShell>
      <ApprovalsView />
    </OpsShell>
  )
}
