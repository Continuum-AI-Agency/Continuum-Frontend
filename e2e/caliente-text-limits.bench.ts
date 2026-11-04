/** Real saved Caliente rows -> text fields -> batch preflight -> review; never confirms. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Locator, type Page } from 'playwright';
import { mintSessionBundleForEmail, pinSessionBrand, revokeBenchSession } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';

const baseUrl = process.env.CALIENTE_TEXT_LIMIT_BASE_URL;
const output = process.env.CALIENTE_TEXT_LIMIT_OUT;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(
  baseUrl && output && supabaseUrl && serviceKey,
  'Set the app URL, output path and production Supabase env',
);
const brandId = '86b2149a-3275-41b2-9d82-770d6854210d';
const setId = '27f643c3-fd5d-43d5-aacb-07525596ca0c';
const names = ['FC Cajamarca vs. UTC', 'Alianza Atlético vs. Deportivo Garcilaso'];
process.env.PLAYWRIGHT_BASE_URL = baseUrl;
process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});
const saved = await admin
  .schema('media')
  .from('render_sets')
  .select('created_by,revision')
  .eq('id', setId)
  .single();
if (saved.error) throw saved.error;
const owner = await admin.auth.admin.getUserById(saved.data.created_by);
if (owner.error) throw owner.error;
assert(owner.data.user.email);
const session = await mintSessionBundleForEmail(owner.data.user.email);
const report: Record<string, unknown> = {
  baseUrl,
  brandId,
  setId,
  revision: saved.data.revision,
};
const rec = createBenchRecorder('forge:caliente:text-limits', [
  'Real saved client rows and deployed batch preflight; render confirmation is not exercised.',
]);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let page: Page | undefined;
const pageErrors: string[] = [];
const requests: { path: string; method: string; status: number }[] = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  await pinSessionBrand(session.accessToken, brandId);
  const context = await browser.newContext({
    storageState: session.state,
    viewport: { width: 1600, height: 1000 },
  });
  await context.addInitScript(() => {
    Reflect.set(window, '__blockedSetWrites', []);
    const originalFetch = window.fetch;
    Reflect.set(window, 'fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      if (
        /\/renders\/(?:sets|render-sets|batches|jobs)(?:[/?]|$)/.test(url) &&
        !['GET', 'HEAD'].includes(method)
      ) {
        Reflect.get(window, '__blockedSetWrites').push({ url, method });
        return Promise.reject(new Error('The bench does not edit client sets'));
      }
      return originalFetch.call(window, input, init);
    });
  });
  page = await context.newPage();
  page.on('pageerror', (error) => {
    if (pageErrors.length < 12) pageErrors.push(error.message);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (requests.length < 100 && (url.pathname.includes('/renders') || response.status() >= 400)) {
      requests.push({
        path: url.pathname,
        method: response.request().method(),
        status: response.status(),
      });
    }
  });
  page.setDefaultTimeout(90_000);
  await page.goto(`${baseUrl}/forge`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  console.log('Opened the real Forge page.');
  const renderTab = page.getByRole('tab', { name: 'Render', exact: true });
  await expect(async () => {
    await renderTab.click();
    await expect(renderTab).toHaveAttribute('aria-selected', 'true', {
      timeout: 1000,
    });
  }).toPass({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Template', exact: true }).click();
  await page.getByRole('option', { name: /Card A \(Pre Match\) — Jerseys/ }).click();
  const fields = [];
  for (const name of names) {
    const row: Locator = page.locator(`tr:has(input[aria-label="Row name"][value="${name}"])`);
    await row.waitFor();
    const draw: Locator = row.getByRole('textbox', { name: 'Draw Bet', exact: true });
    const values = {
      label: name,
      draw: await draw.inputValue(),
      left: await row.getByRole('textbox', { name: 'Left Team', exact: true }).inputValue(),
      right: await row.getByRole('textbox', { name: 'Right Team', exact: true }).inputValue(),
      maxLength: await draw.getAttribute('maxlength'),
      misleadingCounter: await row.locator('[title*="characters the design has room for"]').count(),
    };
    assert.equal(values.maxLength, null);
    assert.equal(values.misleadingCounter, 0, 'Sample lengths must not appear as input limits');
    fields.push(values);
    await row.getByRole('checkbox', { name: 'Select row', exact: true }).click();
  }
  assert.equal(fields[0]?.draw, '4.10');
  assert.equal(fields[1]?.draw, '3.65');
  assert.equal(fields[1]?.left, 'Alianza Atlético');
  assert.equal(fields[1]?.right, 'Deportivo Garcilaso');
  report.fields = fields;
  rec.record('Saved odds and full team names have no sample-length input limits', 'PASS');
  console.log('Verified saved decimal odds and full team names without sample-length limits.');
  await page.getByRole('button', { name: 'Render 2 rows · 2 files', exact: true }).click();
  const tray = page.getByRole('region', {
    name: 'Review and render',
    exact: true,
  });
  const next = tray.getByRole('button', {
    name: 'Next: delivery',
    exact: true,
  });
  await page.waitForFunction(
    () => {
      const tray = document.querySelector('section[aria-label="Review and render"]');
      return (
        !!tray?.querySelector('[role="alert"]') ||
        Array.from(tray?.querySelectorAll('button') ?? []).some(
          (button) => button.textContent?.includes('Next: delivery') && !button.disabled,
        )
      );
    },
    undefined,
    { timeout: 90_000 },
  );
  const alerts = await tray.getByRole('alert').allTextContents();
  assert.deepEqual(alerts, [], `Real batch preflight refused: ${alerts.join('; ')}`);
  assert(await next.isEnabled(), 'The saved rows must reach delivery');
  report.reviewTray = await tray.innerText();
  assert(names.every((name) => String(report.reviewTray).includes(name)));
  assert.deepEqual(await page.evaluate(() => Reflect.get(window, '__blockedSetWrites')), []);
  assert.deepEqual(pageErrors, [], 'The render flow must not throw browser errors');
  await next.click();
  await tray.getByRole('radio', { name: 'Final', exact: true }).click();
  await expect(tray.getByRole('radio', { name: 'Final', exact: true })).toBeChecked();
  await tray.getByRole('checkbox', { name: 'Allow font substitution for this batch' }).click();
  await expect(
    tray.getByRole('checkbox', { name: 'Allow font substitution for this batch' }),
  ).toBeChecked();
  await expect(tray.getByRole('button', { name: /^Render \d+ files?$/ })).toBeEnabled();
  rec.record('Ordinary client pointer clicks reach Final and explicit font consent', 'PASS');
  await page.screenshot({ path: `${output}.png` });
  report.status = 'PASS';
  rec.record('Real batch preflight reaches delivery without the engine schema error', 'PASS');
  console.log(
    'PASS: real saved rows reach the review tray; no client set edits or renders submitted.',
  );
} catch (error) {
  report.status = 'FAIL';
  report.error = error instanceof Error ? error.message : String(error);
  rec.record('Client render flow', 'FAIL', String(report.error).split('\n')[0]);
  if (page) {
    report.page = {
      url: page.url(),
      body: (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(0, 16000),
    };
    await page.screenshot({ path: `${output}.png` }).catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  report.pageErrors = pageErrors;
  report.requests = requests;
  await browser?.close();
  report.sessionCleanup = await revokeBenchSession(session.state, session.accessToken);
  rec.print();
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
