import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createNodeData } from '@continuum/contracts';
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
//   (d) tier      no src/ file reads the brand tier outside the one `grandfathered` read.
//   (e) grandfathered  a tier-2 brand kept on its tier-era access (plan `grandfathered`, model
//                 `prepaid`, every product from an admin, $220 granted) opens Canvas; /forge
//                 gives the tier-3 toast and returns to the dashboard; the sidebar shows its
//                 22,000 credits (metered, not "Managed"); Settings → Billing sells it packs.
//   (f) refusal   the same brand at 0 credits runs a real Canvas image node: the LOCAL Backend
//                 answers 402 before any provider call, and the canvas shows "Out of Canvas
//                 credits" with Buy credits — never "Generation failed" or the raw JSON — the node
//                 keeps its prompt and says why, nothing is metered, and the node's Buy credits
//                 opens the Top up dialog over the canvas (5 packs pre-selected). One pack is
//                 bought on SANDBOX Checkout, whose success URL is the same canvas room; once the
//                 real events are replayed, "Canvas credits added" shows there and the sidebar
//                 reads 1,000 credits — no detour through Settings. Needs the local Backend
//                 allowing this origin (`ALLOWED_ORIGINS=http://127.0.0.1:3126 bun run
//                 dev:be:local-supabase`); without it the test is skipped and says so.
//
// Cleanup is by id: only the users this run created and the brands they own.

const SCREENSHOT_DIR = path.join(process.cwd(), 'e2e/__screenshots__/billing-gates');
const RUN_ID = Date.now().toString(36);
const PASSWORD = `Bench-${RUN_ID}-pw1!`;
const EMAILS = {
  paying: `gates-paying-${RUN_ID}@continuum.test`,
  contract: `gates-contract-${RUN_ID}@continuum.test`,
  grandfathered: `gates-grandfathered-${RUN_ID}@continuum.test`,
};
const FORGE_TIER_TOAST = 'Forge is available on Tier 3. Please contact an Administrator.';
const BILLING_NEED_PAID_MEDIA = /\/settings\?section=billing&need=paid_media&from=%2F[\w%-]+$/;
const API_URL = process.env.BILLING_GATES_API_URL ?? 'http://localhost:4000';
const REFUSAL_ROOM_ID = crypto.randomUUID();
const REFUSAL_NODE_ID = 'refusal-image';
const REFUSAL_PROMPT = 'A red bicycle leaning on a white wall';
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
  let grandfatheredUserId = '';
  let grandfatheredBrandId = '';

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

    await step('seed three fresh signup-equivalent users', async () => {
      payingUserId = await createUser(db, EMAILS.paying, PASSWORD);
      contractUserId = await createUser(db, EMAILS.contract, PASSWORD);
      grandfatheredUserId = await createUser(db, EMAILS.grandfathered, PASSWORD);
      created.userIds.push(payingUserId, contractUserId, grandfatheredUserId);
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

  test('(e) a grandfathered tier-2 brand: Canvas opens, Forge keeps tier 3, credits are metered', async ({
    browser,
  }) => {
    const session = await mintSessionBundleForEmail(EMAILS.grandfathered);
    const context = await browser.newContext({ storageState: session.state, viewport: DESKTOP });
    const page = await context.newPage();

    try {
      const brandId = await step(
        '(e) a fresh brand is grandfathered at tier 2 with $220',
        async () => {
          const id = await startOnboarding(page, db, grandfatheredUserId);
          created.brandIds.push(id);
          const billing = db.schema('billing');
          const { error: subscriptionError } = await billing.from('brand_subscriptions').insert({
            brand_id: id,
            plan_code: 'grandfathered',
            status: 'active',
            billing_model: 'prepaid',
          });
          if (subscriptionError) throw new Error(describeError(subscriptionError));
          const { error: productsError } = await billing.from('brand_products').insert(
            ['studio', 'organic_agent', 'paid_media', 'trends', 'mcp'].map((product) => ({
              brand_id: id,
              product,
              tier: product === 'trends' ? 'pro' : null,
              source: 'admin',
            })),
          );
          if (productsError) throw new Error(describeError(productsError));
          const { error: tierError } = await db
            .schema('brand_profiles')
            .from('brand_profiles')
            .update({ tier: 2 })
            .eq('id', id);
          if (tierError) throw new Error(describeError(tierError));
          const { error: grantError } = await billing.rpc('admin_grant_credits', {
            p_brand_id: id,
            p_usd: 220,
            p_ref: `gates-fe-bench-${RUN_ID}`,
            p_meta: { bench: 'billing:gates:fe:bench' },
          });
          if (grantError) throw new Error(describeError(grantError));
          const entitlements = await brandEntitlements(db, id);
          expect(entitlements.planCode).toBe('grandfathered');
          expect(entitlements.billingModel).toBe('none');
          expect(entitlements.creditBalance.totalCredits).toBe(22_000);
          // Its products let the plan step finish onboarding on its own.
          await setOnboardingStep(db, grandfatheredUserId, 8);
          await page.reload();
          await waitForDashboard(page);
          return id;
        },
      );
      grandfatheredBrandId = brandId;

      await step('(e) /ai-studio opens and no sidebar entry is locked', async () => {
        await page.goto('/ai-studio');
        await expect(page.getByRole('heading', { name: 'AI Studio' })).toBeVisible({
          timeout: 180_000,
        });
        expect(new URL(page.url()).pathname).toBe('/ai-studio');
        await expect(page.locator('a[data-locked="true"]')).toHaveCount(0);
      });

      await step('(e) the sidebar shows its 22,000 credits, metered — not "Managed"', async () => {
        const widget = page.getByTestId('sidebar-billing');
        await expect(widget).toHaveAccessibleName(
          'Billing: Canvas credits, 22,000 credits remaining',
          { timeout: 60_000 },
        );
        await expect(widget).toHaveAttribute('data-kind', 'metered');
        await shoot(page, 'grandfathered-sidebar', [DESKTOP]);
      });

      await step('(e) /forge gives the tier-3 toast and returns to the dashboard', async () => {
        await page.goto('/forge');
        // The toast lives 6s; a cold dev compile of /dashboard can outlast it, so read it first.
        await expect(
          page.getByRole('region', { name: 'Notifications' }).getByText(FORGE_TIER_TOAST),
        ).toBeVisible({ timeout: 180_000 });
        await page.waitForURL(/\/dashboard$/, { timeout: 180_000 });
        expect((await brandEntitlements(db, brandId)).products).toContain('paid_media');
        await shoot(page, 'grandfathered-forge-toast', [DESKTOP]);
      });

      await step('(e) Settings → Billing sells it credit packs (no plan needed)', async () => {
        await page.goto('/settings?section=billing#credits');
        const credits = page.locator('#credits');
        await expect(credits.getByRole('button', { name: 'Buy credits' })).toBeVisible({
          timeout: 120_000,
        });
        await expect(credits).toContainText('22,000');
        await shoot(page, 'grandfathered-billing-credits', [DESKTOP]);
      });
    } finally {
      await context.close();
    }
  });

  test('(f) out of credits, a real Canvas run sells credits and keeps the node', async ({
    browser,
  }) => {
    // The browser calls the Backend cross-origin, so it must be up AND allow this origin.
    const origin = new URL(test.info().project.use.baseURL ?? '').origin;
    const backendUp = await fetch(`${API_URL}/healthz`, { headers: { Origin: origin } })
      .then((response) => response.headers.get('access-control-allow-origin') === origin)
      .catch(() => false);
    if (!backendUp) {
      notes.push(
        `(f) SKIPPED — unexercised hop: no local Backend at ${API_URL} allowing ${origin}. ` +
          `Start it with ALLOWED_ORIGINS=${origin} bun run dev:be:local-supabase.`,
      );
    }
    test.skip(!backendUp, `needs the local Backend at ${API_URL} allowing ${origin}`);
    expect(grandfatheredBrandId, '(e) must have run').not.toBe('');
    const brandId = grandfatheredBrandId;
    const billing = db.schema('billing');

    await step(
      '(f) the grandfathered brand spends its balance and holds a Canvas room',
      async () => {
        const { error: spendError } = await billing
          .from('brand_credit_balance')
          .update({ balance_usd: 0, last_month_rollover_usd: 0 })
          .eq('brand_id', brandId);
        if (spendError) throw new Error(describeError(spendError));
        expect((await brandEntitlements(db, brandId)).creditBalance.totalCredits).toBe(0);

        const node = createNodeData('nanoGen', { positivePrompt: REFUSAL_PROMPT });
        const { error: roomError } = await db.schema('brand_profiles').from('canvas_rooms').insert({
          id: REFUSAL_ROOM_ID,
          brand_profile_id: brandId,
          name: 'Billing refusal bench',
          created_by: grandfatheredUserId,
        });
        if (roomError) throw new Error(describeError(roomError));
        const { error: sessionError } = await db
          .schema('brand_profiles')
          .from('canvas_sessions')
          .insert({
            brand_profile_id: brandId,
            room_id: REFUSAL_ROOM_ID,
            nodes: [
              {
                id: REFUSAL_NODE_ID,
                type: 'nanoGen',
                position: { x: 0, y: 0 },
                data: node.data,
                ...(node.style
                  ? { style: node.style, width: node.style.width, height: node.style.height }
                  : {}),
              },
            ],
            edges: [],
            deleted_node_ids: [],
            deleted_edge_ids: [],
            editor_session_id: crypto.randomUUID(),
            editor_user_id: grandfatheredUserId,
          });
        if (sessionError) throw new Error(describeError(sessionError));
      },
    );

    const session = await mintSessionBundleForEmail(EMAILS.grandfathered);
    const context = await browser.newContext({ storageState: session.state, viewport: DESKTOP });
    const page = await context.newPage();
    try {
      const notifications = page.getByRole('region', { name: 'Notifications' });
      const node = page.locator(`.react-flow__node[data-id="${REFUSAL_NODE_ID}"]`);

      await step('(f) Run on the image node is refused with the Buy credits toast', async () => {
        await page.goto(`/ai-studio?roomId=${REFUSAL_ROOM_ID}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('studio-canvas-header')).toBeVisible({ timeout: 180_000 });
        await expect(node).toBeVisible({ timeout: 60_000 });
        // Run Node lives on the node's hover toolbar, outside the node's own DOM. Hover, never
        // select: selecting opens the inspector over the toolbar.
        await node.hover();
        await page.getByRole('button', { name: 'Run Node' }).click({ timeout: 30_000 });
        await expect(notifications.getByText('Out of Canvas credits')).toBeVisible({
          timeout: 60_000,
        });
        await expect(notifications.getByRole('button', { name: 'Buy credits' })).toBeVisible();
        await expect(notifications.getByText(/Generation failed|API request failed/)).toHaveCount(
          0,
        );
        await shoot(page, 'refusal-canvas-toast', [DESKTOP]);
      });

      await step('(f) the node says why, keeps its prompt, and nothing was metered', async () => {
        await expect(node).toContainText('Out of Canvas credits');
        await expect(node).not.toContainText('credits_exhausted');
        const { data: saved, error: savedError } = await db
          .schema('brand_profiles')
          .from('canvas_sessions')
          .select('nodes')
          .eq('room_id', REFUSAL_ROOM_ID)
          .single();
        if (savedError) throw new Error(describeError(savedError));
        const savedNode = (saved.nodes as { id: string; data: Record<string, unknown> }[]).find(
          (candidate) => candidate.id === REFUSAL_NODE_ID,
        );
        expect(savedNode?.data.positivePrompt).toBe(REFUSAL_PROMPT);
        const { count, error: usageError } = await billing
          .from('usage_events')
          .select('id', { count: 'exact', head: true })
          .eq('brand_id', brandId);
        if (usageError) throw new Error(describeError(usageError));
        expect(count).toBe(0);
      });

      await step(
        "(f) the node's Buy credits opens Top up over the canvas, 5 packs pre-selected",
        async () => {
          await node.getByTestId('node-buy-credits').click();
          const dialog = page.getByTestId('top-up-dialog');
          await expect(dialog).toBeVisible({ timeout: 30_000 });
          await expect(page.getByTestId('top-up-balance')).toContainText('Out of credits');
          await expect(page.getByTestId('top-up-pack-5')).toHaveAttribute('data-checked', '');
          await expect(page.getByTestId('top-up-continue')).toContainText('$50');
          expect(new URL(page.url()).pathname).toBe('/ai-studio');
          await shoot(page, 'top-up-dialog', [DESKTOP, MOBILE]);
          // The app ignores prefers-color-scheme unless the stored mode is `system`; set the
          // same <html> attributes its theme bootstrap does, without reloading the dialog away.
          const setAppearance = (appearance: 'dark' | 'light') =>
            page.evaluate((mode) => {
              const root = document.documentElement;
              root.setAttribute('data-theme', mode);
              root.style.colorScheme = mode;
              root.classList.remove(mode === 'dark' ? 'light' : 'dark');
              root.classList.add(mode);
            }, appearance);
          await setAppearance('dark');
          await shoot(page, 'top-up-dialog-dark', [DESKTOP]);
          await setAppearance('light');
        },
      );

      const sessionId = await step(
        '(f) one pack opens sandbox Checkout that returns to the same canvas room',
        async () => {
          await page.getByTestId('top-up-pack-1').click();
          await expect(page.getByTestId('top-up-continue')).toContainText('$10');
          await page.getByTestId('top-up-continue').click();
          await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 60_000 });
          const id = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
          if (!id) throw new Error(`no test-mode session id in ${page.url()}`);
          const checkout = await stripe.checkout.sessions.retrieve(id);
          expect(checkout.livemode).toBe(false);
          expect(checkout.mode).toBe('payment');
          const successUrl = new URL(checkout.success_url ?? '');
          expect(successUrl.pathname).toBe('/ai-studio');
          expect(successUrl.searchParams.get('roomId')).toBe(REFUSAL_ROOM_ID);
          expect(successUrl.searchParams.get('checkout')).toBe('success');
          expect(successUrl.searchParams.has('section')).toBe(false);
          return id;
        },
      );

      await step('(f) paid: back on the canvas, the credits are confirmed in place', async () => {
        await payWithTestCard(page, EMAILS.grandfathered);
        await page.waitForURL(
          (url) =>
            url.pathname === '/ai-studio' && url.searchParams.get('roomId') === REFUSAL_ROOM_ID,
          { timeout: 180_000 },
        );
        const checkout = await stripe.checkout.sessions.retrieve(sessionId);
        const customerId =
          typeof checkout.customer === 'string' ? checkout.customer : checkout.customer?.id;
        if (!customerId) throw new Error('completed session has no customer');
        for (let attempt = 1; attempt <= 8; attempt += 1) {
          await replaySandboxEventsToWebhook({
            stripe,
            customerId,
            since,
            webhookUrl: WEBHOOK_URL,
            secret: webhookSecret,
          });
          if ((await brandEntitlements(db, brandId)).creditBalance.purchasedCredits > 0) break;
          await page.waitForTimeout(2_000);
        }
        expect((await brandEntitlements(db, brandId)).creditBalance.purchasedCredits).toBe(1_000);
        await expect(notifications.getByText('Canvas credits added')).toBeVisible({
          timeout: 60_000,
        });
        // They never left, so there is no way back to offer.
        await expect(
          notifications.getByRole('button', { name: 'Back to where you were' }),
        ).toHaveCount(0);
        await page.waitForURL((url) => !url.searchParams.has('checkout'), { timeout: 30_000 });
        await expect(page.getByTestId('sidebar-billing')).toContainText('1,000 credits', {
          timeout: 60_000,
        });
        await expect(node).toBeVisible({ timeout: 120_000 });
        await shoot(page, 'refusal-credits-added', [DESKTOP]);
      });
    } finally {
      await context.close();
    }
  });
});
