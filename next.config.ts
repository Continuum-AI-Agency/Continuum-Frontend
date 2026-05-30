import type { NextConfig } from "next";
import path from "node:path";

// Gated rollout: enable Cache Components by setting NEXT_CACHE_COMPONENTS=1.
// Off by default until Phase 2 audits dynamic boundaries for every page.
const cacheComponentsEnabled = process.env.NEXT_CACHE_COMPONENTS === "1";

// Monorepo root (one level up from Continuum-Frontend/). Bun's workspaces
// hoist dependencies there, so Turbopack must trace from this root to
// resolve next/react/etc. Hard-coding the relative parent avoids __dirname
// (which doesn't survive Next's config loader in all cases).
const workspaceRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  // Disable fetch cache in development to prevent infinite cache growth
  ...(process.env.NODE_ENV === 'development' && {
    cacheHandler: require.resolve('./cache-handler.js'),
  }),
  ...(cacheComponentsEnabled && { cacheComponents: true }),
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
    viewTransition: true,
  },
  turbopack: {
    root: workspaceRoot,
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
