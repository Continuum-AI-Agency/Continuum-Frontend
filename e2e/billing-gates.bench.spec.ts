import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { replaySandboxEventsToWebhook } from '../../packages/billing/src/replayEvents';
import { mintSessionBundleForEmail } from './support/auth';
import {
  assertBillingApiServed,
  brandEntitlements,
  cleanupBillingBench,
  createBenchRecorder,
  createUser,
  DESKTOP,
  describeError,
  grantContract,
  HIDE_TOASTS,
  MOBILE,
  payWithTestCard,
  sandboxStripe,
  serviceClient,
  WEBHOOK_URL,
} from './support/billingBench';

// billing:gates:fe:bench — product gates and the onboarding pay step, end to end, nothing mocked.
//
//   (a) paying    a fresh user whose brand the real /onboarding page creates reaches the last
//                 screen, goes on to "Choose your plan", picks Organic Plus, pays on the
//                 Stripe-hosted SANDBOX Checkout with 4242, returns, and — once the real sandbox
//                 events are replayed through the local webhook — onboarding completes and the
//                 app lands on /dashboard.
//   (b) contract  a second fresh brand at "Choose your plan" cannot finish ("Check again" says it
//                 is not enabled); after a service-role Contract grant the same button finishes
//                 onboarding and lands on /dashboard.
//   (c) gates     the Organic Plus brand from (a) opens /ai-studio and /organic; /scale, /forge
//                 and /scale/approvals send it to Settings → Billing with Performance Plus
//                 highlighted; the sidebar locks exactly the paid-media entries.
//   (d) tier      no src/ file reads the brand tier outside the one billing-cutover fallback.
//
// Cleanup is by id: only the users this run created and the brands they own.

const SCREENSHOT_DIR = path.join(process.cwd(), 'e2e/__screenshots__/billing-gates');
const RUN_ID = Date.now().toString(36);
const PASSWORD = `Bench-${RUN_ID}-pw1!`;
const EMAILS = {
  paying: `gates-paying-${RUN_ID}@continuum.test`,
  contract: `gates-contract-${RUN_ID}@continuum.test`,
};
const BILLING_NEED_PAID_MEDIA = /\/settings\?section=billing&need=paid_media$/;
const PAID_MEDIA_LOCKS = [
  'Forge (needs Performance Plus)',
  'Jaina (needs Performance Plus)',
  'Paid Analytics (needs Performance Plus)',
  'Paid Optimization (needs Performance Plus)',
];

const recorder = createBenchRecorder('billing:gates:fe:bench', [
  'unexercised hop: Stripe delivering webhooks to our URL — the real sandbox events are replayed through the locally served stripe-billing-webhook instead',
  'onboarding screens 0-6 (website scrape, documents, catalog, channels, invites, Brand DNA, inspirations) are not driven: they need the Backend, which this change does not touch. Each brand is created by the real /onboarding page for a fresh user, then its persisted step is set to the finale (a) or to Choose your plan (b)',
  'billing NOT live (PGRST106) is not benched here: the shared local PostgREST exposure must not be toggled while other shells bench. The not-live branch is covered by unit tests that inject PGRST106 (brandAccess.server, productAccess, BrandBillingPanel, resumeScreen)',
]);
const { step, notes } = recorder;

/* -- onboarding state (brand_profiles.user_onboarding_states) ------------------------ */
type OnboardingRow = { brand_id: string; state: Record<string, unknown> };

async function onboardingRow(db: SupabaseClient, userId: string): Promise<OnboardingRow> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data, error } = await db
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .select('brand_id, state')
      .eq('user_id', userId);
    if (error) throw new Error(`user_onboarding_states: ${describeError(error)}`);
    const rows = (data ?? []) as OnboardingRow[];
    if (rows.length > 1) throw new Error(`expected one onboarding brand, found ${rows.length}`);
    if (rows[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`no onboarding state for user ${userId}`);
}

async function setOnboardingStep(db: SupabaseClient, userId: string, step: number) {
  const row = await onboardingRow(db, userId);
  const { error } = await db
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .update({ state: { ...row.state, step } })
    .eq('user_id', userId)
    .eq('brand_id', row.brand_id);
  if (error) throw new Error(`set onboarding step: ${describeError(error)}`);
}

async function completedAt(db: SupabaseClient, userId: string): Promise<unknown> {
  return (await onboardingRow(db, userId)).state.completedAt ?? null;
}

/* -- screenshots -------------------------------------------------------------------- */
async function shoot(page: Page, name: string, viewports = [DESKTOP, MOBILE]): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${name}-${viewport.width}x${viewport.height}.png`),
      animations: 'disabled',
      style: HIDE_TOASTS,
    });
  }
  await page.setViewportSize(DESKTOP);
}

/** A fresh user opens /onboarding; the real page creates their brand and onboarding state. */
async function startOnboarding(page: Page, db: SupabaseClient, userId: string): Promise<string> {
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Your website' })).toBeVisible({
    timeout: 180_000,
  });
  return (await onboardingRow(db, userId)).brand_id;
}

async function waitForDashboard(page: Page): Promise<void> {
  // The plan screen completes on its own once the product shows up; "Check again" is the
  // manual path if its bounded poll ran out first.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (/\/dashboard$/.test(new URL(page.url()).pathname)) return;
    const checkAgain = page.getByRole('button', { name: 'Check again' });
    if (await checkAgain.isVisible().catch(() => false)) await checkAgain.click();
    await page.waitForTimeout(2_000);
  }
  throw new Error(`never reached /dashboard (at ${page.url()})`);
}

test.describe.configure({ mode: 'serial' });

test.describe('billing:gates:fe:bench', () => {
  const db = serviceClient('billing-gates');
  const { stripe, webhookSecret } = sandboxStripe('billing-gates');
  const since = Math.floor(Date.now() / 1000) - 5;
  const created = { userIds: [] as string[], brandIds: [] as string[] };
  let payingUserId = '';
  let payingBrandId = '';
  let contractUserId = '';

  test.beforeAll(async () => {
    await step('billing-api is served locally', assertBillingApiServed);

    await step('(d) no src/ file reads the brand tier', async () => {
      const output = execFileSync('bun', ['test', 'src/lib/billing/noBrandTierReads.test.ts'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe',
      });
      notes.push(`tier grep: ${output.trim().split('\n').pop() ?? 'ok'}`);
    });

    await step('seed two fresh signup-equivalent users', async () => {
      payingUserId = await createUser(db, EMAILS.paying, PASSWORD);
      contractUserId = await createUser(db, EMAILS.contract, PASSWORD);
      created.userIds.push(payingUserId, contractUserId);
    });
  });

  test.afterAll(async () => {
    let deleted: string[] = [];
    try {
      // The id diff: every brand the app created for a user this run created.
      const { data, error } = await db
        .schema('brand_profiles')
        .from('brand_profiles')
        .select('id')
        .in('created_by', created.userIds);
      if (error) throw new Error(`owned brands: ${describeError(error)}`);
      const brandIds = [
        ...new Set([...created.brandIds, ...(data ?? []).map((row) => row.id as string)]),
      ];
      deleted = await cleanupBillingBench({
        db,
        stripe,
        since,
        brandIds,
        userIds: created.userIds,
      });
      recorder.record('cleanup by id', 'PASS', `${deleted.length} objects`);
    } catch (error) {
      recorder.record(
        'cleanup by id',
        'FAIL',
        error instanceof Error ? error.message : String(error),
      );
    }
    notes.push(`deleted: ${deleted.join(', ') || 'nothing'}`);
    recorder.print();
  });

  test('(a) a fresh signup pays for Organic Plus on the last step and lands on the dashboard', async ({
    browser,
  }) => {
    const session = await mintSessionBundleForEmail(EMAILS.paying);
    const context = await browser.newContext({ storageState: session.state, viewport: DESKTOP });
    const page = await context.newPage();

    try {
      await step('(a) /onboarding creates the fresh brand, with no product', async () => {
        payingBrandId = await startOnboarding(page, db, payingUserId);
        created.brandIds.push(payingBrandId);
        const entitlements = await brandEntitlements(db, payingBrandId);
        expect(entitlements.products).toEqual([]);
        expect(entitlements.billingModel).toBe('none');
      });

      await step('(a) the last onboarding screen leads to Choose your plan', async () => {
        await setOnboardingStep(db, payingUserId, 7);
        await page.reload();
        const next = page.getByRole('button', { name: 'Choose your plan →' });
        await expect(next).toBeVisible({ timeout: 120_000 });
        await next.click();
        await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Organic Plus, $30 a month' })).toBeVisible({
          timeout: 60_000,
        });
        await expect(
          page.getByRole('button', { name: 'Performance Plus, $300 a month' }),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Continue to checkout' })).toBeDisabled();
        await expect(page.getByRole('region', { name: 'Working with our team?' })).toBeVisible();
        expect((await onboardingRow(db, payingUserId)).state.step).toBe(8);
        expect(await completedAt(db, payingUserId)).toBeNull();
        await shoot(page, 'plan-step');
      });

      const sessionId = await step('(a) Organic Plus opens sandbox Checkout', async () => {
        const organic = page.getByRole('button', { name: 'Organic Plus, $30 a month' });
        await organic.click();
        await expect(organic).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('footer').getByText('$30 / month')).toBeVisible();
        await shoot(page, 'plan-selected', [DESKTOP]);
        await page.getByRole('button', { name: 'Continue to checkout' }).click();
        await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 60_000 });
        const id = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
        if (!id) throw new Error(`no test-mode session id in ${page.url()}`);
        const checkout = await stripe.checkout.sessions.retrieve(id);
        expect(checkout.livemode).toBe(false);
        expect(checkout.mode).toBe('subscription');
        expect(checkout.metadata?.continuum_brand_id).toBe(payingBrandId);
        expect(checkout.success_url).toContain(
          `/onboarding?brand=${payingBrandId}&checkout=success`,
        );
        return id;
      });

      const customerId = await step('(a) pay with 4242 and return to onboarding', async () => {
        await payWithTestCard(page, EMAILS.paying);
        await page.waitForURL(/\/onboarding\?brand=/, { timeout: 120_000 });
        const checkout = await stripe.checkout.sessions.retrieve(sessionId);
        expect(checkout.status).toBe('complete');
        const customer =
          typeof checkout.customer === 'string' ? checkout.customer : checkout.customer?.id;
        if (!customer) throw new Error('completed session has no customer');
        return customer;
      });

      await step('(a) replay the real sandbox events through the local webhook', async () => {
        for (let attempt = 1; attempt <= 8; attempt += 1) {
          const { delivered } = await replaySandboxEventsToWebhook({
            stripe,
            customerId,
            since,
            webhookUrl: WEBHOOK_URL,
            secret: webhookSecret,
          });
          const rejected = delivered.filter((event) => event.status >= 300);
          if (rejected.length > 0) {
            throw new Error(
              `webhook rejected ${rejected.map((e) => `${e.type}=${e.status} ${JSON.stringify(e.body)}`).join('; ')}`,
            );
          }
          const entitlements = await brandEntitlements(db, payingBrandId);
          if (entitlements.plans.includes('organic_studio')) {
            expect(entitlements.products).toEqual(['organic_agent', 'studio']);
            notes.push(
              `replayed ${delivered.length} events on attempt ${attempt}: ${[...new Set(delivered.map((e) => e.type))].join(', ')}`,
            );
            return;
          }
          await page.waitForTimeout(3_000);
        }
        throw new Error('entitlements never showed Organic Plus');
      });

      await step('(a) onboarding completes and lands on /dashboard', async () => {
        await waitForDashboard(page);
        expect(await completedAt(db, payingUserId)).not.toBeNull();
        // Not bounced back into onboarding.
        await page.waitForTimeout(2_000);
        expect(new URL(page.url()).pathname).toBe('/dashboard');
        await shoot(page, 'dashboard-after-plan', [DESKTOP]);
      });
    } finally {
      await context.close();
    }
  });

  test('(b) a brand at Choose your plan cannot finish until a Contract is granted', async ({
    browser,
  }) => {
    const session = await mintSessionBundleForEmail(EMAILS.contract);
    const context = await browser.newContext({ storageState: session.state, viewport: DESKTOP });
    const page = await context.newPage();

    try {
      const brandId = await step('(b) a second fresh brand reaches Choose your plan', async () => {
        const id = await startOnboarding(page, db, contractUserId);
        created.brandIds.push(id);
        await setOnboardingStep(db, contractUserId, 8);
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible({
          timeout: 120_000,
        });
        await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible({
          timeout: 60_000,
        });
        return id;
      });

      await step('(b) without a product it cannot complete', async () => {
        await page.getByRole('button', { name: 'Check again' }).click();
        await expect(page.getByTestId('plan-not-enabled')).toHaveText(
          "This brand isn't enabled yet. Ask your Continuum contact to turn it on.",
        );
        await page.waitForTimeout(2_000);
        expect(new URL(page.url()).pathname).toBe('/onboarding');
        expect(await completedAt(db, contractUserId)).toBeNull();
        expect((await brandEntitlements(db, brandId)).products).toEqual([]);
        await shoot(page, 'plan-not-enabled');
      });

      await step('(b) after a Contract grant the step passes and lands on /dashboard', async () => {
        await grantContract(db, brandId);
        expect((await brandEntitlements(db, brandId)).billingModel).toBe('contract');
        await page.getByRole('button', { name: 'Check again' }).click();
        await waitForDashboard(page);
        expect(await completedAt(db, contractUserId)).not.toBeNull();
      });
    } finally {
      await context.close();
    }
  });

  test('(c) the Organic Plus brand opens Canvas and Organic; paid media sends it to Billing', async ({
    browser,
  }) => {
    const session = await mintSessionBundleForEmail(EMAILS.paying);
    const context = await browser.newContext({ storageState: session.state, viewport: DESKTOP });
    const page = await context.newPage();

    try {
      await step('(c) /ai-studio opens for Organic Plus', async () => {
        await page.goto('/ai-studio');
        await expect(page.getByRole('heading', { name: 'AI Studio' })).toBeVisible({
          timeout: 180_000,
        });
        expect(new URL(page.url()).pathname).toBe('/ai-studio');
      });

      await step('(c) /organic opens for Organic Plus', async () => {
        await page.goto('/organic');
        await expect(page.getByRole('navigation', { name: 'Organic workspace' })).toBeVisible({
          timeout: 180_000,
        });
        expect(new URL(page.url()).pathname).toBe('/organic');
      });

      for (const route of ['/scale', '/forge', '/scale/approvals']) {
        await step(
          `(c) ${route} sends it to Billing with Performance Plus highlighted`,
          async () => {
            await page.goto(route);
            await page.waitForURL(BILLING_NEED_PAID_MEDIA, { timeout: 180_000 });
            const performance = page.getByRole('listitem', { name: 'Performance Plus' });
            await expect(performance).toHaveAttribute('data-highlighted', 'true', {
              timeout: 60_000,
            });
            await expect(performance.getByTestId('billing-plan-needed')).toHaveText(
              'Unlocks paid media',
            );
            await expect(page.getByRole('listitem', { name: 'Organic Plus' })).not.toHaveAttribute(
              'data-highlighted',
              'true',
            );
            await expect(
              page
                .getByRole('listitem', { name: 'Organic Plus' })
                .getByText('Active', { exact: true }),
            ).toBeVisible();
            if (route === '/scale') await shoot(page, 'scale-to-billing');
          },
        );
      }

      await step('(c) the sidebar locks exactly the paid-media entries', async () => {
        const locked = await page
          .locator('a[data-locked="true"]')
          .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));
        expect(locked.sort()).toEqual(PAID_MEDIA_LOCKS);
        for (const href of ['/ai-studio', '/organic?tab=agent', '/organic?tab=planner']) {
          await expect(page.locator(`a[href="${href}"]`).first()).not.toHaveAttribute(
            'data-locked',
            'true',
          );
        }
        // Still a link to the page, which is what sends the brand to Billing.
        await expect(page.locator('a[href="/forge"][data-locked="true"]')).toHaveCount(1);
        await page.locator('a[href="/ai-studio"]').first().hover();
        await page.waitForTimeout(600);
        await shoot(page, 'sidebar-locks', [DESKTOP]);
      });
    } finally {
      await context.close();
    }
  });
});
