// The creative-request brief is the ONE wording four surfaces share (optimizer
// tasks panel, the request email, Jaina, and the swap worker). These tests pin
// the property that makes that safe: everything in the brief traces back to an
// input. A builder that invents a figure would be inventing it on all four.
import { describe, expect, test } from 'bun:test';
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
