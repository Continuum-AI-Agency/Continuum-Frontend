import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { replaySandboxEventsToWebhook } from '../../packages/billing/src/replayEvents';
import { mintSessionBundleForEmail } from './support/auth';
import {
  assertBillingApiServed,
  BILLING_API_URL,
  brandEntitlements,
  cleanupBillingBench,
  createBenchRecorder,
  createBrand,
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

const SCREENSHOT_DIR = path.join(process.cwd(), 'e2e/__screenshots__/billing');
const RUN_ID = Date.now().toString(36);
const PASSWORD = `Bench-${RUN_ID}-pw1!`;

const EMAILS = {
  owner: `billing-owner-${RUN_ID}@continuum.test`,
  member: `billing-member-${RUN_ID}@continuum.test`,
  contract: `billing-contract-${RUN_ID}@continuum.test`,
};

const recorder = createBenchRecorder('billing:settings:e2e:bench', [
  'unexercised hop: Stripe delivering webhooks to our URL — the real sandbox events are replayed through the locally served stripe-billing-webhook instead',
]);
const { step, notes } = recorder;

// Toasts are hidden for the capture only — the screenshots show the layout itself. Each state is
// shot at the top of the panel and, when it has one, at the invoices list.

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
  const db = serviceClient('billing-settings');
  const { stripe, webhookSecret } = sandboxStripe('billing-settings');
  const since = Math.floor(Date.now() / 1000) - 5;
  const created = { userIds: [] as string[], brandIds: [] as string[] };
  let ownerBrandId = '';
  let contractBrandId = '';

  test.beforeAll(async () => {
    await step('billing-api is served locally', assertBillingApiServed);

    await step('seed owner, member and contract brands', async () => {
      const ownerId = await createUser(db, EMAILS.owner, PASSWORD);
      const memberId = await createUser(db, EMAILS.member, PASSWORD);
      const contractOwnerId = await createUser(db, EMAILS.contract, PASSWORD);
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
      await grantContract(db, contractBrandId);

      const fresh = await brandEntitlements(db, ownerBrandId);
      expect(fresh.billingModel).toBe('none');
      expect(fresh.products).toEqual([]);
      const contract = await brandEntitlements(db, contractBrandId);
      expect(contract.billingModel).toBe('contract');
    });
  });

  test.afterAll(async () => {
    let deleted: string[] = [];
    try {
      deleted = await cleanupBillingBench({
        db,
        stripe,
        since,
        brandIds: created.brandIds,
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
