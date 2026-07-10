import path from 'node:path';
import type { NextConfig } from 'next';

// Gated rollout: enable Cache Components by setting NEXT_CACHE_COMPONENTS=1.
// Off by default until Phase 2 audits dynamic boundaries for every page.
const cacheComponentsEnabled = process.env.NEXT_CACHE_COMPONENTS === '1';

// Monorepo root (one level up from Continuum-Frontend/). Vercel runs the build
// command from Continuum-Frontend, so derive this from cwd rather than
// __dirname, which can be rewritten by Next's config loader.
const workspaceRoot = path.resolve(process.cwd(), '..');

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/sign/**' },
    ],
  },
  // Disable fetch cache in development to prevent infinite cache growth
  ...(process.env.NODE_ENV === 'development' && {
    cacheHandler: require.resolve('./cache-handler.js'),
  }),
  ...(cacheComponentsEnabled && { cacheComponents: true }),
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
    viewTransition: true,
    optimizePackageImports: ['@phosphor-icons/react', '@radix-ui/react-icons', 'lucide-react'],
  },
  turbopack: {
    root: workspaceRoot,
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev',
  },
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
      // Paid media renamed to "Scale". Query strings are preserved by Next.
      {
        source: '/paid-media',
        destination: '/scale',
        permanent: false,
      },
      {
        source: '/paid-media/:path*',
        destination: '/scale/:path*',
        permanent: false,
      },
      // Integrations now live only inside Settings. The dedicated /integrations
      // index and the /settings/integrations sub-route are gone; the OAuth
      // callback at /integrations/callback is intentionally NOT redirected.
      {
        source: '/integrations',
        destination: '/settings?section=integrations',
        permanent: false,
      },
      {
        source: '/settings/integrations',
        destination: '/settings?section=integrations',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
};

export default nextConfig;
