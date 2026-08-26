import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
    { route: '/login', firstLoadUncompressedJsBytes: 1000, firstLoadChunkPaths: [] },
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
