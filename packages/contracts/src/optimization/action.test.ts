import { describe, expect, test } from 'bun:test';
import type { PlatformEntityRef } from '../paid/platform';
import {
  ACTION_REFUSALS,
  ActionPreflightSchema,
  BudgetMoveActionSchema,
  OptimizerActionSchema,
  type SetBudgetAction,
} from './action';

const googleCampaign: PlatformEntityRef = {
  platform: 'google_ads',
  level: 'campaign',
  nativeLevel: 'campaign',
  id: '22000000001',
  accountId: '3710693645',
  name: 'Search Marca+Genérico',
};

const metaAdset: PlatformEntityRef = {
  platform: 'meta',
  level: 'group',
  nativeLevel: 'adset',
  id: '120210000000000001',
  accountId: '1234567890',
};

function setBudget(
  ref: PlatformEntityRef,
  expectedMinor: number,
  targetMinor: number,
): SetBudgetAction {
  return {
    kind: 'set_budget',
    ref,
    budget: { kind: 'daily', minor: expectedMinor, currency: 'MXN', shared: false, ownerRef: ref },
    expectedMinor,
    targetMinor,
  };
}

describe('OptimizerActionSchema', () => {
  test('set_status only ever targets paused', () => {
    const pause = { kind: 'set_status', ref: metaAdset, expected: 'active', target: 'paused' };
    expect(OptimizerActionSchema.parse(pause).kind).toBe('set_status');
    expect(OptimizerActionSchema.safeParse({ ...pause, target: 'removed' }).success).toBe(false);
    expect(OptimizerActionSchema.safeParse({ ...pause, target: 'active' }).success).toBe(false);
  });

  test('set_budget carries the budget it read and whole minor units', () => {
    expect(OptimizerActionSchema.parse(setBudget(googleCampaign, 40_000, 28_000)).kind).toBe(
      'set_budget',
    );
    expect(OptimizerActionSchema.safeParse(setBudget(googleCampaign, 40_000, 280.5)).success).toBe(
      false,
    );
  });

  test('set_budget refuses a budget owned by a different entity platform', () => {
    const crossed = { ...setBudget(googleCampaign, 40_000, 28_000) };
    crossed.budget = { ...crossed.budget, ownerRef: metaAdset };
    expect(OptimizerActionSchema.safeParse(crossed).success).toBe(false);
  });

  test('set_bid_target names the field it moves', () => {
    const tcpa = {
      kind: 'set_bid_target',
      ref: googleCampaign,
      field: 'target_cpa_micros',
      expected: 61_200_000,
      target: 55_000_000,
    };
    expect(OptimizerActionSchema.parse(tcpa).kind).toBe('set_bid_target');
    const troas = { ...tcpa, field: 'target_roas', expected: 3.5, target: 3.2 };
    expect(OptimizerActionSchema.safeParse(troas).success).toBe(true);
    expect(OptimizerActionSchema.safeParse({ ...tcpa, field: 'bid_price' }).success).toBe(false);
    expect(OptimizerActionSchema.safeParse({ ...tcpa, target: 0 }).success).toBe(false);
  });

  test('add_negatives enforces Google keyword limits (80 chars, 10 words)', () => {
    const negatives = {
      kind: 'add_negatives',
      ref: googleCampaign,
      scope: 'campaign',
      terms: [{ text: 'gratis', matchType: 'EXACT' }],
    };
    expect(OptimizerActionSchema.parse(negatives).kind).toBe('add_negatives');
    expect(OptimizerActionSchema.safeParse({ ...negatives, terms: [] }).success).toBe(false);
    const tooManyWords = { text: 'a b c d e f g h i j k', matchType: 'PHRASE' };
    expect(OptimizerActionSchema.safeParse({ ...negatives, terms: [tooManyWords] }).success).toBe(
      false,
    );
    const tooLong = { text: 'x'.repeat(81), matchType: 'BROAD' };
    expect(OptimizerActionSchema.safeParse({ ...negatives, terms: [tooLong] }).success).toBe(false);
  });

  test('refuses an unknown kind', () => {
    expect(OptimizerActionSchema.safeParse({ kind: 'remove', ref: metaAdset }).success).toBe(false);
  });
});

describe('budget_move', () => {
  const move = {
    kind: 'budget_move',
    moveId: '7b0e3a52-5d1f-4b8e-9a51-0c3c1d2e4f60',
    currency: 'MXN',
    legs: [setBudget(googleCampaign, 40_000, 28_000), setBudget(metaAdset, 16_800, 28_800)],
  };

  test('the decrease goes first and the money is conserved', () => {
    const parsed = OptimizerActionSchema.parse(move);
    expect(parsed.kind).toBe('budget_move');
    expect(BudgetMoveActionSchema.parse(move).legs).toHaveLength(2);
  });

  test('may spread the increase over several legs', () => {
    const third = { ...metaAdset, id: '120210000000000002' };
    const spread = {
      ...move,
      legs: [
        setBudget(googleCampaign, 40_000, 28_000),
        setBudget(metaAdset, 10_000, 16_000),
        setBudget(third, 6_800, 12_800),
      ],
    };
    expect(BudgetMoveActionSchema.safeParse(spread).success).toBe(true);
  });

  test('refuses an increase before a decrease', () => {
    expect(
      BudgetMoveActionSchema.safeParse({ ...move, legs: [...move.legs].reverse() }).success,
    ).toBe(false);
  });

  test('refuses a move that creates or destroys money', () => {
    const leaky = {
      ...move,
      legs: [setBudget(googleCampaign, 40_000, 28_000), setBudget(metaAdset, 16_800, 30_000)],
    };
    expect(BudgetMoveActionSchema.safeParse(leaky).success).toBe(false);
  });

  test('refuses a leg in another currency than the move', () => {
    const usdLeg = setBudget(metaAdset, 16_800, 28_800);
    usdLeg.budget = { ...usdLeg.budget, currency: 'USD' };
    expect(
      BudgetMoveActionSchema.safeParse({ ...move, legs: [move.legs[0], usdLeg] }).success,
    ).toBe(false);
  });

  test('refuses a single leg and an unchanged leg', () => {
    expect(BudgetMoveActionSchema.safeParse({ ...move, legs: [move.legs[0]] }).success).toBe(false);
    const flat = {
      ...move,
      legs: [move.legs[0], setBudget(metaAdset, 16_800, 16_800), move.legs[1]],
    };
    expect(BudgetMoveActionSchema.safeParse(flat).success).toBe(false);
  });
});

describe('ActionPreflightSchema', () => {
  test('ok carries no refusal', () => {
    expect(ActionPreflightSchema.parse({ ok: true }).ok).toBe(true);
    expect(
      ActionPreflightSchema.safeParse({ ok: true, refusal: 'drifted', detail: 'x' }).success,
    ).toBe(false);
  });

  test('every refusal parses, with its detail', () => {
    expect(ACTION_REFUSALS).toEqual([
      'drifted',
      'validate_only_error',
      'guardrail',
      'shared_budget',
      'platform_readonly',
      'budget_below_spend_floor',
      'below_platform_minimum',
      'allowlist_required',
    ]);
    for (const refusal of ACTION_REFUSALS) {
      const parsed = ActionPreflightSchema.parse({
        ok: false,
        refusal,
        detail: `refused: ${refusal}`,
      });
      expect(parsed.ok).toBe(false);
      if (parsed.ok) throw new Error('expected a refusal');
      expect(parsed.refusal).toBe(refusal);
    }
  });

  test('a refusal must say which and why', () => {
    expect(ActionPreflightSchema.safeParse({ ok: false, detail: 'no reason' }).success).toBe(false);
    expect(ActionPreflightSchema.safeParse({ ok: false, refusal: 'guardrail' }).success).toBe(
      false,
    );
    expect(
      ActionPreflightSchema.safeParse({ ok: false, refusal: 'rate_limited', detail: 'x' }).success,
    ).toBe(false);
  });
});
