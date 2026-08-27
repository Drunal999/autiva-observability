export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/',
    '/board',
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
  ],
}
