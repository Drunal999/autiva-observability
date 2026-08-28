import type { NextAuthOptions } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'

const providers: NextAuthOptions['providers'] = [
  GitHubProvider({
    clientId: process.env.GITHUB_ID ?? '',
    clientSecret: process.env.GITHUB_SECRET ?? '',
  }),
]

// Only enabled in E2E test runs — lets Playwright log in as a seeded
// user without a real GitHub OAuth round-trip. Never active in production.
if (process.env.E2E_TEST_MODE === 'true') {
  providers.push(
    CredentialsProvider({
      id: 'e2e-test-login',
      name: 'E2E Test Login',
      credentials: { githubId: { label: 'githubId', type: 'text' } },
      async authorize(credentials) {
        if (!credentials?.githubId) return null
        const user = await prisma.user.findUnique({ where: { githubId: credentials.githubId } })
        if (!user) return null
        return { id: user.id, name: user.name, email: user.email ?? undefined, image: user.avatarUrl }
      },
    })
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        const githubProfile = profile as { id: number; login: string; avatar_url?: string }
        await prisma.user.upsert({
          where: { githubId: String(githubProfile.id) },
          update: {
            name: user.name ?? githubProfile.login,
            avatarUrl: user.image ?? null,
            // Backfill the email if the row does not have one yet.
            //
            // The session callback below resolves the signed-in user BY EMAIL,
            // so a row created without one — a teammate seeded ahead of their
            // first login — would authenticate successfully and then carry no
            // `session.user.id`: no "My tasks", no commenting, no approvals.
            // `undefined` leaves the column untouched when GitHub gives us
            // nothing, so this can never blank an address we already hold.
            email: user.email ?? undefined,
          },
          create: {
            githubId: String(githubProfile.id),
            name: user.name ?? githubProfile.login,
            avatarUrl: user.image ?? null,
            email: user.email ?? null,
          },
        })
      }
      return true
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (dbUser) {
          session.user.id = dbUser.id
          session.user.muteSounds = dbUser.muteSounds
        }
      }
      return session
    },
  },
  // No `pages.signIn` override: this app has no custom sign-in page
  // component, so pointing pages.signIn at the built-in handler's own
  // URL (/api/auth/signin) made NextAuth treat it as a custom page and
  // redirect to itself forever. Omitting it falls back to NextAuth's
  // built-in sign-in UI at that same route, which works correctly.
}
