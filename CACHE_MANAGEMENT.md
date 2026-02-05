# Cache Management

This document explains how cache is managed in the Continuum Next.js application.

## Overview

Next.js maintains several caches during development and production builds. In development, these caches can grow indefinitely and cause disk space issues. This project has implemented solutions to prevent cache growth in development while maintaining performance in production.

## Cache Locations

The following cache directories are tracked and managed:

| Location | Purpose | Environment |
|----------|---------|-------------|
| `.next/cache/fetch-cache` | Fetch API response cache | All |
| `.next/cache/images` | Image optimization cache | All |
| `.next/cache/webpack` | Turbopack/Webpack build cache | All |
| `node_modules/.cache` | Package manager and tool caches | All |

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

This command deletes:
- All `.next/cache/*` directories
- The `node_modules/.cache` directory

**Note:** The caches will be rebuilt on the next `bun dev` or `bun run build`.

## Development Configuration

In development (`NODE_ENV=development`), the Next.js fetch cache is disabled to prevent infinite growth. This is configured in:

- `next.config.ts` - Conditionally sets `cacheHandler` for development
- `cache-handler.js` - Custom cache handler that returns null (no caching)

**Why disable in development?**
- Prevents disk space issues from unbounded cache growth
- Faster dev server startup (no cache to load)
- Fresh data on every request (useful for API development)
- Cache is rebuilt quickly in dev anyway

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
- `cache-handler.js` - Custom cache handler for development
- `scripts/check-cache.mjs` - Cache diagnostic script
