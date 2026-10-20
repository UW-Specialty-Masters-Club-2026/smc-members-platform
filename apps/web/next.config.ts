import type { NextConfig } from 'next';

const apiOrigin = process.env.API_BASE_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ['@smc/config', '@smc/core'],
  // Browser calls /api/* on our own origin, so the session cookie stays first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
