export { default } from 'next-auth/middleware'

export const config = {
  matcher: ['/', '/api/tasks/:path*', '/api/user/:path*', '/api/events'],
}
