import { describe, expect, it } from 'bun:test';
import {
  HOME_HYGIENE_MAX_EXAMPLES,
  HOME_STALE_AD_DAYS,
  homeAccountHygieneReadSchema,
  homeHygieneCheckSchema,
} from './accountHygiene';

const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const source = { kind: 'paid_media.ads', ref: null, since: null, until: '2026-11-03' };

const naming = {
  id: 'naming' as const,
  status: 'warn' as const,
  count: 1,
  total: 12,
  detail: '1 of 12 active names does not follow the convention.',
  examples: [
    {
      level: 'ad' as const,
      id: '120252021696220236',
      name: 'ALEIRA // PRIMER MES $12',
      code: 'wrong_segment_count' as const,
      detail: 'Splits into 1 part on "|"; the convention has 5.',
      ageDays: null,
      spendShare: null,
    },
  ],
  source,
};

const stale = {
  id: 'stale_ads' as const,
  status: 'ok' as const,
  count: 0,
  total: 35,
  detail: 'No active ad has run longer than 30 days.',
  examples: [],
  source: { ...source, kind: 'paid_media.ads.first_seen_at' },
};

describe('homeAccountHygieneReadSchema', () => {
  it('accepts a ready answer with both checks', () => {
    const ready = {
      state: 'ready',
      brandId: BRAND,
      generatedAt: '2026-11-03T12:00:00.000Z',
      data: {
        asOf: '2026-11-03T05:06:37.606Z',
        namingSchema: {
          delimiter: '|',
          fields: ['funnel_stage', 'angle'],
          version: 1,
          adopted: true,
        },
        checks: [naming, stale],
      },
    };
    expect(homeAccountHygieneReadSchema.safeParse(ready).success).toBe(true);
  });

  it('accepts a brand with no naming convention', () => {
    const ready = {
      state: 'ready',
      brandId: BRAND,
      generatedAt: '2026-11-03T12:00:00.000Z',
      data: {
        asOf: '2026-11-03T05:06:37.606Z',
        namingSchema: null,
        checks: [{ ...naming, status: 'unknown', count: 0, total: 0, examples: [] }, stale],
      },
    };
    expect(homeAccountHygieneReadSchema.safeParse(ready).success).toBe(true);
  });

  it('pins the 30-day stale line and the 10-example cap', () => {
    expect(HOME_STALE_AD_DAYS).toBe(30);
    expect(HOME_HYGIENE_MAX_EXAMPLES).toBe(10);
  });
});

describe('homeHygieneCheckSchema', () => {
  it('refuses more examples than the cap', () => {
    const examples = Array.from(
      { length: HOME_HYGIENE_MAX_EXAMPLES + 1 },
      () => naming.examples[0],
    );
    expect(
      homeHygieneCheckSchema.safeParse({ ...naming, count: 11, total: 20, examples }).success,
    ).toBe(false);
  });

  it('refuses a count larger than what was checked', () => {
    expect(homeHygieneCheckSchema.safeParse({ ...naming, count: 13 }).success).toBe(false);
  });

  it('refuses an ok check that still counts problems', () => {
    expect(homeHygieneCheckSchema.safeParse({ ...naming, status: 'ok' }).success).toBe(false);
  });

  it('refuses an unknown check id', () => {
    expect(homeHygieneCheckSchema.safeParse({ ...naming, id: 'feeds' }).success).toBe(false);
  });
});
