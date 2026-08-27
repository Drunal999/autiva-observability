export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/',
    '/board',
    '/approvals',
    '/fleet',
    '/trace',
    '/terminal',
    '/automations',
    '/states',
    '/motion',
    '/api/tasks/:path*',
    '/api/user/:path*',
    '/api/events',
    '/api/agents/:path*',
    '/api/runs/:path*',
    '/api/flows/:path*',
    '/api/metrics/:path*',
    '/api/approvals/:path*',
    '/api/comments/:path*',
    '/api/presence/:path*',
    '/api/calls/:path*',
    '/api/notifications/:path*',
  ],
}
