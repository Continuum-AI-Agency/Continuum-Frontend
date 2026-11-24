/**
 * load-intent bench: how long a person waits between a click and the content they asked for.
 *
 * One run = one sample of each journey, printed as `strobe:metric <name>=<ms>` so strobe can
 * alternate two builds and judge them: strobe run --base "<this, base URL>" --head "<this, head
 * URL>" --metrics metric.nav_scale_ms,…
 *
 * Every journey rests the pointer on its target for 150 ms first (people do; intent preloading
 * is built on it), then clicks. "Content visible" is the first frame after the URL changed with
 * no skeleton left outside the sidebar. A page that loads with no skeleton at all is therefore
 * timed to its commit, which is a floor, not its full load.
 *
 * Reads only. Needs a production server at LOAD_INTENT_URL (default http://localhost:3110, a
 * Backend CORS origin) and NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Signs in as
 * BENCH_EMAIL (default bench@trycontinuum.ai, the shared bench account). LOAD_INTENT_ONLY (comma
 * list of metric names) runs a subset, to keep one run inside a strobe case's timeout.
 */
import { chromium, type Page } from 'playwright';
import { mintSessionForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';

const BASE = new URL(process.env.LOAD_INTENT_URL ?? 'http://localhost:3110');
const EMAIL = process.env.BENCH_EMAIL ?? 'bench@trycontinuum.ai';
const ONLY = process.env.LOAD_INTENT_ONLY ? process.env.LOAD_INTENT_ONLY.split(',') : undefined;
const HOVER_MS = 150;
const TIMEOUT_MS = 30_000;

const recorder = createBenchRecorder('load-intent', [
  `url: ${BASE.origin}`,
  `hover: ${HOVER_MS} ms`,
]);

// In the page: stamp the press, then resolve on the first frame where the URL matches and no
// skeleton is left outside the sidebar (and, when given, `ready` matches something).
async function clickAndTime(page: Page, target: string, urlPart: string, ready?: string) {
  const locator = page.locator(target).first();
  await locator.hover();
  await page.waitForTimeout(HOVER_MS);
  const done = page.evaluate(
    ({ urlPart, ready, timeout }) =>
      new Promise<number>((resolve, reject) => {
        const win = window as unknown as { __pressedAt?: number };
        win.__pressedAt = undefined;
        addEventListener('pointerdown', () => (win.__pressedAt = performance.now()), {
          capture: true,
          once: true,
        });
        const deadline = performance.now() + timeout;
        const tick = () => {
          const pressed = win.__pressedAt;
          const skeletons = [
            ...document.querySelectorAll('[data-slot=skeleton], [data-slot=skeleton-text]'),
          ].filter((el) => !el.closest('[data-sidebar]') && (el as HTMLElement).offsetParent);
          if (
            pressed !== undefined &&
            location.href.includes(urlPart) &&
            skeletons.length === 0 &&
            (!ready || document.querySelector(ready))
          ) {
            resolve(performance.now() - pressed);
            return;
          }
          if (performance.now() > deadline) reject(new Error(`not visible within ${timeout} ms`));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { urlPart, ready, timeout: TIMEOUT_MS },
  );
  await locator.click();
  return Math.round(await done);
}

async function coldLcp(page: Page, route: string) {
  await page.goto(new URL(`/en${route}`, BASE).href, { waitUntil: 'load', timeout: 120_000 });
  return Math.round(
    await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(entries[entries.length - 1].startTime);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        }),
    ),
  );
}

// Open a start page and let it settle. Not 'networkidle': pages with polling or realtime
// connections never reach it and hung runs for minutes. One fixed second covers hydration, so
// the target has its handlers before the pointer arrives; both arms wait the same.
async function open(page: Page, route: string, ready: string) {
  await page.goto(new URL(`/en${route}`, BASE).href, { waitUntil: 'load', timeout: 60_000 });
  await page.locator(ready).first().waitFor({ timeout: TIMEOUT_MS });
  await page.waitForTimeout(1_000);
}

const state = await mintSessionForEmail(EMAIL);
const cookies = state.cookies.map((cookie) => ({
  ...cookie,
  domain: BASE.hostname,
  secure: BASE.protocol === 'https:',
  sameSite: 'Lax' as const,
}));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
});

async function journey(name: string, run: (page: Page) => Promise<number | null>) {
  if (ONLY && !ONLY.includes(name)) return;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: { cookies, origins: [] },
  });
  const page = await context.newPage();
  try {
    const ms = await run(page);
    if (ms === null) recorder.record(name, 'SKIP', 'not available to this account');
    else {
      recorder.record(name, 'PASS', `${ms} ms`);
      console.log(`strobe:metric ${name}=${ms}`);
    }
  } catch (error) {
    recorder.record(name, 'FAIL', (error as Error).message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

// Sidebar navigation from Home into the three client-fetched pages (the ones with loaders).
for (const [name, path] of [
  ['nav_scale_ms', '/scale'],
  ['nav_spy_ms', '/competitor-spy'],
  ['nav_forge_ms', '/forge'],
] as const) {
  await journey(name, async (page) => {
    await open(page, '/dashboard', '[data-sidebar=sidebar] a');
    const link = `[data-sidebar=sidebar] a[href$="${path}"]:not([data-locked])`;
    if ((await page.locator(link).count()) === 0) return null;
    return clickAndTime(page, link, path);
  });
}

// A Settings section switch to the heaviest section (Brand Book, markdown, diagrams, maths).
await journey('section_switch_ms', async (page) => {
  const tab = '[role=tab]:has-text("Brand Intelligence")';
  await open(page, '/settings', tab);
  return clickAndTime(page, tab, 'section=brand-intelligence');
});

// AI Studio's creative library sheet, from its launcher.
await journey('sheet_open_ms', async (page) => {
  const launcher = 'button[aria-label="Open creative library"]';
  await open(page, '/ai-studio', launcher);
  return clickAndTime(
    page,
    launcher,
    '/ai-studio',
    '[role=dialog] input[type=search], [role=dialog] input[placeholder]',
  );
});

// Guard: a cold load this round did not target should not move.
await journey('lcp_library_ms', (page) => coldLcp(page, '/library'));

await browser.close();
recorder.print();
process.exit(recorder.failed() ? 1 : 0);
