import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { brandEntitlementsSchema } from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';

// billing:admin:e2e:bench, UI half — an admin opens /admin, finds the customer, and on the
// customer's UI brand turns Canvas on and sets Contract. After each click the real
// get_brand_entitlements must change. The Stripe brand's paid_media is shown checked, locked,
// with a Stripe pill. Then the admin tools: the Client switch on a staff-made brand, "Full
// access for all brands" on a seeded account user, and a double-clicked "Add credits" that must
// grant once. Seeding and cleanup belong to scripts/billing-admin-e2e-bench.ts.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SCREENSHOT_DIR = path.join(process.cwd(), 'e2e/__screenshots__/billing-admin');
const VIEWPORT = { width: 1280, height: 800 };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[billing-admin] ${name} is unset — run bun run billing:admin:e2e:bench`);
  return value;
}

const graded: { step: string; grade: 'PASS' | 'FAIL'; detail?: string }[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

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

function serviceClient() {
  const host = new URL(SUPABASE_URL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`[billing-admin] SUPABASE_URL host "${host}" is not local`);
  }
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Toasts float over the aside, so the toast viewport (ToastProvider) is hidden for the capture.
const HIDE_TOASTS = '.fixed.bottom-4.right-4.z-\\[9999\\] { visibility: hidden !important; }';

async function shoot(page: Page, editor: Locator, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  // Other sessions edit this tree while the bench runs; a dev-server reload between the last
  // assertion and the capture would otherwise photograph the loading skeleton.
  await expect(editor).toBeVisible({ timeout: 120_000 });
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}-1280x800.png`),
    animations: 'disabled',
    style: HIDE_TOASTS,
  });
}

test.describe('billing:admin:e2e:bench UI', () => {
  const db = serviceClient();
  const adminEmail = required('BILLING_ADMIN_EMAIL');
  const customerEmail = required('BILLING_ADMIN_CUSTOMER_EMAIL');
  const uiBrand = required('BILLING_ADMIN_UI_BRAND_ID');
  const stripeBrand = required('BILLING_ADMIN_STRIPE_BRAND_ID');
  const staffEmail = required('BILLING_ADMIN_STAFF_EMAIL');
  const staffBrand = required('BILLING_ADMIN_STAFF_BRAND_ID');
  const accountEmail = required('BILLING_ADMIN_ACCOUNT_EMAIL');
  const accountBrands = required('BILLING_ADMIN_ACCOUNT_BRAND_IDS').split(',');

  async function entitlements(brandId = uiBrand) {
    const { data, error } = await db
      .schema('billing')
      .rpc('get_brand_entitlements', { p_brand_id: brandId });
    if (error) throw new Error(`get_brand_entitlements: ${error.code} · ${error.message}`);
    return brandEntitlementsSchema.parse(data);
  }

  async function isInternal(brandId: string): Promise<boolean> {
    const { data, error } = await db
      .schema('billing')
      .rpc('is_internal_brand', { p_brand_id: brandId });
    if (error) throw new Error(`is_internal_brand: ${error.code} · ${error.message}`);
    return data === true;
  }

  async function grantCount(brandId: string): Promise<number> {
    const { count, error } = await db
      .schema('billing')
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('kind', 'grant');
    if (error) throw new Error(`credit_transactions: ${error.code} · ${error.message}`);
    return count ?? 0;
  }

  const editorFor = (page: Page, brandId: string) =>
    page.locator(`[data-testid="brand-access-editor"][data-brand-id="${brandId}"]`);

  test.afterAll(() => {
    const fail = graded.filter((result) => result.grade === 'FAIL').length;
    console.log(
      JSON.stringify({
        bench: 'billing:admin:ui',
        startedAt,
        durationMs: Date.now() - startedMs,
        results: graded,
        counts: { pass: graded.length - fail, fail },
        exitCode: fail > 0 ? 1 : 0,
      }),
    );
  });

  test('admin toggles Canvas and sets Contract from /admin', async ({ browser }) => {
    const admin = await mintSessionBundleForEmail(adminEmail);
    const context = await browser.newContext({ storageState: admin.state, viewport: VIEWPORT });
    const page = await context.newPage();
    const uiEditor = page.locator(`[data-testid="brand-access-editor"][data-brand-id="${uiBrand}"]`);
    const stripeEditor = page.locator(
      `[data-testid="brand-access-editor"][data-brand-id="${stripeBrand}"]`,
    );

    await step('the product grid replaces the Tier control for the customer', async () => {
      await page.goto(`/admin?query=${encodeURIComponent(customerEmail)}`);
      await expect(uiEditor).toBeVisible({ timeout: 240_000 });
      await expect(page.getByText('Product access activates at billing go-live.')).toHaveCount(0);
      await expect(page.getByRole('combobox').filter({ hasText: /^Tier \d$/ })).toHaveCount(0);
      const before = await entitlements();
      expect(before.products).toEqual([]);
      await shoot(page, uiEditor, 'grid-before');
    });

    await step('Stripe-sourced Performance is checked, locked and pilled', async () => {
      const performance = stripeEditor.getByRole('checkbox', { name: 'Performance' });
      await expect(performance).toHaveAttribute('aria-checked', 'true');
      await expect(performance).toHaveAttribute('aria-disabled', 'true');
      await expect(stripeEditor.getByText('Stripe', { exact: true })).toBeVisible();
      await expect(stripeEditor.getByTestId('brand-billing-plan')).toHaveText(
        'Performance Plus · active',
      );
      await shoot(page, stripeEditor, 'grid-stripe');
    });

    await step('Canvas on → get_brand_entitlements shows studio', async () => {
      await uiEditor.getByRole('checkbox', { name: 'Canvas' }).click();
      await expect
        .poll(async () => (await entitlements()).products, { timeout: 30_000 })
        .toEqual(['studio']);
      await expect(uiEditor.getByRole('checkbox', { name: 'Canvas' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    await step('Contract on (confirmed) → billingModel contract, every product', async () => {
      await uiEditor.getByRole('switch', { name: 'Contract' }).click();
      await page.getByRole('button', { name: 'Set Contract' }).click();
      // admin-update-access writes the subscription row before the product rows, so poll the
      // whole state: a read between the two writes sees Contract with the old products.
      await expect
        .poll(
          async () => {
            const { billingModel, products } = await entitlements();
            return { billingModel, products };
          },
          { timeout: 30_000 },
        )
        .toEqual({
          billingModel: 'contract',
          products: ['mcp', 'organic_agent', 'paid_media', 'studio', 'trends'],
        });
      await expect(uiEditor.getByRole('switch', { name: 'Contract' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(uiEditor.getByTestId('brand-billing-plan')).toHaveText('Contract');
      await shoot(page, uiEditor, 'grid-contract');
    });

    await context.close();
  });

  test('admin tools: Client switch, full access for all brands, add credits', async ({
    browser,
  }) => {
    const admin = await mintSessionBundleForEmail(adminEmail);
    const context = await browser.newContext({ storageState: admin.state, viewport: VIEWPORT });
    const page = await context.newPage();
    const staffEditor = editorFor(page, staffBrand);

    await step('the staff-made brand reads Internal · unmetered, Client switch off', async () => {
      await page.goto(`/admin?query=${encodeURIComponent(staffEmail)}`);
      await expect(staffEditor).toBeVisible({ timeout: 240_000 });
      await expect(staffEditor.getByTestId('brand-internal-badge')).toHaveText(
        'Internal · unmetered',
      );
      await expect(staffEditor.getByRole('switch', { name: 'Client (metered)' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(await isInternal(staffBrand)).toBe(true);
    });

    await step('Client (metered) on → is_internal_brand false, billing model none', async () => {
      await staffEditor.getByRole('switch', { name: 'Client (metered)' }).click();
      await expect.poll(() => isInternal(staffBrand), { timeout: 30_000 }).toBe(false);
      expect((await entitlements(staffBrand)).billingModel).toBe('none');
      await expect(staffEditor.getByRole('switch', { name: 'Client (metered)' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(staffEditor.getByTestId('brand-internal-badge')).toHaveCount(0);
      await shoot(page, staffEditor, 'client-switch');
    });

    await step(`Full access for all brands → ${accountBrands.length} brands ok`, async () => {
      await page.goto(`/admin?query=${encodeURIComponent(accountEmail)}`);
      for (const brandId of accountBrands) {
        await expect(editorFor(page, brandId)).toBeVisible({ timeout: 240_000 });
      }
      await page.getByRole('button', { name: 'Full access for all brands' }).click();
      await page.getByRole('button', { name: 'Give full access' }).click();
      const results = page.getByTestId('full-access-results').locator('li');
      await expect(results).toHaveCount(accountBrands.length, { timeout: 60_000 });
      await expect(results.and(page.locator('[data-ok="true"]'))).toHaveCount(accountBrands.length);
      for (const brandId of accountBrands) {
        await expect
          .poll(
            async () => {
              const { products, trendsTier, addons, billingModel } = await entitlements(brandId);
              return { products, trendsTier, addons, billingModel };
            },
            { timeout: 30_000 },
          )
          .toEqual({
            products: ['mcp', 'organic_agent', 'paid_media', 'studio', 'trends'],
            trendsTier: 'pro',
            addons: ['provider_apify', 'provider_exa', 'provider_serpapi'],
            billingModel: 'none',
          });
      }
      await shoot(page, page.getByTestId('full-access-results'), 'full-access-all');
    });

    await step('a double-clicked Add credits grants once ($7.50 → 750 credits)', async () => {
      const editor = editorFor(page, accountBrands[0] as string);
      await editor.getByRole('spinbutton', { name: 'Credits to add (USD)' }).fill('7.50');
      await editor.getByRole('textbox', { name: 'Reason for the credits' }).fill('bench ui grant');
      await editor.getByRole('button', { name: 'Add credits' }).dblclick();
      await expect.poll(() => grantCount(accountBrands[0] as string), { timeout: 30_000 }).toBe(1);
      await expect(editor.getByTestId('brand-canvas-credits')).toHaveText('750 credits', {
        timeout: 30_000,
      });
      // A second grant would land within the same round trip; give it one more.
      await page.waitForTimeout(2_000);
      expect(await grantCount(accountBrands[0] as string)).toBe(1);
      await shoot(page, editor, 'credits');
    });

    await context.close();
  });
});
