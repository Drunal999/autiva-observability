'use client'

import { OpsShell } from '@/components/ops/OpsShell'
import { TerminalView } from '@/components/ops/TerminalView'

export default function TerminalPage() {
  return (
    <OpsShell>
      <TerminalView />
    </OpsShell>
  )
}
