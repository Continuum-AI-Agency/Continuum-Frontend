/**
 * End-to-end bench of the Easy Fit Dashboard as a person sees it: a real session in a real browser
 * on a deployed Frontend, the real Backend answering, and the published payload rendered.
 *
 * Asserts the rendered page, not the API alone: the route answered 200 to a request the Frontend
 * built itself, and the tab drew figures instead of its error state. A 2026-11-04 run of this flow
 * found the Frontend never sent `brandId`, which every unit test and the Backend's own bench passed.
 *
 * Writes nothing but a per-session brand pin; the session is the caller's own (BENCH_EMAIL).
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *      BENCH_EMAIL, optional EASYFIT_BENCH_HOST (default app.beta.trycontinuum.ai),
 *      optional EASYFIT_BENCH_BRANDS, optional PLAYWRIGHT_EXECUTABLE.
 */
import { chromium } from 'playwright';
import { mintSessionBundleForEmail, pinSessionBrand } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';

const HOST = process.env.EASYFIT_BENCH_HOST ?? 'app.beta.trycontinuum.ai';
const BRANDS = (
  process.env.EASYFIT_BENCH_BRANDS ??
  '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64,148583e0-5538-462b-8d3a-acd25b80344e'
).split(',');
const SETTLE_MS = 25_000;

const recorder = createBenchRecorder('easyfit-dashboard-render', [`host: ${HOST}`]);
const check = (step: string, passed: boolean, detail?: string): void =>
  recorder.record(step, passed ? 'PASS' : 'FAIL', detail);
const email = process.env.BENCH_EMAIL;
if (!email) throw new Error('BENCH_EMAIL is required');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
});

for (const brand of BRANDS) {
  const bundle = await mintSessionBundleForEmail(email);
  await pinSessionBrand(bundle.accessToken, brand);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: {
      origins: [],
      cookies: bundle.state.cookies.map((cookie) => ({
        ...cookie,
        domain: HOST,
        secure: true,
        sameSite: 'Lax' as const,
      })),
    },
  });
  const page = await context.newPage();
  const statuses: number[] = [];
  let altas: number | null = null;
  page.on('response', async (response) => {
    if (!response.url().includes('/easyfit/dashboard')) return;
    statuses.push(response.status());
    if (response.ok()) {
      const body = (await response.json()) as { payload?: { mes_en_curso?: { altas?: number } } };
      altas = body.payload?.mes_en_curso?.altas ?? null;
    }
  });
  await page.goto(`https://${HOST}/scale?optimizerView=dashboard`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForTimeout(SETTLE_MS);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const label = brand.slice(0, 8);
  check(`${label}: the Dashboard tab is offered`, text.includes('Dashboard'));
  check(`${label}: the route answered 200`, statuses.includes(200), statuses.join(','));
  check(`${label}: no load error on screen`, !text.includes('No se pudo cargar el dashboard'));
  check(
    `${label}: the published month's altas are drawn`,
    altas !== null && text.includes(String(altas)),
    `altas ${altas}`,
  );
  await page.screenshot({ path: `/tmp/easyfit-dashboard-${label}.png` });
  await context.close();
}
await browser.close();
recorder.print();
process.exit(recorder.failed() ? 1 : 0);
