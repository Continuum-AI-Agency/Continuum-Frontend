import { describe, expect, it } from 'bun:test';
import {
  flashBriefFor,
  flashWantFor,
  implementTargets,
  predecessorAdIn,
  ratioForCreative,
  referenceAssetIdsFor,
} from './flashCreativesModel';

const ad = (id: string, format: string, status = 'ACTIVE') =>
  ({ id, name: `Ad ${id}`, status, creative: { format } }) as never;

describe('flash creatives model', () => {
  it('reads the placement ratio from the winner and the reference from the Library', () => {
    expect(ratioForCreative(ad('a', 'video'))).toBe('9:16');
    expect(
      flashWantFor({ ad_id: 'a', seed: { winnerAssetId: 'lib-1' } }, [ad('a', 'image')]),
    ).toEqual({
      ratio: '4:5',
      hasReference: true,
      count: 3,
    });
    expect(referenceAssetIdsFor({ seed: null })).toEqual([]);
  });
  it('builds the brief from the card’s three lines', () => {
    const brief = flashBriefFor(
      {
        id: 'r',
        adset_id: 's',
        ad_id: 'a',
        kind: 'variate_creative',
        trigger: 'C2_creative_winner',
        severity: 'medium',
        reason: 'wins',
        status: 'pending',
        seed: { angleId: 'offer_discount', audience: { branch: 'Prospecting', strategy: 'Broad' } },
        evidence: null,
      } as never,
      'Set',
      null,
      [ad('a', 'image')],
      'USD',
      'Vivo',
    );
    expect(brief.angle).toBe('Discount offer');
    expect(brief.audience).toBe('Prospecting · Broad');
    expect(brief.why).toBe('wins');
    expect(brief.sourceAdName).toBe('Ad a');
  });
  it('offers here first, then the same audience, then the rest', () => {
    const targets = implementTargets(
      [
        { adset_id: 's', adset_name: 'Source', targeting_hash: 'h1' },
        { adset_id: 'z', adset_name: 'Zebra', targeting_hash: 'h9' },
        { adset_id: 'b', adset_name: 'Beta', targeting_hash: 'h1' },
        { adset_id: 'n', adset_name: 'No hash', targeting_hash: null },
      ],
      's',
    );
    expect(targets.map((t) => [t.adsetId, t.relation])).toEqual([
      ['s', 'here'],
      ['b', 'same_audience'],
      ['n', 'other'],
      ['z', 'other'],
    ]);
  });
  it('picks the first delivering ad as the predecessor', () => {
    expect(predecessorAdIn([ad('p', 'image', 'PAUSED'), ad('q', 'image')])?.id).toBe('q');
    expect(predecessorAdIn([])).toBeNull();
  });
});
