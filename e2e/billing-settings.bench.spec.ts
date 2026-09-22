import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  CLIENT_PROMO_COUPON_ID,
  CLIENT_PROMO_DEFAULT_CODE,
  ensureClientPromoCodes,
} from '../../scripts/billing-client-promo-codes';
import { mintSessionBundleForEmail } from './support/auth';
import {
  activeSubscription,
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
  replayUntil,
  sandboxStripe,
  serviceClient,
  studioBucketOf,
  subscriptionHasOverageItem,
} from './support/billingBench';

// billing:settings:e2e:bench — Settings → Billing, end to end, nothing mocked.
//
//   owner     fresh local user owning a fresh tier-0 brand: opens Settings → Billing, picks
//             Organic Plus, pays on the Stripe-hosted SANDBOX Checkout with 4242, returns,
//             and the panel shows Organic Plus active, card on file, 1,000 Canvas credits and
//             the paid invoice; Manage payment method lands on the sandbox Customer Portal.
//             The sidebar's bottom-left widget then reads "Organic Plus · 1,000 credits" on the
//             Canvas (/ai-studio) and on Settings; hovering previews the breakdown; clicking lands
//             on Settings → Billing with the credit-pack section in view. The owner turns
//             auto-billing of overage on (the sandbox subscription gains the metered item, the
//             replayed webhook switches the studio bucket to `bill`, the switch and the widget
//             say so) and off again.
//   member    an admin (not owner) of that brand: the panel is locked, and billing-api 403s —
//             but the widget, read from member-readable entitlements, still shows the credits.
//   contract  the owner of a Contract brand: "Managed by Continuum", nothing to buy, the
//             auto-billing switch disabled, and the widget reads "Managed plan · unmetered".
//   promo     scripts/billing-client-promo-codes.ts (sandbox) gives the owner brand and the
//             Contract brand each their own CONTINUUM200 code; it finds the customer billing-api
//             created, never a second one. The owner buys 20 packs on hosted Checkout with the
//             code, pays $0, and the panel and the ledger both gain exactly 20,000 credits; a
//             second 20-pack Checkout with the same code is refused by Stripe.
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

/** Visible AND painted on top at its centre — what a person sees, not just what is in the DOM. */
async function expectOnTop(locator: Locator, timeout?: number): Promise<void> {
  await expect(locator).toBeVisible({ timeout });
  await expect
    .poll(
      () =>
        locator.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return hit !== null && element.contains(hit);
        }),
      { timeout },
    )
    .toBe(true);
}

const POINTER_AWAY = { x: DESKTOP.width - 40, y: DESKTOP.height / 2 };
const rail = (page: Page) => page.locator('[data-side="left"][data-state]');
const widgetCard = (page: Page) => page.getByTestId('sidebar-billing-card');

// This wave ships the widget and its preview, not AppSidebar's hover-expand — and that
// hover-expand races the Canvas: its `?roomId=` write after load re-collapses a hovered rail
// (the BUG-198 guard), and a lost mouseleave leaves one stuck open. So the rail is set
// explicitly with the sidebar's own shortcut (Ctrl/Cmd+B), which pins the state AND clears any
// hover-expand on every press, with the pointer parked away so nothing re-hovers it.
async function pinRail(page: Page, state: 'expanded' | 'collapsed'): Promise<void> {
  await page.mouse.move(POINTER_AWAY.x, POINTER_AWAY.y);
  await expect(async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ControlOrMeta+b');
    await expect(rail(page)).toHaveAttribute('data-state', state, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Opens the widget's preview by keyboard focus (it opens on :focus-visible, which a keypress
 * makes it) and returns it once it is painted on top. Independent of the rail's state.
 */
async function focusOpen(page: Page): Promise<Locator> {
  const widget = page.getByTestId('sidebar-billing');
  const card = widgetCard(page);
  await page.mouse.move(POINTER_AWAY.x, POINTER_AWAY.y);
  await expect(async () => {
    await widget.blur();
    await expect(card).toBeHidden({ timeout: 5_000 });
    await page.keyboard.press('Shift');
    await widget.focus();
    await expectOnTop(card, 5_000);
  }).toPass({ timeout: 60_000 });
  return card;
}

async function closePreview(page: Page): Promise<void> {
  await page.getByTestId('sidebar-billing').blur();
  await page.mouse.move(POINTER_AWAY.x, POINTER_AWAY.y);
  await expect(widgetCard(page)).toBeHidden();
}

// The widget, captured with the preview open, on a pinned-expanded and a collapsed rail. Leaves
// the rail collapsed, which is the app's default.
async function shootWidget(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const capture = (file: string) =>
    page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${file}.png`),
      animations: 'disabled',
      style: HIDE_TOASTS,
    });
  await page.setViewportSize(DESKTOP);
  for (const state of ['expanded', 'collapsed'] as const) {
    await pinRail(page, state);
    await focusOpen(page);
    await capture(`${name}-${state}-1280x800`);
    await closePreview(page);
  }
}

// On a phone the sidebar is a sheet opened from the header. The full-bleed Canvas covers the
// header, so this capture is taken on a regular page.
async function shootWidgetMobile(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize(MOBILE);
  await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
  const widget = page.getByRole('dialog').getByTestId('sidebar-billing');
  await expect(widget).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}-${MOBILE.width}x${MOBILE.height}.png`),
    animations: 'disabled',
    style: HIDE_TOASTS,
  });
  await page.keyboard.press('Escape');
  await expect(widget).toBeHidden();
  await page.setViewportSize(DESKTOP);
}

/** The widget's open preview card (keyboard path; see focusOpen). */
function openWidgetPreview(page: Page): Promise<Locator> {
  return focusOpen(page);
}

/**
 * Hovering opens the same preview. Checked on a page nothing rewrites the URL of, and only the
 * preview is asserted — never the rail's hover-expand.
 */
async function expectHoverOpensPreview(page: Page): Promise<void> {
  await expect(async () => {
    await closePreview(page);
    await page.getByTestId('sidebar-billing').hover();
    await expectOnTop(widgetCard(page), 5_000);
  }).toPass({ timeout: 60_000 });
  await closePreview(page);
}

const billingSettingsPath = '/settings?section=billing';
const purchaseButtons = /^(Choose|Add|Remove) .*Plus$|^Buy credits$/;
const autoBillingSwitch = (page: Page) =>
  page.getByRole('switch', { name: 'Auto-bill overage to card' });

test.describe.configure({ mode: 'serial' });

test.describe('billing:settings:e2e:bench', () => {
  const db = serviceClient('billing-settings');
  const { stripe, webhookSecret } = sandboxStripe('billing-settings');
  const since = Math.floor(Date.now() / 1000) - 5;
  const created = {
    userIds: [] as string[],
    brandIds: [] as string[],
    promotionCodeIds: [] as string[],
  };
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

  // A step cut off by the test timeout never records its own FAIL; grade the test itself so
  // the envelope can never read green while Playwright reads red.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixtures argument.
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      recorder.record(
        `test: ${testInfo.title}`,
        'FAIL',
        `${testInfo.status} · ${testInfo.error?.message?.split('\n')[0] ?? 'no error message'}`,
      );
    }
  });

  test.afterAll(async () => {
    let deleted: string[] = [];
    try {
      // A redeemed code is already inactive; deactivating is idempotent. The fixed-id coupon
      // stays: it is shared by every run, exactly as the live one is.
      for (const id of created.promotionCodeIds) {
        const code = await stripe.promotionCodes.update(id, { active: false });
        if (code.livemode !== false) throw new Error(`promotion code ${id} is live-mode`);
        deleted.push(`promotion code ${id} (deactivated)`);
      }
      deleted.push(
        ...(await cleanupBillingBench({
        db,
        stripe,
        since,
          brandIds: created.brandIds,
          userIds: created.userIds,
        })),
      );
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
    // Checkout, three webhook replays, the Canvas and two auto-billing round trips.
    test.setTimeout(720_000);
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

      const replay = (what: string, settled: Parameters<typeof replayUntil>[0]['settled']) =>
        replayUntil({
          db,
          stripe,
          webhookSecret,
          customerId,
          brandId: ownerBrandId,
          since,
          settled,
          what,
        }).then(({ attempts, types }) => {
          notes.push(`${what}: replayed on attempt ${attempts} (${types.join(', ')})`);
        });

      await step('replay the real sandbox events through the local webhook', () =>
        replay(
          'Organic Plus with 1,000 included credits',
          (entitlements) =>
            entitlements.plans.includes('organic_studio') &&
            studioBucketOf(entitlements)?.includedUsd === 10,
        ),
      );

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

      await step(
        'a new subscription starts with auto-billing off (packs are the base)',
        async () => {
          expect(await subscriptionHasOverageItem(stripe, customerId)).toBe(false);
          // Flexible billing is what lets opting out invoice the accrued overage at once
          // (classic mode drops it); only a real Checkout proves Checkout creates it.
          expect((await activeSubscription(stripe, customerId)).billing_mode?.type).toBe(
            'flexible',
          );
          expect(studioBucketOf(await brandEntitlements(db, ownerBrandId))?.overageAction).toBe(
            'block',
          );
          await expect(autoBillingSwitch(page)).not.toBeChecked();
          await expect(autoBillingSwitch(page)).toBeEnabled();
          await expect(page.getByTestId('auto-billing')).toContainText('up to $100 a month');
          await expect(page.getByRole('region', { name: 'Canvas credits' })).toContainText(
            'When credits run out, generation pauses until you buy a pack — or turn on auto-billing.',
          );
        },
      );

      await step('sidebar widget shows Organic Plus · 1,000 credits on the Canvas', async () => {
        await page.goto('/ai-studio');
        const widget = page.getByTestId('sidebar-billing');
        await expect(widget).toHaveAccessibleName(
          'Billing: Organic Plus, 1,000 credits remaining',
          { timeout: 120_000 },
        );
        await expect(page).toHaveURL(/\/ai-studio/);
        const card = await openWidgetPreview(page);
        await expect(widget).toContainText('Organic Plus');
        await expect(widget).toContainText('1,000 credits');
        await expect(card).toContainText('1,000 credits remaining');
        await expect(card).toContainText(/Included left this period\s*1,000 of 1,000/);
        await expect(card).toContainText(/Rollover\s*0/);
        await expect(card).toContainText(/Purchased packs\s*0/);
        await expect(card).toContainText(/Period ends\s*[A-Z][a-z]{2} \d{1,2}/);
        await expect(card).toContainText(/Auto-billing\s*Off/);
        await shootWidget(page, 'widget');
      });

      await step(
        'clicking the widget lands on Billing with the credit-pack section in view',
        async () => {
          // Pinned open, the widget does not move under the pointer mid-click.
          await pinRail(page, 'expanded');
          await page.getByTestId('sidebar-billing').click();
          await page.waitForURL(/\/settings\?section=billing#credits$/);
          const credits = page.locator('#credits');
          await expect(credits).toBeInViewport({ timeout: 60_000 });
          await expect(credits).toHaveAttribute('data-highlighted', 'true');
          await expect(credits.getByRole('button', { name: 'Buy credits' })).toBeVisible();
          await expect(page.getByTestId('sidebar-billing')).toHaveAccessibleName(
            'Billing: Organic Plus, 1,000 credits remaining',
          );
          await expectHoverOpensPreview(page);
          await pinRail(page, 'collapsed');
          await shoot(page, 'credits-anchor');
          await shootWidgetMobile(page, 'widget');
        },
      );

      await step(
        'owner turns auto-billing on: the subscription gains the metered item',
        async () => {
          await autoBillingSwitch(page).click();
          const dialog = page.getByRole('alertdialog', { name: 'Turn on auto-billing?' });
          await expect(dialog).toContainText('up to $100 a month');
          await dialog.getByRole('button', { name: 'Turn on auto-billing' }).click();
          await expect(autoBillingSwitch(page)).toBeChecked({ timeout: 60_000 });
          expect(await subscriptionHasOverageItem(stripe, customerId)).toBe(true);
        },
      );

      await step(
        'replay ⇒ the studio bucket bills, and the widget says auto-billing on',
        async () => {
          await replay('auto-billing on (studio bucket bill, $100 cap)', (entitlements) => {
            const studio = studioBucketOf(entitlements);
            return studio?.overageAction === 'bill' && studio.capUsd === 100;
          });
          // The panel's poll sees the bucket switch and re-renders the server-read widget.
          await expect(autoBillingSwitch(page)).toBeChecked();
          await expect(page.getByTestId('auto-billing')).toContainText('On.');
          await expect(async () => {
            const card = await openWidgetPreview(page);
            await expect(card).toContainText(/Auto-billing\s*On · up to \$100\/mo/, {
              timeout: 2_000,
            });
          }).toPass({ timeout: 60_000 });
          await closePreview(page);
          await shoot(page, 'auto-billing-on');
        },
      );

      await step('owner turns auto-billing off again ⇒ off everywhere', async () => {
        await autoBillingSwitch(page).click();
        await expect(autoBillingSwitch(page)).not.toBeChecked({ timeout: 60_000 });
        expect(await subscriptionHasOverageItem(stripe, customerId)).toBe(false);
        await replay(
          'auto-billing off (studio bucket block)',
          (entitlements) => studioBucketOf(entitlements)?.overageAction === 'block',
        );
        await expect(async () => {
          const card = await openWidgetPreview(page);
          await expect(card).toContainText(/Auto-billing\s*Off/, { timeout: 2_000 });
        }).toPass({ timeout: 60_000 });
        await closePreview(page);
        await page.reload();
        await expect(autoBillingSwitch(page)).not.toBeChecked({ timeout: 60_000 });
      });

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

      await step('the member still sees the brand plan and credits in the sidebar', async () => {
        await expect(page.getByTestId('sidebar-billing')).toHaveAccessibleName(
          'Billing: Organic Plus, 1,000 credits remaining',
        );
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
        await expect(autoBillingSwitch(page)).toBeDisabled();
        await expect(page.getByTestId('auto-billing')).toContainText('never metered');
        await shoot(page, 'contract-managed');
      });

      await step('the Contract widget reads Managed plan · unmetered', async () => {
        const widget = page.getByTestId('sidebar-billing');
        await expect(widget).toHaveAccessibleName('Billing: Managed plan · unmetered');
        const card = await openWidgetPreview(page);
        await expect(widget).toContainText('Managed plan · unmetered');
        await expect(card).toContainText("Canvas use isn't metered");
        await shootWidget(page, 'widget-contract');
        await shootWidgetMobile(page, 'widget-contract');
      });
    } finally {
      await context.close();
    }
  });

  // Last on purpose: the member test above reads the owner brand's 1,000 credits.
  test('a client redeems the $200 promo code once, on 20 credit packs', async ({ browser }) => {
    // Two hosted Checkouts and a webhook replay.
    test.setTimeout(480_000);
    const { data: row, error: rowError } = await db
      .schema('billing')
      .from('brand_subscriptions')
      .select('stripe_customer_id')
      .eq('brand_id', ownerBrandId)
      .single();
    if (rowError) throw new Error(`brand_subscriptions: ${describeError(rowError)}`);
    const customerId = String(row.stripe_customer_id);

    const promotionCodeId = await step(
      'promo script (sandbox) gives each client brand its own CONTINUUM200 code',
      async () => {
        const run = await ensureClientPromoCodes({
          stripe,
          live: false,
          brands: [
            { brandId: ownerBrandId, name: `Billing Bench ${RUN_ID}` },
            { brandId: contractBrandId, name: `Billing Contract ${RUN_ID}` },
          ],
          write: true,
        });
        created.promotionCodeIds.push(
          ...run.rows.flatMap((r) =>
            r.promotionCodeStatus === 'created' && r.promotionCodeId ? [r.promotionCodeId] : [],
          ),
        );
        const [owner, contract] = run.rows;
        // The customer billing-api created and persisted — found, never duplicated.
        expect(owner).toMatchObject({ customerId, customerStatus: 'existing' });
        expect(owner?.promotionCodeStatus).toBe('created');
        expect(contract).toMatchObject({ customerStatus: 'created', promotionCodeStatus: 'created' });

        const codes = await Promise.all(
          run.rows.map((r) =>
            stripe.promotionCodes.retrieve(String(r.promotionCodeId), {
              expand: ['coupon.applies_to'],
            }),
          ),
        );
        for (const code of codes) {
          expect(code.livemode).toBe(false);
          expect(code.code).toBe(CLIENT_PROMO_DEFAULT_CODE);
          expect(code.max_redemptions).toBe(1);
          expect(code.expires_at).toBeNull();
          expect(code.restrictions.minimum_amount).toBe(20_000);
          expect(code.restrictions.minimum_amount_currency).toBe('usd');
          expect(code.coupon).toMatchObject({
            id: CLIENT_PROMO_COUPON_ID,
            amount_off: 20_000,
            currency: 'usd',
            duration: 'once',
            redeem_by: null,
          });
        }
        expect(codes[0]?.customer).toBe(customerId);
        expect(codes[1]?.customer).toBe(contract?.customerId);
        const [pack] = (
          await stripe.prices.list({
            lookup_keys: ['continuum_v1_canvas_credits_1000'],
            active: true,
          })
        ).data;
        expect(codes[0]?.coupon.applies_to?.products).toEqual([String(pack?.product)]);

        const again = await ensureClientPromoCodes({
          stripe,
          live: false,
          brands: [{ brandId: ownerBrandId, name: `Billing Bench ${RUN_ID}` }],
          write: true,
        });
        expect(again).toMatchObject({
          couponStatus: 'existing',
          rows: [{ customerStatus: 'existing', promotionCodeStatus: 'existing' }],
        });
        notes.push(`promo: ${run.rows.map((r) => `${r.customerId}→${r.promotionCodeId}`).join(', ')}`);
        return String(owner?.promotionCodeId);
      },
    );

    const owner = await mintSessionBundleForEmail(EMAILS.owner);
    const context = await browser.newContext({ storageState: owner.state, viewport: DESKTOP });
    const page = await context.newPage();
    const packsField = page.getByRole('textbox', { name: 'Credit packs' });
    const credits = page.locator('#credits');
    const openPackCheckout = async (): Promise<string> => {
      await page.goto(billingSettingsPath);
      await expect(credits.getByRole('button', { name: 'Buy credits' })).toBeVisible({
        timeout: 120_000,
      });
      await packsField.fill('20');
      await packsField.blur();
      await expect(packsField).toHaveValue('20');
      await expect(credits).toContainText('packs · 20,000 credits · $200');
      await credits.getByRole('button', { name: 'Buy credits' }).click();
      await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 60_000 });
      const id = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
      if (!id) throw new Error(`no test-mode session id in ${page.url()}`);
      const session = await stripe.checkout.sessions.retrieve(id);
      expect(session).toMatchObject({
        livemode: false,
        mode: 'payment',
        customer: customerId,
        amount_subtotal: 20_000,
        metadata: { continuum_brand_id: ownerBrandId, continuum_credit_pack: '20' },
      });
      const promo = page.locator('#promotionCode');
      await promo.waitFor({ timeout: 60_000 });
      await promo.fill(CLIENT_PROMO_DEFAULT_CODE);
      await promo.press('Enter');
      return id;
    };

    try {
      const before = await step('read the balance before', async () => {
        const entitlements = await brandEntitlements(db, ownerBrandId);
        await page.goto(billingSettingsPath);
        const available = page.getByTestId('canvas-credits-available');
        await expect(available).toBeVisible({ timeout: 120_000 });
        return {
          purchasedCredits: entitlements.creditBalance.purchasedCredits,
          availableCredits: Number((await available.innerText()).replace(/,/g, '')),
        };
      });

      const sessionId = await step('20 packs with the code come to $0 on hosted Checkout', async () => {
        const id = await openPackCheckout();
        await expect(page.getByText('$200.00 off')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('body')).toContainText(/Total due\s*\$0\.00/);
        const email = page.locator('#email');
        if ((await email.isVisible()) && !(await email.inputValue())) {
          await email.fill(EMAILS.owner);
        }
        await page.getByTestId('hosted-payment-submit-button').click();
        await page.waitForURL(/\/settings\?section=billing&checkout=success/, {
          timeout: 120_000,
        });
        return id;
      });

      await step('Stripe completed it at $0 with our code and no PaymentIntent', async () => {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        expect(session).toMatchObject({
          status: 'complete',
          payment_status: 'paid',
          amount_subtotal: 20_000,
          amount_total: 0,
          payment_intent: null,
          total_details: { amount_discount: 20_000 },
        });
        expect(session.discounts?.[0]?.promotion_code).toBe(promotionCodeId);
        const code = await stripe.promotionCodes.retrieve(promotionCodeId);
        expect(code.times_redeemed).toBe(1);
        notes.push(`promo code after redemption: active=${code.active}`);
      });

      await step('replay ⇒ the ledger gains exactly 20,000 credits, keyed on the session', async () => {
        const { attempts, types } = await replayUntil({
          db,
          stripe,
          webhookSecret,
          customerId,
          brandId: ownerBrandId,
          since,
          settled: (entitlements) =>
            entitlements.creditBalance.purchasedCredits > before.purchasedCredits,
          what: '20,000 promo credits',
        });
        notes.push(`promo pack: replayed on attempt ${attempts} (${types.join(', ')})`);
        const after = await brandEntitlements(db, ownerBrandId);
        expect(after.creditBalance.purchasedCredits - before.purchasedCredits).toBe(20_000);
        const { data: topups, error } = await db
          .schema('billing')
          .from('credit_transactions')
          .select('delta_usd, ref, meta')
          .eq('brand_id', ownerBrandId)
          .eq('kind', 'topup');
        if (error) throw new Error(`credit_transactions: ${describeError(error)}`);
        expect(topups).toHaveLength(1);
        expect(topups?.[0]).toMatchObject({ ref: sessionId, meta: { packs: 20, credits: 20_000 } });
        expect(Number(topups?.[0]?.delta_usd)).toBe(200);
      });

      await step('the panel shows the 20,000 purchased credits', async () => {
        await expect(page.getByTestId('canvas-credits-available')).toHaveText(
          (before.availableCredits + 20_000).toLocaleString('en-US'),
          { timeout: 60_000 },
        );
        await expect(credits.getByRole('img', { name: /Purchased 20,000/ })).toBeVisible();
        await shoot(page, 'promo-credits-added');
      });

      await step('a second 20-pack Checkout with the same code is refused by Stripe', async () => {
        const id = await openPackCheckout();
        await expect(page.getByText('This code is invalid.')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('body')).toContainText(/Total due\s*\$200\.00/);
        const expired = await stripe.checkout.sessions.expire(id);
        expect(expired.status).toBe('expired');
        const after = await brandEntitlements(db, ownerBrandId);
        expect(after.creditBalance.purchasedCredits - before.purchasedCredits).toBe(20_000);
      });
    } finally {
      await context.close();
    }
  });
});
