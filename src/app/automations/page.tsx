import { redirect } from 'next/navigation'

/** Automations now live inside the Brain section; old links land on its Workflows tab. */
export default function AutomationsPage() {
  redirect('/brain?view=workflows')
}
