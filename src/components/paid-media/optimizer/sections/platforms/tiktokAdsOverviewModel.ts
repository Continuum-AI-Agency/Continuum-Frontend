// The TikTok tab's own read (frontend.html §7, feature 06): the `tiktok_snapshots` envelope of
// paid-media-metrics, the same entity read the Optimizer's ingest makes. Every entity is parsed
// with the contract's MultiPlatformSnapshotSchema; the envelope around it is the edge's
// (supabase/functions/paid-media-metrics/tiktok/snapshots.ts, TikTokSnapshotsEnvelope) and only
// the fields this tab prints are read from it.
//
// Two rules hold every figure: a campaign's window is the sum of its ad groups', so the
// account's totals are summed over campaigns and never over both levels; and a result kind is
// the bucket an entity optimizes for (leads, conversations, …), never one count across kinds.

import { MultiPlatformSnapshotSchema, type MultiPlatformWindowMetrics } from '@continuum/contracts';
import { z } from 'zod';

const DayRangeSchema = z.object({ since: z.string(), until: z.string() });

export const TikTokSnapshotsEnvelopeSchema = z.object({
  scope: z.literal('tiktok_snapshots'),
  platform: z.literal('tiktok_ads'),
  accountId: z.string().min(1),
  accountName: z.string().optional(),
  /** Absent when the advertiser reported none: then no entity was priced. */
  currency: z.string().optional(),
  windows: z.object({ d7: DayRangeSchema }),
  fetched_at: z.string(),
  entities: z.array(z.object({ snapshot: MultiPlatformSnapshotSchema })),
});
export type TikTokSnapshotsEnvelope = z.infer<typeof TikTokSnapshotsEnvelopeSchema>;

/** The buckets the snapshot fills from TikTok's `conversion` metric, in the words' keys. */
const RESULT_FIELDS = ['leads', 'purchases', 'conversations', 'signups', 'appInstalls'] as const;
type ResultField = (typeof RESULT_FIELDS)[number];

/** How many ad groups the tab lists under its tiles. */
export const TOP_AD_GROUPS = 3;

export type TikTokKind = {
  kind: ResultField;
  results: number;
  spend: number;
  /** Null when there are no results — never 0. */
  costPerResult: number | null;
};

export type TikTokAdGroupRow = {
  id: string;
  name: string;
  campaignName: string | null;
  spend: number;
  kind: ResultField | null;
  results: number | null;
  costPerResult: number | null;
};

export type TikTokOverview = {
  advertiserId: string;
  advertiserName: string | null;
  /** Null when the advertiser reported no currency: then nothing is priced. */
  currency: string | null;
  window: { since: string; until: string };
  fetchedAt: string;
  campaigns: number;
  adGroups: number;
  spend: number;
  /** Largest spend first. */
  kinds: TikTokKind[];
  /** Spend of campaigns that optimize for no result kind this tab knows. */
  unclassifiedSpend: number;
  topAdGroups: TikTokAdGroupRow[];
};

const cents = (major: number) => Math.round(major * 100);

/** The bucket an entity optimizes for: the one the snapshot reports (even at zero). Purchases
 *  is always present in the window, so it only counts when TikTok counted one. */
function kindOf(window: MultiPlatformWindowMetrics): ResultField | null {
  for (const field of RESULT_FIELDS) {
    const value = window[field];
    if (field === 'purchases' ? (value ?? 0) > 0 : value !== undefined) return field;
  }
  return null;
}

function ratio(spend: number, results: number): number | null {
  return results > 0 && spend > 0 ? spend / results : null;
}

export function buildTikTokOverview(envelope: TikTokSnapshotsEnvelope): TikTokOverview {
  const snapshots = envelope.entities.map((entity) => entity.snapshot);
  const campaigns = snapshots.filter((snapshot) => snapshot.level === 'campaign');
  const groups = snapshots.filter((snapshot) => snapshot.level === 'group');
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name ?? null]));

  let spendCents = 0;
  let unclassifiedCents = 0;
  const byKind = new Map<ResultField, { results: number; cents: number }>();
  for (const campaign of campaigns) {
    const window = campaign.windows.d7;
    spendCents += cents(window.spend);
    const kind = kindOf(window);
    if (!kind) {
      unclassifiedCents += cents(window.spend);
      continue;
    }
    const entry = byKind.get(kind) ?? { results: 0, cents: 0 };
    entry.results += window[kind] ?? 0;
    entry.cents += cents(window.spend);
    byKind.set(kind, entry);
  }

  const kinds = [...byKind.entries()]
    .map(([kind, entry]) => ({
      kind,
      results: entry.results,
      spend: entry.cents / 100,
      costPerResult: ratio(entry.cents / 100, entry.results),
    }))
    .sort((a, b) => b.spend - a.spend);

  const topAdGroups = groups
    .filter((group) => group.windows.d7.spend > 0)
    .sort((a, b) => b.windows.d7.spend - a.windows.d7.spend)
    .slice(0, TOP_AD_GROUPS)
    .map((group): TikTokAdGroupRow => {
      const window = group.windows.d7;
      const kind = kindOf(window);
      const results = kind ? (window[kind] ?? 0) : null;
      return {
        id: group.id,
        name: group.name ?? group.id,
        campaignName: group.campaignId ? (campaignNames.get(group.campaignId) ?? null) : null,
        spend: window.spend,
        kind,
        results,
        costPerResult: results == null ? null : ratio(window.spend, results),
      };
    });

  return {
    advertiserId: envelope.accountId,
    advertiserName: envelope.accountName ?? null,
    currency: envelope.currency ?? null,
    window: envelope.windows.d7,
    fetchedAt: envelope.fetched_at,
    campaigns: campaigns.length,
    adGroups: groups.length,
    spend: spendCents / 100,
    kinds,
    unclassifiedSpend: unclassifiedCents / 100,
    topAdGroups,
  };
}

/** "7214…9903" — enough of the advertiser id to tell two apart, as the prototype prints it. */
export function shortAdvertiserId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}
