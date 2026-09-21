import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { brandEntitlementsSchema } from '@continuum/contracts';
import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';
import Stripe from 'stripe';
import { assertStripeTestSecretKey } from '../../../packages/billing/src/testModeGuard';

// The shared harness for the billing Playwright benches (billing:settings:e2e:bench,
// billing:gates:fe:bench): local-only Supabase, the Stripe SANDBOX, the Recorder envelope, the
// Stripe-hosted Checkout form, and cleanup by id. Every bench writes only what it created.

const REPO_ROOT = path.resolve(process.cwd(), '..');
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-billing-webhook`;
export const BILLING_API_URL = `${SUPABASE_URL}/functions/v1/billing-api`;
// billing_private is not exposed over PostgREST; its idempotency rows are cleaned directly.
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const DESKTOP = { width: 1280, height: 800 };
export const MOBILE = { width: 390, height: 844 };

/* -- the Recorder envelope (same shape as the Backend `_bench` Recorder) ---------- */
export type BenchRecorder = {
  notes: string[];
  step<T>(name: string, run: () => Promise<T>): Promise<T>;
  record(step: string, grade: 'PASS' | 'FAIL' | 'SKIP', detail?: string): void;
  print(): void;
};

export function createBenchRecorder(bench: string, notes: string[]): BenchRecorder {
  const graded: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  return {
    notes,
    async step(name, run) {
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
    },
    record(step, grade, detail) {
      graded.push({ step, grade, detail });
    },
    print() {
      const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
      for (const result of graded) {
        if (result.grade === 'PASS') counts.pass += 1;
        else if (result.grade === 'SKIP') counts.skip += 1;
        else counts.fail += 1;
      }
      console.log(
        JSON.stringify({
          bench,
          startedAt,
          durationMs: Date.now() - startedMs,
          results: graded,
          notes,
          counts,
          exitCode: counts.fail > 0 ? 1 : 0,
        }),
      );
    },
  };
}

/* -- clients ------------------------------------------------------------------------ */
export function serviceClient(label: string): SupabaseClient {
  const host = new URL(SUPABASE_URL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`[${label}] SUPABASE_URL host "${host}" is not local — refusing to write`);
  }
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Only the sandbox keys, and only from the gitignored functions env file — never root .env,
// which holds the live keys.
export function sandboxStripe(label: string): { stripe: Stripe; webhookSecret: string } {
  const env = parseEnv(
    readFileSync(path.join(REPO_ROOT, 'supabase/functions/.env.billing.local'), 'utf8'),
  );
  const secretKey = env.STRIPE_BENCH_SECRET_KEY ?? '';
  const webhookSecret = env.STRIPE_BENCH_WEBHOOK_SECRET ?? '';
  assertStripeTestSecretKey(secretKey);
  if (!webhookSecret) throw new Error(`[${label}] STRIPE_BENCH_WEBHOOK_SECRET is unset`);
  return {
    stripe: new Stripe(secretKey, { apiVersion: '2025-08-27.basil' }),
    webhookSecret,
  };
}

export function describeError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(' · ');
}

/** No bearer → billing-api itself answers 401. Anything else means it is not being served. */
export async function assertBillingApiServed(): Promise<void> {
  const response = await fetch(`${BILLING_API_URL}/brands/${crypto.randomUUID()}/overview`);
  if (response.status !== 401) {
    throw new Error(
      `billing-api answered ${response.status}; start it from the repo root with ` +
        '`supabase functions serve --env-file supabase/functions/.env.billing.local --no-verify-jwt`',
    );
  }
}

/* -- seeding ------------------------------------------------------------------------ */
export async function createUser(
  db: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

export async function createBrand(
  db: SupabaseClient,
  ownerId: string,
  name: string,
): Promise<string> {
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

/** What the admin Contract override writes: an off-Stripe subscription row plus products. */
export async function grantContract(db: SupabaseClient, brandId: string): Promise<void> {
  const { error: subscriptionError } = await db
    .schema('billing')
    .from('brand_subscriptions')
    .insert({
      brand_id: brandId,
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
        brand_id: brandId,
        product,
        source: 'contract',
        active: true,
      })),
    );
  if (productsError) throw new Error(`contract products: ${describeError(productsError)}`);
}

export async function brandEntitlements(db: SupabaseClient, brandId: string) {
  const { data, error } = await db
    .schema('billing')
    .rpc('get_brand_entitlements', { p_brand_id: brandId });
  if (error) throw new Error(`get_brand_entitlements: ${describeError(error)}`);
  return brandEntitlementsSchema.parse(data);
}

/* -- Stripe-hosted Checkout ---------------------------------------------------------- */
export async function payWithTestCard(page: Page, email: string): Promise<void> {
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

// Toasts float over the page, so the toast viewport (ToastProvider) is hidden for captures.
export const HIDE_TOASTS =
  '.fixed.bottom-4.right-4.z-\\[9999\\] { visibility: hidden !important; }';

/* -- cleanup by id -------------------------------------------------------------------- */
/**
 * Deletes exactly what a run created: the sandbox customers of its brands (live-mode refused),
 * their webhook idempotency rows, the brands (billing rows cascade) and the users (onboarding
 * state cascades). Returns what it deleted; throws on the first failure.
 */
export async function cleanupBillingBench(input: {
  db: SupabaseClient;
  stripe: Stripe;
  since: number;
  brandIds: string[];
  userIds: string[];
}): Promise<string[]> {
  const { db, stripe, since, brandIds, userIds } = input;
  const deleted: string[] = [];
  const customerIds = new Set<string>();
  for (const brandId of brandIds) {
    const { data } = await db
      .schema('billing')
      .from('brand_subscriptions')
      .select('stripe_customer_id')
      .eq('brand_id', brandId)
      .maybeSingle();
    const persisted = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
    if (persisted) customerIds.add(persisted);
  }
  // Belt and braces: any sandbox customer created during the run for one of our brands.
  for await (const customer of stripe.customers.list({ created: { gte: since }, limit: 100 })) {
    if (brandIds.includes(customer.metadata?.continuum_brand_id ?? '')) {
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
      [brandIds, [...customerIds]],
    );
    deleted.push(`${rowCount ?? 0} stripe_webhook_events rows`);
  } finally {
    await pg.end();
  }
  for (const brandId of brandIds) {
    // Permissions first: pause_automations_for_ineligible_member() looks the brand up.
    await db.schema('brand_profiles').from('permissions').delete().eq('brand_profile_id', brandId);
    const { error } = await db
      .schema('brand_profiles')
      .from('brand_profiles')
      .delete()
      .eq('id', brandId);
    if (error) throw new Error(`delete brand ${brandId}: ${describeError(error)}`);
    deleted.push(`brand ${brandId}`);
  }
  for (const userId of userIds) {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw new Error(`delete user ${userId}: ${error.message}`);
    deleted.push(`user ${userId}`);
  }
  return deleted;
}
