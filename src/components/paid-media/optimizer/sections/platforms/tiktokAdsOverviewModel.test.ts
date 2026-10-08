import { describe, expect, it } from 'bun:test';
import { TIKTOK_DOC_SHAPED_ENVELOPE } from './__fixtures__/tiktokSnapshots';
import {
  buildTikTokOverview,
  shortAdvertiserId,
  type TikTokSnapshotsEnvelope,
  TikTokSnapshotsEnvelopeSchema,
} from './tiktokAdsOverviewModel';

describe('TikTokSnapshotsEnvelopeSchema', () => {
  it('accepts the envelope the edge builds from the v1.3 doc-shaped rows', () => {
    const parsed = TikTokSnapshotsEnvelopeSchema.safeParse(TIKTOK_DOC_SHAPED_ENVELOPE);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.entities).toHaveLength(8);
  });

  it('refuses an envelope of another scope or another platform', () => {
    expect(
      TikTokSnapshotsEnvelopeSchema.safeParse({ ...TIKTOK_DOC_SHAPED_ENVELOPE, scope: 'campaigns' })
        .success,
    ).toBe(false);
    expect(
      TikTokSnapshotsEnvelopeSchema.safeParse({ ...TIKTOK_DOC_SHAPED_ENVELOPE, platform: 'meta' })
        .success,
    ).toBe(false);
  });
});

describe('buildTikTokOverview', () => {
  const envelope = TikTokSnapshotsEnvelopeSchema.parse(TIKTOK_DOC_SHAPED_ENVELOPE);
  const overview = buildTikTokOverview(envelope);

  it('sums spend over campaigns only — never campaigns and their ad groups twice', () => {
    // 1,892.46 + 4,655 + 1,995: the three campaigns' 7-day windows.
    expect(overview.spend).toBe(8542.46);
    expect(overview.campaigns).toBe(3);
    expect(overview.adGroups).toBe(5);
    expect(overview.currency).toBe('MXN');
    expect(overview.window).toEqual(envelope.windows.d7);
  });

  it('keeps leads and conversations as two kinds, largest spend first, each with its own cost', () => {
    expect(overview.kinds).toEqual([
      { kind: 'leads', results: 101, spend: 6547.46, costPerResult: 6547.46 / 101 },
      { kind: 'conversations', results: 30, spend: 1995, costPerResult: 66.5 },
    ]);
    expect(overview.unclassifiedSpend).toBe(0);
  });

  it('lists the top three ad groups by spend, each with its campaign and its own cost', () => {
    expect(overview.topAdGroups.map((row) => [row.name, row.spend, row.results])).toEqual([
      ['EF | Smart+ | Leads (ad group)', 4655, 76],
      ['EF | Mensajes | Broad', 1995, 30],
      ['EF | Leads | Broad MX', 690.03, 11],
    ]);
    expect(overview.topAdGroups[0]?.campaignName).toBe('EF | Smart+ | Leads');
    expect(overview.topAdGroups[1]?.kind).toBe('conversations');
    expect(overview.topAdGroups[2]?.costPerResult).toBeCloseTo(62.73, 2);
  });

  it('counts a campaign with no known result kind as unclassified, and a cost from nothing as null', () => {
    const silent: TikTokSnapshotsEnvelope = {
      ...envelope,
      entities: envelope.entities.map((entity) => {
        const d7 = entity.snapshot.windows.d7;
        const { leads: _leads, conversations: _conversations, ...rest } = d7;
        return {
          snapshot: {
            ...entity.snapshot,
            windows: { ...entity.snapshot.windows, d7: { ...rest, purchases: 0 } },
          },
        };
      }),
    };
    const read = buildTikTokOverview(silent);
    expect(read.kinds).toEqual([]);
    expect(read.unclassifiedSpend).toBe(8542.46);
    expect(read.topAdGroups[0]?.kind).toBeNull();
    expect(read.topAdGroups[0]?.costPerResult).toBeNull();
  });

  it('reads an advertiser that reported no currency as unpriced, with nothing to list', () => {
    const { currency: _currency, ...rest } = envelope;
    const read = buildTikTokOverview({ ...rest, entities: [] });
    expect(read.currency).toBeNull();
    expect(read.spend).toBe(0);
    expect(read.topAdGroups).toEqual([]);
  });
});

describe('shortAdvertiserId', () => {
  it('keeps the head and the tail of a long advertiser id', () => {
    expect(shortAdvertiserId('7000000000000000001')).toBe('7000…0001');
    expect(shortAdvertiserId('12345')).toBe('12345');
  });
});
