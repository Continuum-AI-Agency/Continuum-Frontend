import { describe, expect, it } from 'bun:test';
import {
  adImageUrl,
  angleWords,
  audienceWords,
  creativeCardCopy,
  flashCreativesFor,
  isCreativeRecommendation,
  subjectAds,
} from './creativeCardModel';

const ad = (id: string, status = 'ACTIVE', imageUrl: string | null = null) =>
  ({ id, name: `Ad ${id}`, status, thumbnailUrl: `thumb-${id}`, creative: { imageUrl } }) as never;

describe('creative card model', () => {
  it('knows which recommendations are about a creative', () => {
    expect(isCreativeRecommendation({ kind: 'creative_refresh', ad_id: null })).toBe(true);
    expect(isCreativeRecommendation({ kind: 'pause', ad_id: null })).toBe(false);
    expect(isCreativeRecommendation({ kind: 'pause', ad_id: 'x' })).toBe(true);
  });
  it('picks the subject ad by id, the winner from the seed, or the delivering ads', () => {
    const ads = [ad('a', 'PAUSED'), ad('b'), ad('c'), ad('d')];
    expect(subjectAds({ ad_id: 'c', seed: null }, ads).map((a) => a.id)).toEqual(['c']);
    expect(subjectAds({ ad_id: null, seed: { winnerAdId: 'a' } }, ads).map((a) => a.id)).toEqual([
      'a',
    ]);
    expect(subjectAds({ ad_id: null, seed: null }, ads).map((a) => a.id)).toEqual(['b', 'c', 'd']);
  });
  it('prefers the full image, then the poster, then the thumbnail', () => {
    expect(adImageUrl(ad('a', 'ACTIVE', 'full'))).toBe('full');
    expect(adImageUrl(ad('a'))).toBe('thumb-a');
  });
  it('names the angle from the vocabulary or the labels, and the audience from the seed', () => {
    expect(angleWords({ seed: { angleId: 'offer_discount' } })).toBe('Discount offer');
    expect(angleWords({ seed: { labels: { angle: 'Price', hook: 'Urgency' } } })).toBe(
      'Price · Urgency',
    );
    expect(angleWords({ seed: null })).toBeNull();
    expect(
      audienceWords({ seed: { audience: { branch: 'Prospecting', strategy: 'Broad' } } }, null),
    ).toBe('Prospecting · Broad');
    expect(audienceWords({ seed: null }, 'remarketing')).toBe('remarketing');
  });
  it('says why in the engine’s terms', () => {
    expect(
      creativeCardCopy({ kind: 'variate_creative', trigger: 'C2_creative_winner', seed: null })
        .because,
    ).toBe('winner');
    expect(
      creativeCardCopy({ kind: 'creative_refresh', trigger: 'C4_creative_decay', seed: null })
        .headline,
    ).toContain('own history');
    expect(
      creativeCardCopy({ kind: 'creative_refresh', trigger: 'F1_creative_fatigue', seed: null })
        .because,
    ).toBe('fatigue');
  });
  it('matches flash creatives by recommendation, else by ad set', () => {
    const jobs = [
      { id: 'j1', recommendation_id: 'r1', adset_id: 'a', status: 'generated' },
      { id: 'j2', recommendation_id: 'r9', adset_id: 'a', status: 'queued' },
      { id: 'j3', recommendation_id: 'r9', adset_id: 'a', status: 'cancelled' },
    ] as never;
    expect(flashCreativesFor({ id: 'r1', adset_id: 'a' }, jobs).map((j) => j.id)).toEqual(['j1']);
    expect(flashCreativesFor({ id: 'r2', adset_id: 'a' }, jobs).map((j) => j.id)).toEqual([
      'j1',
      'j2',
    ]);
  });
});
