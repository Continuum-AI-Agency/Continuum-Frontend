import { describe, expect, it } from 'bun:test';
import { buildJainaChatStreamRequest } from './chatRequest';

describe('buildJainaChatStreamRequest', () => {
  it('keeps legacy single-account requests unchanged when no paid entity is mentioned', () => {
    const request = buildJainaChatStreamRequest(
      { query: 'Summarize performance', adAccountId: 'act_1', brandId: 'brand-1' },
      'America/Denver',
    );

    expect(request.context.adAccountId).toBe('act_1');
    expect(request.context.adAccountIds).toBeUndefined();
    expect(request.context.dataScope).toBeUndefined();
  });

  it('serializes selected accounts through both account fields and fails closed around mentions', () => {
    const request = buildJainaChatStreamRequest(
      {
        query: 'Compare these entities',
        adAccountId: 'act_1',
        adAccountIds: ['act_1', 'act_2'],
        brandId: 'brand-1',
        references: [
          {
            id: 'campaign-1',
            type: 'campaign',
            label: 'Campaign one',
            source: 'jaina',
            metadata: { campaignId: 'campaign-1' },
          },
          {
            id: 'adset-1',
            type: 'adset',
            label: 'Ad set one',
            source: 'jaina',
            metadata: { campaignId: 'campaign-1', adsetId: 'adset-1' },
          },
          {
            id: 'creative-1',
            type: 'creative_insight',
            label: 'Ad one',
            source: 'jaina',
            metadata: { adId: 'ad-1' },
          },
        ],
      },
      'America/Denver',
    );

    expect(request.context.adAccountIds).toEqual(['act_1', 'act_2']);
    expect(request.context.dataScope).toEqual({
      schemaVersion: 1,
      accounts: [
        { platform: 'meta', accountId: 'act_1' },
        { platform: 'meta', accountId: 'act_2' },
      ],
      campaigns: { ids: ['campaign-1'] },
      groups: { ids: ['adset-1'] },
      ads: { ids: ['ad-1'] },
    });
  });

  it('preserves empty sibling entity ids instead of widening them', () => {
    const request = buildJainaChatStreamRequest(
      {
        query: 'Inspect this campaign',
        adAccountId: 'act_1',
        brandId: 'brand-1',
        references: [
          {
            id: 'campaign-1',
            type: 'campaign',
            label: 'Campaign one',
            source: 'jaina',
          },
        ],
      },
      'UTC',
    );

    expect(request.context.adAccountIds).toEqual(['act_1']);
    expect(request.context.dataScope?.campaigns?.ids).toEqual(['campaign-1']);
    expect(request.context.dataScope?.groups?.ids).toEqual([]);
    expect(request.context.dataScope?.ads?.ids).toEqual([]);
  });
});
