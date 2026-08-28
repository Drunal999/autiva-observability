/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enables src/instrumentation.ts, which fails the boot if a server secret
    // is missing rather than letting the first request that needs one 500.
    instrumentationHook: true,
  },
}

export default nextConfig;
