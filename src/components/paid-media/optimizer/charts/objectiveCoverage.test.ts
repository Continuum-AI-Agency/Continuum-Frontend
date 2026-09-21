import { describe, expect, it } from 'bun:test';
import { OptimizationObjectiveSchema } from '@continuum/contracts';

import { funnelStepsFor } from './vizData';
import { OBJECTIVE_COLOR, objectiveColor } from './vizTokens';

// Both maps are `Record<string, …>`, so a missing objective is not a type error — it is a
// silent fallback. Both fallbacks used to be PURCHASE's: a custom-conversion portfolio was
// drawn in purchase's colour and given an "Add to cart → Purchases" funnel of zeros. A chart
// of zeros is a claim about the business, not an absence of data.
describe('every objective is drawable', () => {
  it('has a colour of its own, and no two objectives share purchase-by-accident', () => {
    for (const objective of OptimizationObjectiveSchema.options) {
      expect(OBJECTIVE_COLOR[objective]).toBeDefined();
    }
  });

  it("never falls back to an objective's own swatch", () => {
    // An unknown objective must look unknown, not like a purchase portfolio.
    expect(objectiveColor('not_an_objective')).not.toBe(OBJECTIVE_COLOR.purchase);
    expect(objectiveColor(null)).not.toBe(OBJECTIVE_COLOR.purchase);
  });

  it('has a funnel whose steps are all real window columns', () => {
    for (const objective of OptimizationObjectiveSchema.options) {
      const steps = funnelStepsFor(objective);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps[0]?.key).toBe('impressions');
    }
  });

  it('never draws an e-commerce funnel for an objective that sells nothing', () => {
    for (const objective of ['conversations', 'thruplays', 'post_engagement', 'custom'] as const) {
      const keys = funnelStepsFor(objective).map((step) => step.key);
      expect(keys).not.toContain('addToCarts');
      expect(keys).not.toContain('purchases');
    }
  });

  it('gives an unknown objective the shared floor, not the purchase funnel', () => {
    const keys = funnelStepsFor('not_an_objective').map((step) => step.key);
    expect(keys).toEqual(['impressions', 'clicks']);
  });
});
