import { redirect } from 'next/navigation'

/** The product opens directly on its City workspace. */
export default function Page() {
  redirect('/city')
}
