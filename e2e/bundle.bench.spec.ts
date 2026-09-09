import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { mintSessionWithPassword, type PlaywrightStorageState } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// Production output + real local Auth/DB/Backend. No mocked responses or hosted writes.
const dist = path.resolve(process.env.NEXT_DIST_DIR ?? '.next/bundle-optimized');
const routes = ['/login', '/organic', '/settings', '/library', '/scale', '/ai-studio'];
let storageState: PlaywrightStorageState;
let backend: LocalBackend;

// Inspect the emitted export tables. Analyzer filenames precede final chunk hashing
// in Next 16.3 and do not identify the URLs that browsers actually request.
function exportedChunks(names: string[]): Set<string> {
  const directory = path.join(dist, 'static/chunks');
  const files = readdirSync(directory).filter((file) => file.endsWith('.js'));
  const sources = files.map((file) => ({
    file,
    code: readFileSync(path.join(directory, file), 'utf8'),
  }));
  return new Set(
    names.flatMap((name) => {
      const matches = sources.filter(({ code }) => code.includes(`"${name}",`));
      expect(matches.length, `No emitted export found for ${name}`).toBeGreaterThan(0);
      return matches.map(({ file }) => `/_next/static/chunks/${file}`);
    }),
  );
}

test.beforeAll(async () => {
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(supabase.hostname)) {
    throw new Error('bundle:e2e:bench requires a build and environment targeting local Supabase.');
  }
  storageState = await mintSessionWithPassword('local@continuum.test', 'localdev123');
  backend = await startLocalBackend({
    port: 4425,
    browserOrigin: process.env.PLAYWRIGHT_BASE_URL as string,
    label: 'bundle',
  });
});

test.afterAll(async () => {
  await backend?.stop();
});

for (const routeName of routes) {
  test(`cold production load ${routeName}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      storageState: routeName === '/login' ? undefined : storageState,
    });
    const page = await context.newPage();
    const scripts = new Set<string>();
    const prefetches: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.resourceType() === 'script') scripts.add(url.pathname);
      const headers = request.headers();
      if (
        headers['next-router-prefetch'] ||
        /prefetch/.test(headers.purpose ?? headers['sec-purpose'] ?? '')
      ) {
        prefetches.push(url.pathname);
      }
    });
    // Keep the build's original API URL for an identical before/after comparison.
    // Forward local API traffic to this bench's real Backend, never mocked responses.
    const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');
    if (!['localhost', '127.0.0.1'].includes(api.hostname))
      throw new Error('Expected a local API URL.');
    await page.route(`${api.origin}/**`, (request) => {
      const url = new URL(request.request().url());
      return request.continue({ url: `${backend.url}${url.pathname}${url.search}` });
    });
    try {
      const inbox =
        routeName === '/login'
          ? null
          : page.waitForResponse(
              (response) =>
                response.url().includes('/api/media/client-render-jobs?') &&
                response.request().method() === 'GET',
            );
      const response = await page.goto(routeName, { waitUntil: 'load' });
      expect(response?.ok()).toBe(true);
      if (inbox) {
        await expect(page.getByRole('button', { name: /Notifications/i }).first()).toBeVisible();
        const queue = await inbox;
        expect(queue.ok(), 'The real local render inbox must load').toBe(true);
        const body = await queue.json();
        expect(body.jobs.filter((job: { state: string }) => job.state === 'ready')).toHaveLength(0);
      } else {
        await expect(page.locator('input[type="email"]')).toBeVisible();
      }
      const resources = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter(
            (entry) =>
              entry.name.includes('/_next/static/') && new URL(entry.name).pathname.endsWith('.js'),
          )
          .map((entry) => {
            const resource = entry as PerformanceResourceTiming;
            return {
              path: new URL(resource.name).pathname,
              initiator: resource.initiatorType,
              transferBytes: resource.transferSize,
              encodedBytes: resource.encodedBodySize,
              decodedBytes: resource.decodedBodySize,
            };
          }),
      );
      const report = {
        route: routeName,
        resources,
        navigationPrefetches: prefetches,
        encodedJsBytes: resources.reduce((sum, resource) => sum + resource.encodedBytes, 0),
      };
      console.log(
        `[bundle] ${routeName}: ${Math.round(report.encodedJsBytes / 1024)} KiB encoded JS, ${prefetches.length} navigation prefetches`,
      );
      await testInfo.attach('cold-load.json', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });

      if (routeName === '/organic') {
        const palette = exportedChunks(['CommandPalette']);
        expect(
          [...palette].filter((chunk) => scripts.has(chunk)),
          'No palette before first opening',
        ).toEqual([]);
        const executors = exportedChunks([
          'executeCreativeOpsClientRender',
          'executeHyperframesClientRender',
          'executeMcpClipBatchClientRender',
          'executeOrganicHyperframeClientRender',
          'executePlannerReelClientRender',
          'executeTimelineEditorClientRender',
        ]);
        expect(
          [...executors].filter((chunk) => scripts.has(chunk)),
          'No executor before a job starts',
        ).toEqual([]);
        await page.keyboard.press('Meta+k');
        const input = page.getByPlaceholder('Go to, search, or run...');
        await expect(input).toBeFocused();
        for (const [query, label] of [
          ['brsp', 'Brand Spy'],
          ['cnvs', 'Canvas'],
          ['lbry', 'Library'],
        ]) {
          await input.fill(query);
          await expect(
            page.locator('[data-slot="command-item"]:not([hidden])').first(),
          ).toContainText(label);
        }
        expect([...palette].some((chunk) => scripts.has(chunk))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(input).not.toBeVisible();
        await page.keyboard.press('Meta+k');
        await expect(input).toBeFocused();
        await input.fill('lbry');
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/library/);
        await page.keyboard.press('Meta+k');
        await expect(input).toBeFocused();
        expect([...executors].filter((chunk) => scripts.has(chunk))).toEqual([]);
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('a real render resumes and completes across dashboard navigation', async ({
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const { stdout } = await promisify(execFile)(
    'bun',
    ['Continuum-Backend/scripts/video-editor-v2-durable-render-local-e2e-bench.ts'],
    {
      cwd: path.resolve('..'),
      env: {
        ...process.env,
        BUNDLE_BENCH_APP_URL: baseURL,
        BUNDLE_BENCH_API_URL: backend.url,
      },
      timeout: 160_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  console.log(stdout.trim());
  await testInfo.attach('durable-render.json', { body: stdout, contentType: 'application/json' });
});
