import { describe, expect, it } from 'bun:test';

import type { ActionLog } from '@/lib/types/dco';

import { summarizeCreativeRotations } from './useCreativeRotations';

function makeLog(overrides: Partial<ActionLog>): ActionLog {
  return {
    id: overrides.id ?? 'log-1',
    brandId: 'brand-1',
    metaAccountId: 'act_1',
    metaCampaignId: overrides.metaCampaignId ?? 'c-1',
    metaAdsetId: overrides.metaAdsetId ?? 'as-1',
    metaAdId: overrides.metaAdId ?? 'ad-1',
    actionType: overrides.actionType ?? 'CREATIVE_SWITCH_EXTERNAL',
    status: overrides.status ?? 'SUCCESS',
    scopeType: overrides.scopeType ?? 'AD',
    scopeId: overrides.scopeId ?? 'ad-1',
    occurredAt: overrides.occurredAt ?? '2026-05-01T00:00:00.000Z',
    actionPayload: overrides.actionPayload ?? {},
    paramsChanged: {},
    result: {},
    decisionNote: overrides.decisionNote ?? null,
    error: overrides.error ?? null,
  };
}

describe('summarizeCreativeRotations', () => {
  it('returns empty when adId is null', () => {
    const result = summarizeCreativeRotations({ adId: null, logs: [] });
    expect(result.rotations).toEqual([]);
    expect(result.uniqueCreatives).toEqual([]);
    expect(result.latestSwap).toBeNull();
  });

  it('orders rotations ascending by occurredAt', () => {
    const logs = [
      makeLog({
        id: 'b',
        occurredAt: '2026-05-03T00:00:00.000Z',
        actionPayload: { original_creative_url: 'u2', new_creative_url: 'u3' },
      }),
      makeLog({
        id: 'a',
        occurredAt: '2026-05-01T00:00:00.000Z',
        actionPayload: { original_creative_url: 'u1', new_creative_url: 'u2' },
      }),
    ];

    const result = summarizeCreativeRotations({ adId: 'ad-1', logs });
    expect(result.rotations.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.latestSwap?.id).toBe('b');
  });

  it('dedupes creatives and records firstSeenAt / replacedAt', () => {
    const logs = [
      makeLog({
        id: 'a',
        occurredAt: '2026-05-01T00:00:00.000Z',
        actionPayload: { original_creative_url: 'u1', new_creative_url: 'u2' },
      }),
      makeLog({
        id: 'b',
        occurredAt: '2026-05-02T00:00:00.000Z',
        actionPayload: { original_creative_url: 'u2', new_creative_url: 'u3' },
      }),
    ];

    const result = summarizeCreativeRotations({ adId: 'ad-1', logs });
    const byUrl = new Map(result.uniqueCreatives.map((c) => [c.url, c]));
    expect(byUrl.size).toBe(3);
    expect(byUrl.get('u2')?.replacedAt).toBe('2026-05-02T00:00:00.000Z');
    expect(byUrl.get('u3')?.replacedAt).toBeNull();
  });

  it('flags currentCreative imageUrl as isCurrent', () => {
    const logs = [
      makeLog({
        id: 'a',
        occurredAt: '2026-05-01T00:00:00.000Z',
        actionPayload: { original_creative_url: 'u1', new_creative_url: 'u2' },
      }),
    ];

    const result = summarizeCreativeRotations({
      adId: 'ad-1',
      logs,
      currentCreative: { imageUrl: 'u2' },
    });
    expect(result.uniqueCreatives[0]?.url).toBe('u2');
    expect(result.uniqueCreatives[0]?.isCurrent).toBe(true);
  });

  it('tolerates null payload URLs', () => {
    const logs = [
      makeLog({
        id: 'a',
        occurredAt: '2026-05-01T00:00:00.000Z',
        actionPayload: { original_creative_url: null, new_creative_url: null },
      }),
    ];

    const result = summarizeCreativeRotations({ adId: 'ad-1', logs });
    expect(result.rotations).toHaveLength(1);
    expect(result.rotations[0]?.beforeUrl).toBeNull();
    expect(result.rotations[0]?.afterUrl).toBeNull();
    expect(result.uniqueCreatives).toEqual([]);
  });

  it('ignores logs for other ads or non-creative-swap actions', () => {
    const logs = [
      makeLog({ id: 'a', metaAdId: 'other-ad' }),
      makeLog({ id: 'b', actionType: 'PAUSE_AD' }),
      makeLog({
        id: 'c',
        actionType: 'SWITCH_CREATIVE',
        actionPayload: { new_creative_url: 'u-new' },
      }),
    ];

    const result = summarizeCreativeRotations({ adId: 'ad-1', logs });
    expect(result.rotations.map((r) => r.id)).toEqual(['c']);
  });
});
