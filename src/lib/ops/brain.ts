'use client'
import { useEffect, useState } from 'react'

// Served by AUTIVA's brain/server.mjs, which keeps the ElevenLabs key and the computer permissions local.
// ponytail: localhost only; production needs the brain behind the tenant API (shared-brain PRD, acceptance 5).
export const BRAIN_URL = 'http://127.0.0.1:8095'

/**
 * Where the shared brain stands from this browser: 'remote' when the page is
 * not on the owner's machine (the brain never leaves it), otherwise whether
 * brain/server.mjs answered. null while checking.
 */
export function useBrainStatus(): 'remote' | 'online' | 'offline' | null {
  const [status, setStatus] = useState<'remote' | 'online' | 'offline' | null>(null)
  useEffect(() => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) { setStatus('remote'); return }
    // An opaque no-cors response still proves something is listening; a network error proves nothing is.
    fetch(BRAIN_URL, { mode: 'no-cors' }).then(() => setStatus('online'), () => setStatus('offline'))
  }, [])
  return status
}
