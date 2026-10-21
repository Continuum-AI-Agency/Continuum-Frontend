import { describe, expect, it } from 'bun:test';
import type { BillingManagementModel } from '@continuum/billing-ui';
import { buildChargeLogRows, chargeLogToCsv } from './buildChargeLog';

const model = {
  brandId: '00000000-0000-4000-8000-0000000000b2',
  summary: {
    entitlements: {
      brandId: '00000000-0000-4000-8000-0000000000b2',
      tier: 1,
      tierMode: 'payment',
      access: { canvas: true, organicAgent: true, jaina: false, trends: false },
      libraryCapacityBytes: 10,
      canvasCredits: { available: 8, expiringWithin30Days: 0, nextExpirationAt: null },
      features: [],
    },
    storage: {
      usedBytes: 1,
      capacityBytes: 10,
      availableBytes: 9,
      utilizationPercent: 10,
    },
    canvasUsage: {
      health: 'healthy',
      creditsSpent7Days: 2,
      creditsSpent30Days: 4,
      lastSpendAt: '2026-07-10T00:00:00.000Z',
    },
  },
  modules: [],
  groups: [],
  trendsPack: {
    core: false,
    providers: [],
    plus: false,
    entitledProviderCount: 0,
  },
  activeOwnership: [],
  meteredUsage: {
    creditsAvailable: 8,
    creditsExpiringWithin30Days: 0,
    nextExpirationAt: null,
    health: 'healthy',
    healthLabel: 'Healthy',
    spent7Days: 2,
    spent30Days: 4,
    lastSpendAt: '2026-07-10T00:00:00.000Z',
    monthlyPackHint: 100,
    utilizationPercent: 8,
  },
  stripeAccount: {
    brandId: '00000000-0000-4000-8000-0000000000b2',
    customerId: 'cus_x',
    customerEmail: 'a@b.com',
    hasCustomer: true,
    defaultPaymentMethod: null,
    subscriptions: [],
    invoices: [
      {
        id: 'in_1',
        number: 'INV-1',
        status: 'paid',
        currency: 'usd',
        amountDue: 0,
        amountPaid: 3000,
        total: 3000,
        createdAt: '2026-07-01T00:00:00.000Z',
        periodStart: null,
        periodEnd: null,
        hostedInvoiceUrl: null,
        invoicePdf: null,
        lines: [
          {
            id: 'il_1',
            description: 'Organic',
            amount: 3000,
            currency: 'usd',
            quantity: 1,
          },
        ],
      },
    ],
    livemode: false as const,
  },
  catalogVersion: 'billing-mvp-v1',
} satisfies BillingManagementModel;

describe('buildChargeLogRows', () => {
  it('includes invoice lines and credit meter snapshot', () => {
    const rows = buildChargeLogRows(model);
    expect(rows.some((row) => row.kind === 'invoice_line' && row.label === 'Organic')).toBe(true);
    expect(rows.some((row) => row.kind === 'credit_meter')).toBe(true);
  });

  it('exports CSV with header', () => {
    const csv = chargeLogToCsv(model);
    expect(csv.startsWith('kind,date,label,amount,status,detail')).toBe(true);
    expect(csv.includes('Organic')).toBe(true);
  });
});
