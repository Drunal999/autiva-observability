import { redirect } from 'next/navigation'

/**
 * The app opens on mission control.
 *
 * `/` used to render a separate, earlier dashboard with its own sidebar and
 * its own task board. Anyone opening the app landed there and never found the
 * ops shell, so the first screen was the least finished one. That page and its
 * components are gone; this is the entry point now.
 */
export default function Page() {
  redirect('/board')
}
