import { describe, expect, it } from 'bun:test';
import {
  campaignArtifactSchemaRegistry,
  campaignChecklistRegistry,
} from '../goals/campaign-artifacts';
import { getGoalTemplate, TRIAL_REELS_TEMPLATE_ID } from '../goals/templates';
import {
  TRIAL_CHECKPOINT_VERSION,
  trialCheckpointSchema,
  trialDimensionsSchema,
  trialFenceSchema,
  trialStandingSchema,
} from './index';

const fence = {
  maxRounds: 6,
  maxVariantsPerRound: 4,
  minExposuresPerVariant: 1_000,
  minMarginRatio: 1.25,
  dryRoundsBeforeStop: 2,
  minConfirmingRounds: 1,
  spendCap: null,
};

const metric = { key: 'hookRate', unit: '%', direction: 'higher_is_better' as const };

const variant = (variantId: string, score: number | null) => ({
  variantId,
  dimensions: { hook: 'curiosity_gap' as const },
  exposures: 5_000,
  score,
  publishedMediaId: null,
});

const standing = (overrides: Record<string, unknown> = {}) => ({
  roundNumber: 1,
  metric,
  winner: variant('a', 60),
  runnerUp: variant('b', 40),
  contenders: [variant('a', 60), variant('b', 40)],
  underpowered: [],
  laggards: [variant('b', 40)],
  median: 50,
  marginRatio: 1.5,
  withheldReason: null,
  flags: [],
  groundedOn: ['winner: "a"'],
  ...overrides,
});

describe('trialDimensionsSchema', () => {
  it('reuses the cross-side creative taxonomy for hook and CTA', () => {
    const parsed = trialDimensionsSchema.parse({
      hook: 'social_proof',
      cta: 'start_trial',
      angle: 'salon-results-at-home',
      openingFrame: 'founder_to_camera',
    });
    expect(parsed.cta).toBe('start_trial');
  });

  it('rejects a hook or CTA outside the shared taxonomy, so trials join to paid intel', () => {
    expect(trialDimensionsSchema.safeParse({ hook: 'vibes' }).success).toBe(false);
    expect(trialDimensionsSchema.safeParse({ cta: 'buy_it_maybe' }).success).toBe(false);
  });

  it('rejects a variant occupying no dimension at all — it can teach nothing', () => {
    expect(trialDimensionsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-slug angle so the ledger can aggregate on it', () => {
    expect(trialDimensionsSchema.safeParse({ angle: 'Salon Results At Home' }).success).toBe(false);
  });
});

describe('trialFenceSchema', () => {
  it('accepts a well-formed fence', () => {
    expect(trialFenceSchema.parse(fence).maxRounds).toBe(6);
  });

  it('refuses to demand more confirming rounds than the trial may run', () => {
    const result = trialFenceSchema.safeParse({ ...fence, maxRounds: 2, minConfirmingRounds: 3 });
    expect(result.success).toBe(false);
  });

  it('refuses a single-variant round — that is an assertion, not an experiment', () => {
    expect(trialFenceSchema.safeParse({ ...fence, maxVariantsPerRound: 1 }).success).toBe(false);
  });

  it('refuses a margin threshold below 1x, which would make any gap a winner', () => {
    expect(trialFenceSchema.safeParse({ ...fence, minMarginRatio: 0.9 }).success).toBe(false);
  });
});

describe('trialStandingSchema', () => {
  it('accepts a standing that names a winner', () => {
    expect(trialStandingSchema.parse(standing()).winner?.variantId).toBe('a');
  });

  it('accepts a standing that withholds one and says why', () => {
    const withheld = trialStandingSchema.parse(
      standing({ winner: null, withheldReason: 'single_variant', marginRatio: null, laggards: [] }),
    );
    expect(withheld.withheldReason).toBe('single_variant');
  });

  it('rejects naming a winner AND a reason for withholding one', () => {
    expect(trialStandingSchema.safeParse(standing({ withheldReason: 'no_signal' })).success).toBe(
      false,
    );
  });

  it('rejects withholding a winner without saying why', () => {
    expect(
      trialStandingSchema.safeParse(standing({ winner: null, withheldReason: null })).success,
    ).toBe(false);
  });

  it('keeps a measured-and-empty score distinct from a missing one', () => {
    const parsed = trialStandingSchema.parse(
      standing({ winner: variant('a', 60), runnerUp: variant('b', null) }),
    );
    expect(parsed.runnerUp?.score).toBeNull();
    // `score` is nullable, but never optional — a missing read cannot masquerade as a zero.
    expect(
      trialStandingSchema.safeParse(standing({ winner: { ...variant('a', 60), score: undefined } }))
        .success,
    ).toBe(false);
  });
});

describe('trialCheckpointSchema', () => {
  const base = {
    version: TRIAL_CHECKPOINT_VERSION,
    arm: 'organic_trial_reel' as const,
    metric,
    fence,
    graduationStrategy: 'MANUAL' as const,
    rounds: [],
  };

  it('defaults an empty trial to zero spend and nothing pending', () => {
    const parsed = trialCheckpointSchema.parse(base);
    expect(parsed.spentTotal).toBe(0);
    expect(parsed.pendingSlate).toBeNull();
    expect(parsed.lastDecision).toBeNull();
    expect(parsed.measureAfter).toBeNull();
  });

  it('refuses a checkpoint written under a different version rather than misreading it', () => {
    expect(trialCheckpointSchema.safeParse({ ...base, version: 99 }).success).toBe(false);
  });
});

describe('trial reels Goal template', () => {
  const template = getGoalTemplate(TRIAL_REELS_TEMPLATE_ID);

  it('is registered and parses', () => {
    expect(template?.id).toBe(TRIAL_REELS_TEMPLATE_ID);
  });

  it('resolves every artifact to a content schema and a non-empty checklist', () => {
    for (const artifact of template?.artifacts ?? []) {
      expect(campaignArtifactSchemaRegistry).toHaveProperty(artifact.contentSchemaId);
      expect(campaignChecklistRegistry[artifact.contentSchemaId].length).toBeGreaterThan(0);
      expect(artifact.checklist.length).toBeGreaterThan(0);
    }
  });

  it('asks its checklist questions about a trial, not a campaign', () => {
    const questions = campaignChecklistRegistry['trial-reels-charter'].map((r) => r.question);
    expect(questions.every((q) => q.endsWith('for this trial.'))).toBe(true);
  });

  it('orders the workstreams charter -> hypothesis -> execution -> verdict', () => {
    const byId = new Map((template?.workstreams ?? []).map((w) => [w.id, w]));
    expect(byId.get('trial-hypothesis')?.dependencyIds).toContain('trial-charter');
    expect(byId.get('trial-execution')?.dependencyIds).toContain('trial-hypothesis');
    expect(byId.get('trial-verdict')?.dependencyIds).toContain('trial-execution');
  });

  it('does not require budget authorization — organic discovery is free', () => {
    expect(template?.readiness.requiresBudgetAuthorization).toBe(false);
  });
});
