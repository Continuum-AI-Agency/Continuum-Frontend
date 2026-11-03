// PP-DT-C-unfinished-dashboard-hang-and-raw-error, residual (deep test 2026-10-31, lane K): lane I
// bounded the Explorer's account- and campaign-insight reads and the timeline, but the other
// calls to the app's own /api/paid-media/* routes — campaign indexes, the store's budget pacing,
// the timeline accounts, the campaign-index prefetch — were still a bare `fetch`: a hung route
// kept its skeleton for good. A client time limit is one policy at the HTTP boundary, chosen by
// URL, never a per-hook number. This reads every client module, so the next raw call fails here.

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '../..');

const modules = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'node_modules' ? [] : modules(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) ? [path] : [];
  });

/** A global `fetch(` whose URL is one of the app's /api/paid-media routes. The routes
 *  themselves (src/app/api) answer them and are not callers. */
const RAW_ROUTE_FETCH = /(?<![\w.])fetch\(\s*[`'"]\/api\/paid-media\//;

describe('the app’s /api/paid-media routes are read through the client time limit', () => {
  it('finds the callers it guards', () => {
    const callers = modules(SRC)
      .filter((path) => readFileSync(path, 'utf8').includes('/api/paid-media/'))
      .map((path) => relative(SRC, path));
    expect(callers).toContain('components/paid-media/dashboard/PaidMediaDashboard.tsx');
    expect(callers).toContain('lib/paid-media/performance-store.ts');
  });

  it('never calls one with a bare fetch', () => {
    const raw = modules(SRC)
      .filter((path) => !relative(SRC, path).startsWith('app/api/'))
      .filter((path) => RAW_ROUTE_FETCH.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path));
    expect(raw).toEqual([]);
  });
});
