// The freeze-reason union is the one string that crosses every boundary in the optimizer:
// the engine writes it, the service persists it into optimizer.cycle_items.diagnostics, and
// the Frontend's freezeLabel map turns it into the sentence an operator reads when their
// budget did not move. A reason that parses on one side and not the other renders as a bare
// "Held" with no explanation, so the union is fenced here.

import { describe, expect, test } from 'bun:test';
import { AdSetSnapshotSchema, FreezeReasonSchema } from './engine-contracts';

describe('FreezeReasonSchema', () => {
  test('carries every reason the engine can emit', () => {
    expect([...FreezeReasonSchema.options].sort()).toEqual([
      'kpi_mismatch',
      'lifetime_budget',
      'no_conversions',
      'no_declared_objective',
      'no_own_budget',
      'unsupported_budget',
    ]);
  });

  test('rejects a reason nobody defined — the union is closed on purpose', () => {
    expect(FreezeReasonSchema.safeParse('vibes').success).toBe(false);
  });

  test('no_own_budget and no_declared_objective are DISTINCT reasons, not aliases', () => {
    // They answer different operator questions: "give this ad set a budget" versus "tell Meta
    // what this ad set is buying". Collapsing them would lose the actionable half.
    expect(FreezeReasonSchema.parse('no_own_budget')).not.toBe(
      FreezeReasonSchema.parse('no_declared_objective'),
    );
  });
});

describe('AdSetSnapshotSchema round-trips the new reasons', () => {
  const base = {
    id: 'as1',
    status: 'frozen' as const,
    currentBudget: 0,
    ageDays: 12,
    windows: {
      d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d7: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d14: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
    },
  };

  test('a zero-budget boosted post parses with no_own_budget', () => {
    const parsed = AdSetSnapshotSchema.parse({
      ...base,
      name: 'Instagram Post',
      freeze: true,
      freezeReason: 'no_own_budget',
    });
    expect(parsed.freezeReason).toBe('no_own_budget');
    expect(parsed.currentBudget).toBe(0);
  });

  test('an ad set declaring nothing parses with no_declared_objective', () => {
    const parsed = AdSetSnapshotSchema.parse({
      ...base,
      currentBudget: 40,
      freeze: true,
      freezeReason: 'no_declared_objective',
    });
    expect(parsed.freezeReason).toBe('no_declared_objective');
    // The defining absence: it carries neither declaration.
    expect(parsed.optimization_goal).toBeUndefined();
    expect(parsed.kpiField).toBeUndefined();
  });
});
