import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ['@smc/config', '@smc/core'],
};

export default nextConfig;
