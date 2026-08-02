import { describe, expect, it } from 'bun:test';

import {
  CREATIVE_TAXONOMY_VERSION,
  CTA_STRATEGY_GUIDANCE,
  ctaStrategySchema,
  VALUE_PROP_GUIDANCE,
  valuePropStrategySchema,
} from './taxonomy';

describe('ctaStrategySchema', () => {
  it('is a closed enum of 8 members including unknown', () => {
    expect(ctaStrategySchema.options).toHaveLength(8);
    expect(ctaStrategySchema.options).toContain('unknown');
    expect(new Set(ctaStrategySchema.options).size).toBe(8);
  });

  it('rejects an off-list CTA', () => {
    expect(ctaStrategySchema.safeParse('lead_capture').success).toBe(true);
    expect(ctaStrategySchema.safeParse('swipe_up').success).toBe(false);
  });
});

describe('valuePropStrategySchema', () => {
  it('is a closed enum of 8 members including unknown', () => {
    expect(valuePropStrategySchema.options).toHaveLength(8);
    expect(valuePropStrategySchema.options).toContain('unknown');
    expect(new Set(valuePropStrategySchema.options).size).toBe(8);
  });

  it('rejects an off-list value prop', () => {
    expect(valuePropStrategySchema.safeParse('save_time').success).toBe(true);
    expect(valuePropStrategySchema.safeParse('good_vibes').success).toBe(false);
  });
});

describe('taxonomy prompt guidance', () => {
  it('names every ctaStrategy member so the model can only pick from the enum', () => {
    for (const option of ctaStrategySchema.options) {
      expect(CTA_STRATEGY_GUIDANCE).toContain(option);
    }
  });

  it('names every valuePropStrategy member', () => {
    for (const option of valuePropStrategySchema.options) {
      expect(VALUE_PROP_GUIDANCE).toContain(option);
    }
  });
});

describe('CREATIVE_TAXONOMY_VERSION', () => {
  it('is bumped to 3 for the CTA / value-prop dimensions', () => {
    expect(CREATIVE_TAXONOMY_VERSION).toBe(3);
  });
});
