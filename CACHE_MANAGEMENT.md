# Cache Management

This document explains how cache is managed in the Continuum Next.js application.

## Overview

Next.js maintains several caches during development and production builds. In development, these caches can grow indefinitely and cause disk space issues. This project has implemented solutions to prevent cache growth in development while maintaining performance in production.

## Cache Locations

The following cache directories are tracked and managed:

| Location | Purpose | Environment |
|----------|---------|-------------|
| `.next/dev/cache/turbopack` | **Turbopack persistent compiler cache — by far the largest** | Dev |
| `.next/build/cache` | Turbopack compiler cache for builds | Build |
| `.next/cache/fetch-cache` | Fetch API response cache | All |
| `.next/cache/images` | Image optimization cache | All |
| `.next/cache/webpack` | Webpack build cache | Build |
| `node_modules/.cache` | Package manager and tool caches | All |

> **The one that actually grows.** `.next/dev/cache/turbopack` is a `turbo-persistence` SST database that compaction does not always keep up with. It reached **39 GB across 3,020 `.sst` files** in this repo before anyone measured it, and every cache lookup and HMR write fanned out across all of them — which is what made dev feel slow. It is **not** under `.next/cache`, so any script scoped to `.next/cache/*` will report a clean bill of health while it grows unbounded. Next 16.3 (#97304) adds a TTL and retains fewer stale cache versions, which should keep it in check.

## Cache Management Scripts

### Check Cache Sizes

View the current size of all cache directories:

```bash
bun run check-cache
```

This will output a report showing the size of each cache location and the total.

### Clear All Caches

Remove all cache directories:

```bash
bun run cache:clear
```

This command deletes the whole of `.next` plus `node_modules/.cache`. It deliberately does **not** target `.next/cache/*` alone — that was the original bug: it left `.next/dev/cache/turbopack` untouched, which is the directory that actually grows.

**Note:** The caches will be rebuilt on the next `bun dev` or `bun run build`.

## Development Configuration

There is no custom cache handler. A previous `cache-handler.js` returned `null` for everything in development, on the theory that the fetch cache was the thing growing without bound. It was not — the growth was Turbopack's compiler cache (see above). The handler has been removed: it solved nothing, and under Cache Components a no-op handler hides exactly the caching behaviour you need to observe in dev.

If you ever do need a custom cache backend for `'use cache'`, the modern config key is `cacheHandlers` (plural, per-profile), not the legacy singular `cacheHandler`.

## Production Behavior

In production builds, caching works normally:
- Fetch cache is enabled with automatic revalidation
- Image optimization cache persists across builds
- Static page generation uses ISR caching

## Troubleshooting

### "No cache directories found"

This is normal if you have not yet run:
- `bun dev` (starts dev server)
- `bun run build` (creates production build)

### Cache still growing after running cache:clear

If cache directories reappear immediately after clearing:
1. Ensure no dev server or build process is running
2. Run `bun run cache:clear` again
3. Check that you're in development mode (cache should not grow in dev)

### Large node_modules/.cache

This directory is used by various tools (TypeScript, ESLint, etc.). It is safe to clear and will be rebuilt as needed.

## When to Clear Cache

Clear caches when:
- Disk space is low
- Experiencing strange build errors
- Cache corruption is suspected
- Switching between major dependency versions
- After significant configuration changes

## Related Files

- `next.config.ts` - Next.js configuration with cache settings
- `scripts/check-cache.mjs` - Cache diagnostic script
