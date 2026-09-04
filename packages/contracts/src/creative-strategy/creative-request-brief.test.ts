// The creative-request brief is the ONE wording four surfaces share (optimizer
// tasks panel, the request email, Jaina, and the swap worker). These tests pin
// the property that makes that safe: everything in the brief traces back to an
// input. A builder that invents a figure would be inventing it on all four.
import { describe, expect, test } from 'bun:test';
import { GLOBAL_ANGLE_DEFINITIONS } from './angles';
import {
  buildCreativeRequestBrief,
  type CreativeVariationSeedInput,
  creativeRequestBriefSchema,
} from './paid';

const fullSeed: CreativeVariationSeedInput = {
  adSetId: '23851234567890123',
  winnerAdId: '23859876543210987',
  winnerAssetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  labels: { hookArchetype: 'social_proof', funnelStage: 'tof' },
  posterUrl: 'https://example.test/poster.jpg',
  rebuildCraft: true,
  groundedOn: ['hook_archetype=social_proof @ tof', 'asset_type=ugc @ tof'],
};

const bareSeed: CreativeVariationSeedInput = { adSetId: '23851234567890123' };

describe('buildCreativeRequestBrief', () => {
  test.each([
    'variate_creative',
    'seed_experiment',
    'creative_refresh',
  ])('produces a schema-valid brief for %s with a full seed', (kind) => {
    const brief = buildCreativeRequestBrief(fullSeed, kind, 'winner costs 2.2x less per result');
    expect(() => creativeRequestBriefSchema.parse(brief)).not.toThrow();
    expect(brief.kind).toBe(kind);
    expect(brief.adSetId).toBe(fullSeed.adSetId);
    expect(brief.title.length).toBeGreaterThan(0);
  });

  test.each([
    'variate_creative',
    'seed_experiment',
    'creative_refresh',
  ])('produces a schema-valid brief for %s with a bare seed', (kind) => {
    const brief = buildCreativeRequestBrief(bareSeed, kind);
    expect(() => creativeRequestBriefSchema.parse(brief)).not.toThrow();
    expect(brief.winnerAssetId).toBeNull();
    expect(brief.posterUrl).toBeNull();
    expect(brief.rebuildCraft).toBe(false);
    expect(brief.groundedOn).toEqual([]);
  });

  test('passes groundedOn citations through untouched', () => {
    const brief = buildCreativeRequestBrief(fullSeed, 'variate_creative');
    expect(brief.groundedOn).toEqual(fullSeed.groundedOn);
  });

  test('rebuildCraft says keep the angle, rebuild the execution', () => {
    const brief = buildCreativeRequestBrief(fullSeed, 'variate_creative');
    expect(brief.brief).toContain('Keep the angle');
    expect(brief.brief).toContain('social_proof');
  });

  test('without rebuildCraft it asks to stay close to the winning combination', () => {
    const brief = buildCreativeRequestBrief(
      { ...fullSeed, rebuildCraft: false },
      'variate_creative',
    );
    expect(brief.brief).toContain('Keep close to the winning combination');
  });

  test('says so explicitly when the winner is not in the Library', () => {
    const brief = buildCreativeRequestBrief(
      { ...fullSeed, winnerAssetId: null },
      'variate_creative',
    );
    expect(brief.brief).toContain('not in the Library');
  });

  test('seed_experiment explains why a comparison does not exist yet', () => {
    const brief = buildCreativeRequestBrief(bareSeed, 'seed_experiment');
    expect(brief.brief).toContain('single creative');
  });

  // The load-bearing one: no number, id, or claim may appear that was not handed in.
  test('invents nothing — every token traces to an input', () => {
    const reason = 'winner costs 2.2x less per result';
    const brief = buildCreativeRequestBrief(fullSeed, 'variate_creative', reason);
    const inputTokens = new Set(
      [
        reason,
        fullSeed.adSetId,
        fullSeed.winnerAdId ?? '',
        fullSeed.winnerAssetId ?? '',
        fullSeed.posterUrl ?? '',
        'social_proof',
        'tof',
        'hookArchetype',
        'funnelStage',
      ]
        .join(' ')
        .split(/\s+/)
        .filter(Boolean),
    );
    // Any token carrying a digit must have come from the inputs — that is where a
    // hallucinated metric would show up.
    const numericTokens = brief.brief.split(/\s+/).filter((t) => /\d/.test(t));
    for (const token of numericTokens) {
      const bare = token.replace(/[.,;:()]+$/, '');
      expect(
        [...inputTokens].some((input) => input.includes(bare) || bare.includes(input)),
        `'${bare}' is not traceable to an input`,
      ).toBe(true);
    }
  });

  test('an unknown kind still yields a usable title', () => {
    const brief = buildCreativeRequestBrief(bareSeed, 'some_future_kind');
    expect(brief.title.length).toBeGreaterThan(0);
    expect(() => creativeRequestBriefSchema.parse(brief)).not.toThrow();
  });
});

// --- The reason travels ON THE SEED -----------------------------------------
// The third argument always worked; nothing passed it. The approval fan-out now
// stamps the recommendation's reason and kind onto the seed (migration
// 20260903182800) so both production callers can read them off one object.
describe('the reason and kind carried on the seed', () => {
  const seedWithWhy: CreativeVariationSeedInput = {
    ...fullSeed,
    kind: 'seed_experiment',
    reason:
      'cost per conversation is up 41% (3d $58.20 vs 14d $41.30) while CTR is down 23%, ' +
      'on 84,000 impressions over 14 days',
  };

  test('a seed reason becomes the opening "Why:" of the brief', () => {
    const brief = buildCreativeRequestBrief(seedWithWhy, 'seed_experiment', seedWithWhy.reason);
    expect(brief.brief.startsWith('Why: cost per conversation is up 41%')).toBe(true);
    // The figures survive intact — the builder never restates them in its own words.
    expect(brief.brief).toContain('3d $58.20 vs 14d $41.30');
    expect(brief.brief).toContain('CTR is down 23%');
  });

  test('omitting the reason is what the old callers did — labels, and no why', () => {
    const brief = buildCreativeRequestBrief(seedWithWhy, 'seed_experiment');
    expect(brief.brief).not.toContain('Why:');
    expect(brief.brief).not.toContain('41%');
  });

  test('kind on the seed titles the brief correctly instead of defaulting', () => {
    // produce.ts used to hard-code 'variate_creative', which titled a seed_experiment
    // as a variation of a winner the ad set did not have.
    const experiment = buildCreativeRequestBrief(
      seedWithWhy,
      seedWithWhy.kind ?? 'variate_creative',
    );
    const defaulted = buildCreativeRequestBrief(seedWithWhy, 'variate_creative');
    expect(experiment.title).toBe('Create a first experiment creative for this ad set');
    expect(defaulted.title).toBe('Create a variation of the winning creative');
    expect(experiment.title).not.toBe(defaulted.title);
  });

  test('the extra seed keys do not leak into the brief payload', () => {
    // creativeRequestBriefSchema is the contract four surfaces read; reason/kind
    // ride on the SEED, and only `kind` is a brief field.
    const brief = buildCreativeRequestBrief(seedWithWhy, 'seed_experiment', seedWithWhy.reason);
    expect(creativeRequestBriefSchema.parse(brief)).toEqual(brief);
    expect(Object.keys(brief)).not.toContain('reason');
  });
  test('a pre-approved angle is quoted into the brief from the closed vocabulary', () => {
    const brief = buildCreativeRequestBrief(
      { ...fullSeed, angleId: 'risk_reversal_trial' },
      'variate_creative',
    );
    expect(brief.angleId).toBe('risk_reversal_trial');
    expect(brief.brief).toContain(GLOBAL_ANGLE_DEFINITIONS.risk_reversal_trial);
  });

  test('no agreed angle reads as unknown, never as "pick one"', () => {
    const brief = buildCreativeRequestBrief(fullSeed, 'variate_creative');
    expect(brief.angleId).toBeNull();
    expect(brief.brief).not.toContain('Angle (pre-approved');
  });

  // The rule angleSynthesis.ts states and this schema has to enforce: an off-vocabulary
  // angle is a HARD REJECT, never a coerce. A coerce would launder a hallucinated strategy
  // into the store as a legitimate-looking row.
  test('an off-vocabulary angle is rejected rather than coerced', () => {
    expect(() =>
      buildCreativeRequestBrief(
        { ...fullSeed, angleId: 'make_it_pop' as never },
        'variate_creative',
      ),
    ).toThrow();
  });

  test('a nominated pipeline rides the brief so the producer knows how to make it', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(
      buildCreativeRequestBrief({ ...fullSeed, pipelineId: id }, 'variate_creative').pipelineId,
    ).toBe(id);
    expect(buildCreativeRequestBrief(fullSeed, 'variate_creative').pipelineId).toBeNull();
  });
});
