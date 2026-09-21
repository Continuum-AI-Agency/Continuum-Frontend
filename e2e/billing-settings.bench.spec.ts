import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { brandEntitlementsSchema } from '@continuum/contracts';
import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';
import Stripe from 'stripe';
import { replaySandboxEventsToWebhook } from '../../packages/billing/src/replayEvents';
import { assertStripeTestSecretKey } from '../../packages/billing/src/testModeGuard';
import { mintSessionBundleForEmail } from './support/auth';

// billing:settings:e2e:bench — Settings → Billing, end to end, nothing mocked.
//
//   owner     fresh local user owning a fresh tier-0 brand: opens Settings → Billing, picks
//             Organic Plus, pays on the Stripe-hosted SANDBOX Checkout with 4242, returns,
//             and the panel shows Organic Plus active, card on file, 1,000 Canvas credits and
//             the paid invoice; Manage payment method lands on the sandbox Customer Portal.
//   member    an admin (not owner) of that brand: the panel is locked, and billing-api 403s.
//   contract  the owner of a Contract brand: "Managed by Continuum", nothing to buy.
//
// The one hop NOT exercised: Stripe's own webhook delivery to our URL. The local
// stripe-billing-webhook has no public endpoint, so the bench replays the REAL sandbox events
// for this customer through it, signed with the local secret (replaySandboxEventsToWebhook).
//
// Cleanup is by id: only the users, brands and sandbox customer this run created.

const REPO_ROOT = path.resolve(process.cwd(), '..');
const SCREENSHOT_DIR = path.join(process.cwd(), 'e2e/__screenshots__/billing');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-billing-webhook`;
const BILLING_API_URL = `${SUPABASE_URL}/functions/v1/billing-api`;
// billing_private is not exposed over PostgREST; its idempotency rows are cleaned directly.
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const RUN_ID = Date.now().toString(36);
const PASSWORD = `Bench-${RUN_ID}-pw1!`;
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

const EMAILS = {
  owner: `billing-owner-${RUN_ID}@continuum.test`,
  member: `billing-member-${RUN_ID}@continuum.test`,
  contract: `billing-contract-${RUN_ID}@continuum.test`,
};

/* -- the Recorder envelope (same shape as the Backend `_bench` Recorder) ---------- */
const graded: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
const notes: string[] = [
  'unexercised hop: Stripe delivering webhooks to our URL — the real sandbox events are replayed through the locally served stripe-billing-webhook instead',
];
const benchStartedAt = new Date().toISOString();
const benchStartedMs = Date.now();

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    graded.push({ step: name, grade: 'PASS' });
    return result;
  } catch (error) {
    graded.push({
      step: name,
      grade: 'FAIL',
      detail: error instanceof Error ? error.message.split('\n')[0] : String(error),
    });
    throw error;
  }
}

function printBenchEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  console.log(
    JSON.stringify({
      bench: 'billing:settings:e2e:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/* -- clients ------------------------------------------------------------------------ */
function serviceClient(): SupabaseClient {
  const host = new URL(SUPABASE_URL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `[billing-settings] SUPABASE_URL host "${host}" is not local — refusing to write`,
    );
  }
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Only the sandbox keys, and only from the gitignored functions env file — never root .env,
// which holds the live keys.
function sandboxStripe(): { stripe: Stripe; webhookSecret: string } {
  const env = parseEnv(
    readFileSync(path.join(REPO_ROOT, 'supabase/functions/.env.billing.local'), 'utf8'),
  );
  const secretKey = env.STRIPE_BENCH_SECRET_KEY ?? '';
  const webhookSecret = env.STRIPE_BENCH_WEBHOOK_SECRET ?? '';
  assertStripeTestSecretKey(secretKey);
  if (!webhookSecret) throw new Error('[billing-settings] STRIPE_BENCH_WEBHOOK_SECRET is unset');
  return {
    stripe: new Stripe(secretKey, { apiVersion: '2025-08-27.basil' }),
    webhookSecret,
  };
}

function describeError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(' · ');
}

/* -- seeding ------------------------------------------------------------------------ */
async function createUser(db: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function createBrand(db: SupabaseClient, ownerId: string, name: string): Promise<string> {
  const { data, error } = await db
    .schema('brand_profiles')
    .from('brand_profiles')
    .insert({
      brand_name: name,
      created_by: ownerId,
      active: true,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`brand insert: ${describeError(error)}`);
  const brandId = (data as { id: string }).id;
  // A trigger grants the creator owner; the upsert asserts it without caring who wrote it.
  const { error: permissionError } = await db
    .schema('brand_profiles')
    .from('permissions')
    .upsert(
      { brand_profile_id: brandId, user_id: ownerId, role: 'owner' },
      { onConflict: 'brand_profile_id,user_id' },
    );
  if (permissionError) throw new Error(`owner permission: ${describeError(permissionError)}`);
  return brandId;
}

async function brandEntitlements(db: SupabaseClient, brandId: string) {
  const { data, error } = await db
    .schema('billing')
    .rpc('get_brand_entitlements', { p_brand_id: brandId });
  if (error) throw new Error(`get_brand_entitlements: ${describeError(error)}`);
  return brandEntitlementsSchema.parse(data);
}

/* -- Stripe-hosted Checkout ---------------------------------------------------------- */
async function payWithTestCard(page: Page, email: string): Promise<void> {
  // Checkout lists several methods as an accordion; the card radio reveals the card fields.
  const cardOption = page.locator('#payment-method-accordion-item-title-card');
  await cardOption.or(page.locator('#cardNumber')).first().waitFor({ timeout: 60_000 });
  // The brand's Stripe customer carries no email, so Checkout asks for one.
  const emailField = page.locator('#email');
  if ((await emailField.isVisible()) && !(await emailField.inputValue())) {
    await emailField.fill(email);
  }
  if (await cardOption.count()) await cardOption.check({ force: true });
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  const name = page.locator('#billingName');
  if (await name.isVisible()) await name.fill('Billing Bench');
  const country = page.locator('#billingCountry');
  if (await country.isVisible()) await country.selectOption('US');
  const postal = page.locator('#billingPostalCode');
  if (await postal.isVisible()) await postal.fill('10001');
  // Link would otherwise ask for a phone number to save the card.
  const link = page.locator('#enableStripePass');
  if ((await link.isVisible()) && (await link.isChecked())) await link.uncheck();
  await page.getByTestId('hosted-payment-submit-button').click();
}

// Toasts float over the panel, so the toast viewport (ToastProvider) is hidden for the capture
// only — the screenshots show the layout itself. Each state is shot at the top of the panel
// and, when it has one, at the invoices list.
const HIDE_TOASTS = '.fixed.bottom-4.right-4.z-\\[9999\\] { visibility: hidden !important; }';

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const invoices = page.getByRole('region', { name: 'Invoices' });
  for (const viewport of [DESKTOP, MOBILE]) {
    const size = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.getByRole('heading', { name: 'Billing & credits' }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${name}-${size}.png`),
      animations: 'disabled',
      style: HIDE_TOASTS,
    });
    if (await invoices.count()) {
      await invoices.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${name}-lower-${size}.png`),
        animations: 'disabled',
        style: HIDE_TOASTS,
      });
    }
  }
  await page.setViewportSize(DESKTOP);
}

const billingSettingsPath = '/settings?section=billing';
const purchaseButtons = /^(Choose|Add|Remove) .*Plus$|^Buy credits$/;

test.describe.configure({ mode: 'serial' });

test.describe('billing:settings:e2e:bench', () => {
  const db = serviceClient();
  const { stripe, webhookSecret } = sandboxStripe();
  const since = Math.floor(Date.now() / 1000) - 5;
  const created = { userIds: [] as string[], brandIds: [] as string[] };
  let ownerBrandId = '';
  let contractBrandId = '';

  test.beforeAll(async () => {
    await step('billing-api is served locally', async () => {
      const response = await fetch(`${BILLING_API_URL}/brands/${crypto.randomUUID()}/overview`);
      // No bearer → the function itself answers 401. Anything else means it is not serving.
      if (response.status !== 401) {
        throw new Error(
          `billing-api answered ${response.status}; start it from the repo root with ` +
            '`supabase functions serve --env-file supabase/functions/.env.billing.local --no-verify-jwt`',
        );
      }
    });

    await step('seed owner, member and contract brands', async () => {
      const ownerId = await createUser(db, EMAILS.owner);
      const memberId = await createUser(db, EMAILS.member);
      const contractOwnerId = await createUser(db, EMAILS.contract);
      created.userIds.push(ownerId, memberId, contractOwnerId);

      ownerBrandId = await createBrand(db, ownerId, `Billing Bench ${RUN_ID}`);
      created.brandIds.push(ownerBrandId);
      const { error: memberError } = await db
        .schema('brand_profiles')
        .from('permissions')
        .insert({ brand_profile_id: ownerBrandId, user_id: memberId, role: 'admin' });
      if (memberError) throw new Error(`member permission: ${describeError(memberError)}`);

      contractBrandId = await createBrand(db, contractOwnerId, `Billing Contract ${RUN_ID}`);
      created.brandIds.push(contractBrandId);
      // What the admin Contract override writes: an off-Stripe subscription row plus products.
      const { error: subscriptionError } = await db
        .schema('billing')
        .from('brand_subscriptions')
        .insert({
          brand_id: contractBrandId,
          plan_code: 'contract',
          status: 'active',
          billing_model: 'contract',
        });
      if (subscriptionError)
        throw new Error(`contract subscription: ${describeError(subscriptionError)}`);
      const { error: productsError } = await db
        .schema('billing')
        .from('brand_products')
        .insert(
          ['studio', 'organic_agent', 'paid_media'].map((product) => ({
            brand_id: contractBrandId,
            product,
            source: 'contract',
            active: true,
          })),
        );
      if (productsError) throw new Error(`contract products: ${describeError(productsError)}`);

      const fresh = await brandEntitlements(db, ownerBrandId);
      expect(fresh.billingModel).toBe('none');
      expect(fresh.products).toEqual([]);
      const contract = await brandEntitlements(db, contractBrandId);
      expect(contract.billingModel).toBe('contract');
    });
  });

  test.afterAll(async () => {
    const deleted: string[] = [];
    try {
      const customerIds = new Set<string>();
      for (const brandId of created.brandIds) {
        const { data } = await db
          .schema('billing')
          .from('brand_subscriptions')
          .select('stripe_customer_id')
          .eq('brand_id', brandId)
          .maybeSingle();
        const persisted = (data as { stripe_customer_id: string | null } | null)
          ?.stripe_customer_id;
        if (persisted) customerIds.add(persisted);
      }
      // Belt and braces: any sandbox customer created during the run for one of our brands.
      for await (const customer of stripe.customers.list({ created: { gte: since }, limit: 100 })) {
        if (created.brandIds.includes(customer.metadata?.continuum_brand_id ?? '')) {
          customerIds.add(customer.id);
        }
      }
      for (const customerId of customerIds) {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.livemode !== false) throw new Error(`customer ${customerId} is live-mode`);
        if (!('deleted' in customer && customer.deleted)) {
          await stripe.customers.del(customerId);
          deleted.push(`stripe customer ${customerId}`);
        }
      }
      const pg = new PgClient({ connectionString: LOCAL_DB_URL });
      await pg.connect();
      try {
        const { rowCount } = await pg.query(
          'delete from billing_private.stripe_webhook_events where brand_id = any($1::uuid[]) or customer_id = any($2::text[])',
          [created.brandIds, [...customerIds]],
        );
        deleted.push(`${rowCount ?? 0} stripe_webhook_events rows`);
      } finally {
        await pg.end();
      }
      for (const brandId of created.brandIds) {
        // Permissions first: pause_automations_for_ineligible_member() looks the brand up.
        await db
          .schema('brand_profiles')
          .from('permissions')
          .delete()
          .eq('brand_profile_id', brandId);
        const { error } = await db
          .schema('brand_profiles')
          .from('brand_profiles')
          .delete()
          .eq('id', brandId);
        if (error) throw new Error(`delete brand ${brandId}: ${describeError(error)}`);
        deleted.push(`brand ${brandId}`);
      }
      for (const userId of created.userIds) {
        const { error } = await db.auth.admin.deleteUser(userId);
        if (error) throw new Error(`delete user ${userId}: ${error.message}`);
        deleted.push(`user ${userId}`);
      }
      graded.push({ step: 'cleanup by id', grade: 'PASS', detail: `${deleted.length} objects` });
    } catch (error) {
      graded.push({
        step: 'cleanup by id',
        grade: 'FAIL',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    notes.push(`deleted: ${deleted.join(', ') || 'nothing'}`);
    printBenchEnvelope();
  });

  test('owner buys Organic Plus through Stripe-hosted Checkout', async ({ browser }) => {
    const owner = await mintSessionBundleForEmail(EMAILS.owner);
    const context = await browser.newContext({ storageState: owner.state, viewport: DESKTOP });
    const page = await context.newPage();

    try {
      await step('panel offers Checkout to a brand with no plan', async () => {
        await page.goto(billingSettingsPath);
        await expect(page.getByRole('button', { name: 'Choose Organic Plus' })).toBeVisible({
          timeout: 120_000,
        });
        await expect(page.getByRole('button', { name: 'Choose Performance Plus' })).toBeVisible();
        await expect(page.getByTestId('billing-card-status')).toHaveText('No card on file');
        await expect(page.getByRole('button', { name: 'Manage payment method' })).toHaveCount(0);
        await shoot(page, 'no-plan');
      });

      const sessionId = await step('Choose Organic Plus opens sandbox Checkout', async () => {
        await page.getByRole('button', { name: 'Choose Organic Plus' }).click();
        await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 60_000 });
        const id = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
        if (!id) throw new Error(`no test-mode session id in ${page.url()}`);
        const session = await stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] });
        expect(session.livemode).toBe(false);
        expect(session.mode).toBe('subscription');
        expect(session.metadata?.continuum_brand_id).toBe(ownerBrandId);
        return id;
      });

      await step('pay with 4242 and return to Settings → Billing', async () => {
        await payWithTestCard(page, EMAILS.owner);
        await page.waitForURL(/\/settings\?section=billing&checkout=success/, { timeout: 120_000 });
      });

      const customerId = await step(
        'sandbox subscription is active for the brand customer',
        async () => {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          expect(session.status).toBe('complete');
          const customer =
            typeof session.customer === 'string' ? session.customer : session.customer?.id;
          if (!customer) throw new Error('completed session has no customer');
          return customer;
        },
      );

      await step('replay the real sandbox events through the local webhook', async () => {
        // Stripe finishes emitting invoice/subscription events a moment after the redirect;
        // replay until the ledger reflects them (the webhook is idempotent per event id).
        for (let attempt = 1; attempt <= 6; attempt += 1) {
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
          const entitlements = await brandEntitlements(db, ownerBrandId);
          const studio = entitlements.buckets.find((bucket) => bucket.bucket === 'studio');
          if (entitlements.plans.includes('organic_studio') && studio?.includedUsd === 10) {
            notes.push(
              `replayed ${delivered.length} events on attempt ${attempt}: ${[...new Set(delivered.map((e) => e.type))].join(', ')}`,
            );
            return;
          }
          await page.waitForTimeout(3_000);
        }
        throw new Error('ledger never showed Organic Plus with 1,000 included credits');
      });

      await step(
        'panel shows Organic Plus active, card on file, 1,000 credits, paid invoice',
        async () => {
          const organic = page.getByRole('listitem', { name: 'Organic Plus' });
          await expect(organic.getByText('Active', { exact: true })).toBeVisible({
            timeout: 60_000,
          });
          await expect(page.getByTestId('billing-card-status')).toHaveText('Card on file');
          await expect(page.getByTestId('canvas-credits-available')).toHaveText('1,000');
          const invoice = page.getByTestId('billing-invoice-row').first();
          await expect(invoice).toContainText('paid');
          await expect(invoice).toContainText('$30');
          await expect(page.getByRole('button', { name: 'Add Performance Plus' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Choose Organic Plus' })).toHaveCount(0);
          await shoot(page, 'organic-plus-active');
        },
      );

      await step('Manage payment method opens the sandbox Customer Portal', async () => {
        await page.getByRole('button', { name: 'Manage payment method' }).click();
        await page.waitForURL(/^https:\/\/billing\.stripe\.com\//, { timeout: 60_000 });
        await expect(page.locator('body')).toContainText(/test mode|sandbox/i, { timeout: 30_000 });
      });
    } finally {
      await context.close();
    }
  });

  test('a non-owner member sees billing locked, and billing-api refuses them', async ({
    browser,
  }) => {
    const member = await mintSessionBundleForEmail(EMAILS.member);
    const context = await browser.newContext({ storageState: member.state, viewport: DESKTOP });
    const page = await context.newPage();
    try {
      await step('member sees the locked panel with nothing to buy', async () => {
        await page.goto(billingSettingsPath);
        await expect(page.getByTestId('billing-locked')).toBeVisible({ timeout: 120_000 });
        await expect(page.getByTestId('billing-locked')).toContainText(
          'Only the brand owner manages billing',
        );
        await expect(page.getByRole('button', { name: purchaseButtons })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Manage payment method' })).toHaveCount(0);
        await shoot(page, 'member-locked');
      });

      await step('billing-api answers the member 403 billing_manager_required', async () => {
        const response = await fetch(`${BILLING_API_URL}/brands/${ownerBrandId}/overview`, {
          headers: { Authorization: `Bearer ${member.accessToken}` },
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: 'billing_manager_required' });
      });
    } finally {
      await context.close();
    }
  });

  test('a Contract brand is managed by Continuum with no checkout', async ({ browser }) => {
    const contractOwner = await mintSessionBundleForEmail(EMAILS.contract);
    const context = await browser.newContext({
      storageState: contractOwner.state,
      viewport: DESKTOP,
    });
    const page = await context.newPage();
    try {
      await step('contract owner sees Managed by Continuum and no plan buttons', async () => {
        await page.goto(billingSettingsPath);
        await expect(page.getByTestId('billing-contract')).toBeVisible({ timeout: 120_000 });
        await expect(page.getByTestId('billing-contract')).toContainText('Managed by Continuum');
        await expect(page.getByRole('button', { name: purchaseButtons })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Manage payment method' })).toHaveCount(0);
        await shoot(page, 'contract-managed');
      });
    } finally {
      await context.close();
    }
  });
});
