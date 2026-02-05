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
},
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "local-dev",
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};


export default nextConfig;
