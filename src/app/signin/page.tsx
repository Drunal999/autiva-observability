'use client'
import { Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import styles from './signin.module.css'

/** The first screen anyone sees: the brand, one clear way in, and a plain reason if sign-in was refused. */
const ERRORS: Record<string, string> = {
  AccessDenied: 'This GitHub account isn’t on this workspace’s list. Ask the owner to add you.',
  OAuthCallback: 'GitHub didn’t finish signing you in. Please try again.',
  Default: 'Something went wrong signing in. Please try again.',
}

function SignIn() {
  const params = useSearchParams()
  const error = params.get('error')
  const callbackUrl = params.get('callbackUrl') || '/city'
  return <main className={styles.page}>
    <div className={styles.glow} aria-hidden="true" />
    <section className={`liquid-glass ${styles.card}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static transparent PNG */}
      <img src="/brand/autiva-full.png?v=2" alt="AUTIVA — Automation for a brighter tomorrow" className={styles.logo} />
      <h1>Your business, running itself</h1>
      <p>Automations that do the busywork, a city that shows them working, and an assistant you can just talk to.</p>
      {error && <p role="alert" className={styles.error}>{ERRORS[error] ?? ERRORS.Default}</p>}
      <button type="button" className={styles.github} onClick={() => signIn('github', { callbackUrl })}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5Z" /></svg>
        Continue with GitHub
      </button>
      <small>Only people invited to this workspace can sign in.</small>
    </section>
  </main>
}

export default function SignInPage() {
  return <Suspense><SignIn /></Suspense>
}
