/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * A production build and a running dev server share `.next` by default, and
   * `next build` overwrites it — leaving the dev server's manifest pointing at
   * chunks that no longer exist. The symptom is brutal and misleading: the HTML
   * still returns 200 while every CSS and JS asset 404s, so the page renders as
   * a bare, unstyled background and looks like the app was deleted.
   *
   * Setting NEXT_DIST_DIR lets a verification build go somewhere else:
   *
   *   NEXT_DIST_DIR=.next-build npm run build
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Enables src/instrumentation.ts, which fails the boot if a server secret
    // is missing rather than letting the first request that needs one 500.
    instrumentationHook: true,
  },
}

export default nextConfig;
