import { describe, expect, it } from 'bun:test';
import { OBJECTIVE_PROFILES } from '@continuum/optimization-engine';

import { OptimizationObjectiveSchema } from './engine-contracts';
import { getOptimizationMetricDefinition } from './service';

// Two maps name the column an objective is counted from: the engine's, which the cycle
// prices with, and this package's, which the read and the screen price with. They are
// written by hand, in different repositories, and nothing made them agree — so `custom`
// was counted from `leads` by one and `purchases` by the other, measuring the same
// portfolio two ways depending on which surface asked.
describe('the two KPI maps', () => {
  it('name the same column for every objective', () => {
    const disagreements = OptimizationObjectiveSchema.options
      .map((objective) => ({
        objective,
        engine: OBJECTIVE_PROFILES[objective].kpiField,
        contracts: getOptimizationMetricDefinition(objective).kpiField,
      }))
      .filter((row) => row.engine !== row.contracts);
    expect(disagreements).toEqual([]);
  });

  it('cover every objective in the enum, with no extras', () => {
    expect(Object.keys(OBJECTIVE_PROFILES).sort()).toEqual(
      [...OptimizationObjectiveSchema.options].sort(),
    );
  });

  // getOptimizationMetricDefinition falls back to `purchase` for anything it cannot parse,
  // so a missing entry would answer with purchase's rather than throwing. Each objective
  // must answer with ITS OWN definition or the fallback is hiding a hole.
  it('answer with the objective asked for, never the purchase fallback in disguise', () => {
    for (const objective of OptimizationObjectiveSchema.options) {
      expect(getOptimizationMetricDefinition(objective).objective).toBe(objective);
    }
  });
});
