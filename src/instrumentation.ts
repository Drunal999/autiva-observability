/**
 * Runs once when the server process starts, before it serves anything.
 *
 * Secrets are checked here rather than at first use so a misconfiguration is a
 * boot failure with instructions, not a 500 the first time a customer
 * subscribes to a calendar feed. Build is unaffected — this hook does not run
 * during `next build`, which is why the check lives here and not at module
 * scope.
 */
export async function register() {
  // Edge runtime has no access to these and does not serve the routes that
  // need them.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertSecretsPresent } = await import('@/lib/ops/secrets')
  assertSecretsPresent()
}
