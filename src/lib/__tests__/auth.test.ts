import { describe, it, expect, vi } from 'vitest'

// authOptions imports src/lib/prisma.ts, which constructs a real
// PrismaClient at module load — that throws without a DATABASE_URL in
// process.env (vitest does not load .env the way `prisma` CLI commands
// do). This test only inspects provider config, so a stub is enough.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { authOptions } from '../auth'

describe('authOptions', () => {
  it('configures the GitHub provider', () => {
    const providerIds = authOptions.providers.map((p) => p.id)
    expect(providerIds).toContain('github')
  })

  it('includes the test-only credentials provider only when E2E_TEST_MODE is set', () => {
    const providerIds = authOptions.providers.map((p) => p.id)
    if (process.env.E2E_TEST_MODE === 'true') {
      expect(providerIds).toContain('e2e-test-login')
    } else {
      expect(providerIds).not.toContain('e2e-test-login')
    }
  })
})
