import { withAuth } from 'next-auth/middleware'

// Signed-out visitors land on the branded page, not NextAuth's built-in one.
export default withAuth({ pages: { signIn: '/signin' } })

export const config = {
  matcher: [
    '/',
    '/board',
    // Every page route belongs here. /chat was added to the nav and not to
    // this list, so it answered 200 to anyone while every other page
    // redirected — the data was still safe (the APIs refuse without a
    // session) but the shell rendered for strangers.
    '/chat',
    '/approvals',
    '/fleet',
    '/city',
    '/brain',
    '/trace',
    '/terminal',
    '/automations',
    '/states',
    '/motion',
    '/calendar',
    '/api/tasks/:path*',
    '/api/user/:path*',
    '/api/events',
    '/api/agents/:path*',
    '/api/runs/:path*',
    '/api/flows/:path*',
    '/api/metrics/:path*',
    '/api/approvals/:path*',
    '/api/comments/:path*',
    '/api/chat/:path*',
    '/api/presence/:path*',
    '/api/team',
    '/api/stack-status',
    '/api/brain-memories',
    '/api/calls/:path*',
    // '/api/calendar/feed' is deliberately excluded: calendar clients fetch it
    // unattended with no session, authenticated by its own token instead.
    '/api/calendar',
    '/api/calendar/subscribe',
    '/api/notifications/:path*',
  ],
}
