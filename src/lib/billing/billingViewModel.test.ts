import { describe, expect, test } from 'bun:test';
import { type BillingOverview, billingOverviewSchema } from '@continuum/contracts';
import {
  checkoutReturnParams,
  isBrandOwner,
  isChangeSettled,
  parseCheckoutReturn,
  toBillingView,
} from './billingViewModel';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

// Built through the contracts schema, so a fixture that drifts from the real overview
// shape fails here rather than passing against a shape the server never sends.
function overview(patch: {
  entitlements?: Partial<BillingOverview['entitlements']>;
  subscription?: BillingOverview['subscription'];
  canvas?: Partial<BillingOverview['canvas']>;
  hasPaymentMethod?: boolean;
  invoices?: BillingOverview['invoices'];
}): BillingOverview {
  return billingOverviewSchema.parse({
    brandId: BRAND_ID,
    entitlements: {
      brandId: BRAND_ID,
      planCode: 'free',
      status: 'inactive',
      billingModel: 'none',
      plans: [],
      products: [],
      addons: [],
      trendsTier: null,
      buckets: [],
      creditBalance: { totalCredits: 0, purchasedCredits: 0, rolloverCredits: 0 },
      ...patch.entitlements,
    },
    hasPaymentMethod: patch.hasPaymentMethod ?? false,
    subscription: patch.subscription ?? null,
    invoices: patch.invoices ?? [],
    canvas: {
      studioBucket: null,
      rolloverUsd: 0,
      purchasedBalanceUsd: 0,
      overageUsd: 0,
      ...patch.canvas,
    },
    catalog: {
      // Deliberately out of order: the panel sorts Organic Plus first.
      plans: [
        {
          planCode: 'paid_media',
          displayName: 'Performance Plus',
          monthlyPriceUsd: 300,
          products: ['paid_media'],
          includedCanvasCredits: 0,
        },
        {
          planCode: 'organic_studio',
          displayName: 'Organic Plus',
          monthlyPriceUsd: 30,
          products: ['studio', 'organic_agent'],
          includedCanvasCredits: 1000,
        },
      ],
      creditPack: { credits: 1000, priceUsd: 10, maxPacks: 50 },
    },
    livemode: false,
  });
}

const studioBucket = (includedUsd: number, consumedUsd: number) => ({
  bucket: 'studio' as const,
  periodStart: '2026-09-21T00:00:00.000Z',
  periodEnd: '2026-10-21T00:00:00.000Z',
  includedUsd,
  capUsd: 100,
  consumedUsd,
  overageAction: 'bill' as const,
});

const subscription = (plans: ('organic_studio' | 'paid_media')[], status = 'active') => ({
  id: 'sub_test_1',
  status,
  plans,
  cancelAtPeriodEnd: false,
  currentPeriodStart: '2026-09-21T00:00:00.000Z',
  currentPeriodEnd: '2026-10-21T00:00:00.000Z',
});

function selfServe(input: BillingOverview) {
  const view = toBillingView(input);
  if (view.kind !== 'self_serve') throw new Error(`expected self_serve, got ${view.kind}`);
  return view;
}

describe('toBillingView — states', () => {
  test('a contract brand renders the managed state with its granted products and nothing to buy', () => {
    const view = toBillingView(
      overview({
        entitlements: {
          billingModel: 'contract',
          planCode: 'contract',
          status: 'active',
          // get_brand_entitlements returns products alphabetically; the panel lists them in
          // catalog order so a contract brand reads like the plan cards.
          products: ['organic_agent', 'paid_media', 'studio'],
        },
      }),
    );
    expect(view).toEqual({
      kind: 'contract',
      features: [
        'AI Canvas',
        'Organic agent, calendar and posting',
        'Jaina, Forge ad creation, approvals and optimizer',
      ],
    });
  });

  test('a brand that never bought offers Checkout for every plan, Organic Plus first', () => {
    const view = selfServe(overview({}));
    expect(view.hasLiveSubscription).toBe(false);
    expect(view.plans.map((plan) => [plan.planCode, plan.status, plan.action])).toEqual([
      ['organic_studio', 'available', 'checkout'],
      ['paid_media', 'available', 'checkout'],
    ]);
    expect(view.plans[0]).toMatchObject({
      name: 'Organic Plus',
      priceLabel: '$30',
      features: [
        'AI Canvas',
        'Organic agent, calendar and posting',
        '1,000 Canvas credits included every month',
      ],
    });
    expect(view.plans[1]?.priceLabel).toBe('$300');
  });

  test('with one plan live, the other is added to the subscription and the only plan is not removable', () => {
    const view = selfServe(
      overview({
        entitlements: { billingModel: 'stripe', plans: ['organic_studio'] },
        subscription: subscription(['organic_studio']),
        hasPaymentMethod: true,
      }),
    );
    expect(view.plans.map((plan) => [plan.planCode, plan.status, plan.action])).toEqual([
      ['organic_studio', 'active', 'none'],
      ['paid_media', 'available', 'add'],
    ]);
    expect(view.renewsAt).toBe('2026-10-21T00:00:00.000Z');
  });

  test('with both plans live, either can be removed', () => {
    const view = selfServe(
      overview({
        entitlements: { billingModel: 'stripe', plans: ['organic_studio', 'paid_media'] },
        subscription: subscription(['organic_studio', 'paid_media']),
      }),
    );
    expect(view.plans.map((plan) => plan.action)).toEqual(['remove', 'remove']);
  });

  test('a plan on the Stripe subscription but not yet granted by the webhook reads as activating', () => {
    const view = selfServe(overview({ subscription: subscription(['organic_studio']) }));
    expect(view.plans[0]?.status).toBe('activating');
  });

  test('a canceled subscription goes back to Checkout', () => {
    const view = selfServe(
      overview({ subscription: subscription(['organic_studio'], 'canceled') }),
    );
    expect(view.hasLiveSubscription).toBe(false);
    expect(view.plans.map((plan) => plan.action)).toEqual(['checkout', 'checkout']);
  });
});

describe('toBillingView — Canvas credits', () => {
  test('a fresh Organic Plus period shows 1,000 credits available, all included', () => {
    const { credits } = selfServe(
      overview({ canvas: { studioBucket: studioBucket(10, 0) }, hasPaymentMethod: true }),
    );
    expect(credits).toMatchObject({
      availableCredits: 1000,
      includedCredits: 1000,
      includedUsedCredits: 0,
      includedRemainingCredits: 1000,
      rolloverCredits: 0,
      purchasedCredits: 0,
      overageCredits: 0,
      overageCapUsd: 100,
      billsOverageToCard: true,
      periodEnd: '2026-10-21T00:00:00.000Z',
    });
  });

  test('available sums included remaining + rollover + purchased, 1 credit = $0.01', () => {
    const { credits } = selfServe(
      overview({
        canvas: {
          studioBucket: studioBucket(10, 3.12),
          rolloverUsd: 2.5,
          purchasedBalanceUsd: 20,
          overageUsd: 0.37,
        },
      }),
    );
    expect(credits.includedUsedCredits).toBe(312);
    expect(credits.includedRemainingCredits).toBe(688);
    expect(credits.rolloverCredits).toBe(250);
    expect(credits.purchasedCredits).toBe(2000);
    expect(credits.availableCredits).toBe(688 + 250 + 2000);
    expect(credits.overageCredits).toBe(37);
    expect(credits.overageUsd).toBe(0.37);
  });

  test('consumption past the included amount never shows negative remaining', () => {
    const { credits } = selfServe(overview({ canvas: { studioBucket: studioBucket(10, 12) } }));
    expect(credits.includedRemainingCredits).toBe(0);
    expect(credits.includedUsedCredits).toBe(1000);
  });

  test('no studio bucket (Performance Plus only) → no included credits, packs still count', () => {
    const { credits } = selfServe(overview({ canvas: { purchasedBalanceUsd: 10 } }));
    expect(credits.includedCredits).toBe(0);
    expect(credits.availableCredits).toBe(1000);
    expect(credits.overageCapUsd).toBeNull();
    expect(credits.periodEnd).toBeNull();
  });

  test('overage is billed to the card only with a card on file and a bill bucket', () => {
    const noCard = selfServe(overview({ canvas: { studioBucket: studioBucket(10, 0) } }));
    expect(noCard.credits.billsOverageToCard).toBe(false);
    const blocked = selfServe(
      overview({
        hasPaymentMethod: true,
        canvas: { studioBucket: { ...studioBucket(10, 0), overageAction: 'block' } },
      }),
    );
    expect(blocked.credits.billsOverageToCard).toBe(false);
  });
});

describe('toBillingView — invoices', () => {
  test('maps hosted invoice rows with the amount in dollars and falls back to the id', () => {
    const view = selfServe(
      overview({
        invoices: [
          {
            id: 'in_1',
            number: 'ABC-0001',
            status: 'paid',
            currency: 'usd',
            amountDue: 3000,
            amountPaid: 3000,
            total: 3000,
            createdAt: '2026-09-21T10:00:00.000Z',
            hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1/test_1',
            invoicePdf: null,
          },
          {
            id: 'in_2',
            number: null,
            status: null,
            currency: 'usd',
            amountDue: 1250,
            amountPaid: 0,
            total: 1250,
            createdAt: '2026-09-22T10:00:00.000Z',
            hostedInvoiceUrl: null,
            invoicePdf: null,
          },
        ],
      }),
    );
    expect(view.invoices).toEqual([
      {
        id: 'in_1',
        label: 'ABC-0001',
        createdAt: '2026-09-21T10:00:00.000Z',
        amountLabel: '$30',
        status: 'paid',
        href: 'https://invoice.stripe.com/i/acct_1/test_1',
      },
      {
        id: 'in_2',
        label: 'in_2',
        createdAt: '2026-09-22T10:00:00.000Z',
        amountLabel: '$12.50',
        status: 'unknown',
        href: null,
      },
    ]);
  });
});

describe('isBrandOwner', () => {
  const permissions = [
    { brand_profile_id: BRAND_ID, role: 'admin' },
    { brand_profile_id: 'other', role: 'owner' },
  ];
  test('an admin of this brand is not the owner, even when it owns another brand', () => {
    expect(isBrandOwner(permissions, BRAND_ID)).toBe(false);
  });
  test('the owner row for this brand grants billing', () => {
    expect(isBrandOwner([{ brand_profile_id: BRAND_ID, role: 'owner' }], BRAND_ID)).toBe(true);
  });
});

describe('checkout return', () => {
  const params = (query: string) => new URLSearchParams(query);

  test('return URLs round-trip through the parser', () => {
    const plan = checkoutReturnParams({ kind: 'plan_added', plan: 'organic_studio' });
    expect(parseCheckoutReturn(params(plan.success))).toEqual({
      outcome: 'success',
      change: { kind: 'plan_added', plan: 'organic_studio' },
    });
    expect(parseCheckoutReturn(params(plan.cancel))).toEqual({ outcome: 'cancel' });

    const credits = checkoutReturnParams({ kind: 'credits_added', purchasedCreditsBefore: 250 });
    expect(parseCheckoutReturn(params(credits.success))).toEqual({
      outcome: 'success',
      change: { kind: 'credits_added', purchasedCreditsBefore: 250 },
    });
  });

  test('anything else is not a checkout return', () => {
    expect(parseCheckoutReturn(params('section=billing'))).toBeNull();
    expect(parseCheckoutReturn(params('checkout=success'))).toBeNull();
    expect(parseCheckoutReturn(params('checkout=success&plan=enterprise'))).toBeNull();
    expect(parseCheckoutReturn(params('checkout=success&balance=-1'))).toBeNull();
  });
});

describe('isChangeSettled', () => {
  const organicActive = overview({
    entitlements: { billingModel: 'stripe', plans: ['organic_studio'] },
  });

  test('an added plan settles once the webhook grants it', () => {
    const change = { kind: 'plan_added', plan: 'organic_studio' } as const;
    expect(isChangeSettled(change, overview({}))).toBe(false);
    expect(isChangeSettled(change, organicActive)).toBe(true);
  });

  test('a removed plan settles once the webhook revokes it', () => {
    const change = { kind: 'plan_removed', plan: 'organic_studio' } as const;
    expect(isChangeSettled(change, organicActive)).toBe(false);
    expect(isChangeSettled(change, overview({}))).toBe(true);
  });

  test('a credit pack settles once the purchased balance rises above where it started', () => {
    const change = { kind: 'credits_added', purchasedCreditsBefore: 500 } as const;
    expect(isChangeSettled(change, overview({ canvas: { purchasedBalanceUsd: 5 } }))).toBe(false);
    expect(isChangeSettled(change, overview({ canvas: { purchasedBalanceUsd: 15 } }))).toBe(true);
  });
});
