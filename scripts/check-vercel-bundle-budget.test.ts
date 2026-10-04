import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  checkBundleBudgets,
  isWithinBudget,
  maxAllowedBytes,
} from './check-vercel-bundle-budget.mjs';

// The arithmetic tests below never touch a dist directory, which is why the bundler migration broke
// bundle:check without turning this suite red. These fixtures exercise both budget readers against
// the real Next output shapes.
const distDirectory = mkdtempSync(path.join(tmpdir(), 'bundle-budget-'));

mkdirSync(path.join(distDirectory, 'static', 'chunks'), { recursive: true });
mkdirSync(path.join(distDirectory, 'diagnostics'), { recursive: true });
writeFileSync(path.join(distDirectory, 'static', 'chunks', 'main.js'), 'x'.repeat(500));
writeFileSync(path.join(distDirectory, 'static', 'chunks', 'framework.js'), 'x'.repeat(300));
writeFileSync(
  path.join(distDirectory, 'build-manifest.json'),
  JSON.stringify({ rootMainFiles: ['static/chunks/main.js', 'static/chunks/framework.js'] }),
);
writeFileSync(
  path.join(distDirectory, 'diagnostics', 'route-bundle-stats.json'),
  JSON.stringify([
    { route: '/organic', firstLoadUncompressedJsBytes: 4000, firstLoadChunkPaths: [] },
    {
      route: '/login',
      firstLoadUncompressedJsBytes: 1000,
      firstLoadChunkPaths: [path.join(distDirectory, 'static/chunks/main.js')],
    },
  ]),
);

afterAll(() => rmSync(distDirectory, { recursive: true, force: true }));

describe('Vercel bundle budgets', () => {
  it('allows at most the configured percentage over the recorded baseline', () => {
    expect(maxAllowedBytes(1000, 10)).toBe(1100);
    expect(isWithinBudget(1100, 1000, 10)).toBe(true);
    expect(isWithinBudget(1101, 1000, 10)).toBe(false);
  });

  it('rounds fractional byte ceilings up', () => {
    expect(maxAllowedBytes(101, 10)).toBe(112);
  });

  it('sums rootMainFiles from build-manifest.json', () => {
    const [result] = checkBundleBudgets({
      distDirectory,
      configuration: {
        maxGrowthPercent: 10,
        budgets: [{ name: 'shared', source: 'rootMainFiles', baselineBytes: 800 }],
      },
    });
    expect(result.actualBytes).toBe(800);
    expect(result.passed).toBe(true);
  });

  it('reads a route first-load total from route-bundle-stats.json', () => {
    const [result] = checkBundleBudgets({
      distDirectory,
      configuration: {
        maxGrowthPercent: 10,
        budgets: [
          { name: 'login', source: 'routeFirstLoad', route: '/login', baselineBytes: 1000 },
        ],
      },
    });
    expect(result.actualBytes).toBe(1000);
    expect(result.gzipBytes).toBe(gzipSync('x'.repeat(500)).length);
    expect(result.passed).toBe(true);
  });

  it('fails a route that grew past the allowance', () => {
    const [result] = checkBundleBudgets({
      distDirectory,
      configuration: {
        maxGrowthPercent: 10,
        budgets: [
          { name: 'organic', source: 'routeFirstLoad', route: '/organic', baselineBytes: 3000 },
        ],
      },
    });
    expect(result.passed).toBe(false);
  });

  it('throws when a budgeted route is no longer in the build', () => {
    expect(() =>
      checkBundleBudgets({
        distDirectory,
        configuration: {
          maxGrowthPercent: 10,
          budgets: [
            { name: 'gone', source: 'routeFirstLoad', route: '/removed', baselineBytes: 1000 },
          ],
        },
      }),
    ).toThrow(/no route-bundle-stats row/);
  });
});

describe('Webpack emitted route bootstrap budgets', () => {
  const webpackDist = mkdtempSync(path.join(tmpdir(), 'webpack-budget-'));
  afterAll(() => rmSync(webpackDist, { recursive: true, force: true }));
  mkdirSync(path.join(webpackDist, 'static', 'chunks'), { recursive: true });
  mkdirSync(path.join(webpackDist, 'server', 'app', 'login.segments'), { recursive: true });
  writeFileSync(
    path.join(webpackDist, 'build-manifest.json'),
    JSON.stringify({ rootMainFiles: ['static/chunks/main.js'] }),
  );
  writeFileSync(path.join(webpackDist, 'static/chunks/main.js'), 'main');
  writeFileSync(path.join(webpackDist, 'static/chunks/login.js'), 'login');
  const check = (route: string) =>
    checkBundleBudgets({
      distDirectory: webpackDist,
      configuration: {
        maxGrowthPercent: 0,
        budgets: [{ name: 'route', source: 'routeFirstLoad', route, baselineBytes: 9 }],
      },
    });
  it('counts shared and document/RSC chunk imports exactly once for postponed HTML', () => {
    writeFileSync(path.join(webpackDist, 'server/app/login.html'), '');
    writeFileSync(
      path.join(webpackDist, 'server/app/login.segments/_full.segment.rsc'),
      '2:I[12,["static/chunks/main.js","static/chunks/login.js","static/chunks/login.js"],"Login"]',
    );
    expect(check('/login')[0]).toMatchObject({ actualBytes: 9, passed: true });
  });
  it('measures scripts and preloads from emitted HTML', () => {
    writeFileSync(
      path.join(webpackDist, 'server/app/page.html'),
      '<link rel="preload" href="/_next/static/chunks/login.js"/><script src="/_next/static/chunks/main.js"></script>',
    );
    expect(check('/page')[0]).toMatchObject({ actualBytes: 9, passed: true });
  });
  it('refuses missing output and traversal instead of silently skipping budgets', () => {
    expect(() => check('/missing')).toThrow('no emitted route bootstrap');
    expect(() => check('/../../../outside')).toThrow('escapes the build directory');
    writeFileSync(
      path.join(webpackDist, 'server/app/escape.html'),
      '<script src="/_next/static/chunks/../../../outside.js"></script>',
    );
    expect(() => check('/escape')).toThrow('escapes the build directory');
  });
});
