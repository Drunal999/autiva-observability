/**
 * Seeds teammates so they can be assigned work and @mentioned before they have
 * ever signed in.
 *
 *   node scripts/add-teammate.mjs <github-username> [<github-username> ...]
 *
 * Why it resolves the username against the GitHub API instead of just storing
 * it: `User.githubId` holds the NUMERIC GitHub account id, because that is what
 * the OAuth profile carries and what `signIn` upserts on (src/lib/auth.ts).
 * Storing the login string here would not match, and their first real login
 * would create a SECOND row — leaving assigned tasks and mentions attached to a
 * ghost account.
 *
 * The upsert deliberately mirrors that callback exactly, so a seeded row is
 * the same row their login updates rather than a competing one.
 *
 * Mentions resolve on `githubId`, which is the numeric id, so `@octocat` will
 * not match — mention them by the handle stored in `name` once they have
 * logged in. That is a pre-existing wrinkle, not something this script adds.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const logins = process.argv.slice(2).filter(Boolean)
if (logins.length === 0) {
  console.error('usage: node scripts/add-teammate.mjs <github-username> [...]')
  process.exit(1)
}

/** Unauthenticated GitHub lookup. 60 requests/hour is ample for a few people. */
async function lookup(login) {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'autiva-add-teammate' },
  })
  if (res.status === 404) throw new Error(`no such GitHub user: ${login}`)
  if (res.status === 403) throw new Error('GitHub rate limit reached; try again in a few minutes')
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${login}`)
  return res.json()
}

let failed = false

for (const login of logins) {
  try {
    const p = await lookup(login)
    const githubId = String(p.id)

    const existing = await prisma.user.findUnique({ where: { githubId } })
    const user = await prisma.user.upsert({
      where: { githubId },
      // Never overwrite a name or avatar the person has already established by
      // logging in; only fill what is missing.
      update: {
        name: existing?.name ?? p.name ?? p.login,
        avatarUrl: existing?.avatarUrl ?? p.avatar_url ?? null,
      },
      create: {
        githubId,
        name: p.name ?? p.login,
        avatarUrl: p.avatar_url ?? null,
        // Usually null: GitHub hides addresses by default. The sign-in callback
        // backfills it on their first login, which is what makes the session
        // lookup by email find them.
        email: p.email ?? null,
      },
    })

    console.log(
      `${existing ? 'already present' : 'added'}: ${user.name} (@${p.login}, githubId ${githubId})` +
        (user.email ? '' : ' — no public email; it fills in on first login')
    )
  } catch (err) {
    failed = true
    console.error(`FAILED ${login}: ${err.message}`)
  }
}

await prisma.$disconnect()
process.exit(failed ? 1 : 0)
