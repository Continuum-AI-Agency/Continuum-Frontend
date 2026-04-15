import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable fetch cache in development to prevent infinite cache growth
  ...(process.env.NODE_ENV === 'development' && {
    cacheHandler: require.resolve('./cache-handler.js'),
  }),
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
    viewTransition: true,
  },
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "local-dev",
  },
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};


export default nextConfig;
