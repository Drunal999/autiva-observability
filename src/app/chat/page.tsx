'use client'

import { useSession } from 'next-auth/react'
import { OpsShell } from '@/components/ops/OpsShell'
import { ChatView } from '@/components/ops/ChatView'

export default function ChatPage() {
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string } | undefined)?.id
  return (
    <OpsShell>
      <ChatView currentUserId={currentUserId} />
    </OpsShell>
  )
}
