import { describe, expect, it } from 'bun:test';

import {
  BILLING_MVP_CATALOG_VERSION,
  billingCatalogSchema,
  billingSummarySchema,
  canvasCreditSpendResponseSchema,
} from './index';

const brandId = '00000000-0000-4000-8000-0000000000b2';

describe('billing MVP contracts', () => {
  it('parses the focused catalog without an Optimizer SKU', () => {
    const catalog = billingCatalogSchema.parse({
      version: BILLING_MVP_CATALOG_VERSION,
      items: [
        {
          code: 'canvas_credits',
          displayName: 'Canvas generation credits',
          kind: 'credit',
          availability: 'invite',
          dependencyCodes: ['canvas'],
          metadata: { unit: 'generation' },
        },
      ],
    });

    expect(catalog.items.map((item) => item.code)).not.toContain('paid_optimizer');
  });

  it('parses a normalized entitlement and usage-health summary', () => {
    const summary = billingSummarySchema.parse({
      entitlements: {
        brandId,
        tier: 1,
        tierMode: 'payment',
        compatibilityProfile: true,
        features: ['canvas', 'organic_agent', 'jaina', 'trends', 'provider_exa'],
        access: { canvas: true, organicAgent: true, jaina: true, trends: true },
        intelligenceProviders: ['provider_exa'],
        libraryCapacityBytes: 107_374_182_400,
        canvasCredits: {
          available: 99,
          expiringWithin30Days: 0,
          nextExpirationAt: null,
        },
        explicitDenies: [],
        resolvedAt: '2026-07-16T09:30:00.000Z',
      },
      storage: {
        usedBytes: 1024,
        capacityBytes: 107_374_182_400,
        availableBytes: 107_374_181_376,
        utilizationPercent: 0,
      },
      canvasUsage: {
        health: 'healthy',
        creditsSpent7Days: 1,
        creditsSpent30Days: 1,
        lastSpendAt: '2026-07-16T09:30:00.000Z',
      },
    });

    expect(summary.entitlements.access.jaina).toBe(true);
    expect(summary.entitlements.canvasCredits.available).toBe(99);
  });

  it('keeps declined and idempotent spend results distinguishable', () => {
    expect(
      canvasCreditSpendResponseSchema.parse({
        allowed: false,
        recorded: false,
        idempotentReplay: false,
        reason: 'insufficient_credits',
        creditsRequired: 1,
        creditsAvailable: 0,
      }).allowed,
    ).toBe(false);

    expect(
      canvasCreditSpendResponseSchema.parse({
        allowed: true,
        recorded: false,
        idempotentReplay: true,
        reservationStatus: 'settled',
        spendId: '10000000-0000-4000-8000-000000000001',
        creditsSpent: 1,
      }).idempotentReplay,
    ).toBe(true);
  });
});
