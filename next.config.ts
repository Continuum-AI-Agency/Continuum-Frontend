import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

const distDir = process.env.NEXT_DIST_DIR?.trim();
const tsconfigPath = process.env.NEXT_TSCONFIG_PATH?.trim();

// Monorepo root (one level up from Continuum-Frontend/). Vercel runs the build
// command from Continuum-Frontend, so derive this from cwd rather than
// __dirname, which can be rewritten by Next's config loader.
const currentDirectory = process.cwd();
const monorepoRoot = path.resolve(currentDirectory, '..');
const workspaceRoot = existsSync(path.join(monorepoRoot, 'packages/contracts'))
  ? monorepoRoot
  : currentDirectory;

const nextConfig: NextConfig = {
  // Parallel local benches can opt into an isolated build directory instead
  // of contending with a developer's existing `.next/dev/lock`.
  ...(distDir ? { distDir } : {}),
  // `bun run build` performs the same strict TypeScript gate in a fresh process
  // before the bundler runs. Keeping it separate prevents Next's large type graph
  // from competing with retained compiler memory on Vercel's two-core builder.
  typescript: {
    ignoreBuildErrors: true,
    ...(tsconfigPath ? { tsconfigPath } : {}),
  },
  // The isolated browser benches use 127.0.0.1 rather than localhost so their
  // cookies and local Supabase host match. Keep Turbopack HMR quiet there.
  ...(process.env.NODE_ENV === 'development' ? { allowedDevOrigins: ['127.0.0.1'] } : {}),
  images: {
    // Next 16 rejects private IPs in the optimizer by default. Local Supabase
    // signed URLs are intentionally private and only available in development.
    ...(process.env.NODE_ENV === 'development' ? { dangerouslyAllowLocalIP: true } : {}),
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/sign/**' },
      // The local Supabase stack signs from http://127.0.0.1:54321; without this
      // every library image throws "Invalid src prop" and takes the page down.
      // Development only — the hosted app never sees this host.
      ...(process.env.NODE_ENV === 'development'
        ? ([
            {
              protocol: 'http',
              hostname: '127.0.0.1',
              port: '54321',
              pathname: '/storage/v1/object/sign/**',
            },
          ] as const)
        : []),
    ],
  },
  // Static shell per route, dynamic content streamed in. Also the prerequisite
  // for partialPrefetching, which throws at config validation without it.
  cacheComponents: true,
  // One reusable App Shell per route instead of one prefetch per visible link.
  partialPrefetching: true,
  // The OpenTelemetry log SDK (instrumentation.ts -> PostHog) must stay out of the Turbopack
  // server bundle; bundling it breaks its global registry, which is how instrumentation and the
  // route handlers share one provider.
  serverExternalPackages: [
    '@opentelemetry/api-logs',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/exporter-logs-otlp-http',
    '@opentelemetry/resources',
  ],
  // Next 16.3 writes its own instructions into AGENTS.md on every `next dev`.
  // Ours is the canonical hand-written guide; keep the generator out of it.
  agentRules: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
    // `experimental.viewTransition` graduated in Next 16.3 — React's
    // <ViewTransition> now works in the App Router with no configuration.
    // lucide-react is already in Next's built-in optimizePackageImports list.
    optimizePackageImports: ['@phosphor-icons/react'],
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
