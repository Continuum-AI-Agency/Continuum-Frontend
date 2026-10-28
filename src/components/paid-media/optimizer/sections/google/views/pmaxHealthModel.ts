// Performance Max health (P6 view 6): each asset group's Ad Strength and status with its assets
// counted by Google's status, Poor groups said first as a finding of their own (presentation
// standard §10), and each PMax campaign's spend by network from breakdown(network). Search
// categories and audience signals are not read by any scope, and the view says so.

import type { GoogleBreakdownRead, GoogleSignalsRead } from '@continuum/contracts';
import { formatCurrency, humanize } from '../../../format';
import { type Cell, CONVERSIONS_NOT_COUNTED, missing, resultsText, shown } from './cell';

type GoogleBlocks = NonNullable<NonNullable<GoogleSignalsRead['signals']>['google']>;
type AssetGroupSignal = NonNullable<GoogleBlocks['asset_groups']>[number];
type PmaxAssetSignal = NonNullable<GoogleBlocks['pmax_assets']>[number];

export type AssetGroupRow = {
  id: string;
  name: string;
  campaignId: string;
  strength: Cell;
  poor: boolean;
  status: Cell;
  /** "18 eligible · 2 limited". */
  assets: Cell;
  /** Google's own action items, as it words them. */
  missingItems: string[];
};

export type PmaxHealthModel =
  | { kind: 'unread'; reason: string }
  | {
      kind: 'read';
      /** Poor first, then by name. */
      groups: AssetGroupRow[];
      poor: AssetGroupRow[];
      /** Every PMax campaign holding a group, in the order first seen. */
      campaignIds: string[];
    };

const STRENGTH_WORDS: Readonly<Record<string, string>> = {
  POOR: 'Poor',
  AVERAGE: 'Average',
  GOOD: 'Good',
  EXCELLENT: 'Excellent',
  PENDING: 'Pending',
};

const ASSET_STATUS_ORDER = ['ELIGIBLE', 'LIMITED', 'PENDING', 'NOT_ELIGIBLE'];

function assetsCell(groupId: string, assets: readonly PmaxAssetSignal[] | null): Cell {
  if (assets === null) return missing("Google's asset read failed for this account");
  const counts = new Map<string, number>();
  for (const asset of assets) {
    if (asset.asset_group_id !== groupId) continue;
    const status = asset.primary_status ?? 'UNKNOWN';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  if (counts.size === 0) return shown('0 assets');
  const order = (status: string) => {
    const at = ASSET_STATUS_ORDER.indexOf(status);
    return at === -1 ? ASSET_STATUS_ORDER.length : at;
  };
  return shown(
    [...counts.entries()]
      .sort(([a], [b]) => order(a) - order(b))
      .map(([status, count]) => `${count} ${humanize(status).toLowerCase()}`)
      .join(' · '),
  );
}

function groupRow(
  group: AssetGroupSignal,
  assets: readonly PmaxAssetSignal[] | null,
): AssetGroupRow {
  const strength = group.ad_strength ? STRENGTH_WORDS[group.ad_strength] : undefined;
  return {
    id: group.asset_group_id,
    name: group.name,
    campaignId: group.campaign_id,
    strength: strength ? shown(strength) : missing('Google has not rated this asset group'),
    poor: group.ad_strength === 'POOR',
    status: group.primary_status
      ? shown(humanize(group.primary_status.toLowerCase()))
      : missing('Google reported no status'),
    assets: assetsCell(group.asset_group_id, assets),
    missingItems: group.missing,
  };
}

export function buildPmaxHealth(read: GoogleSignalsRead): PmaxHealthModel {
  if (!read.signals) {
    return {
      kind: 'unread',
      reason: `The Google read came back incomplete${read.rejected.length ? `: ${read.rejected.join('; ')}` : ''}`,
    };
  }
  const google = read.signals.google;
  if (!google?.asset_groups) {
    return {
      kind: 'unread',
      reason: read.skipped.read_failed_asset_groups
        ? "Google's asset-group read failed"
        : 'Asset groups were not read for this account',
    };
  }
  const assets = google.pmax_assets ?? null;
  const groups = google.asset_groups
    .map((group) => groupRow(group, assets))
    .sort((a, b) => Number(b.poor) - Number(a.poor) || a.name.localeCompare(b.name));
  return {
    kind: 'read',
    groups,
    poor: groups.filter((group) => group.poor),
    campaignIds: [...new Set(google.asset_groups.map((group) => group.campaign_id))],
  };
}

const NETWORK_WORDS: Readonly<Record<string, string>> = {
  SEARCH: 'Search',
  SEARCH_PARTNERS: 'Search partners',
  CONTENT: 'Display',
  YOUTUBE: 'YouTube',
  YOUTUBE_SEARCH: 'YouTube',
  YOUTUBE_WATCH: 'YouTube',
  MIXED: 'Cross-network',
  GOOGLE_TV: 'Google TV',
};

export type NetworkSlice = {
  network: string;
  spend: number;
  /** Of the campaign's spend, 0–1; null when it spent nothing. */
  share: number | null;
  conversions: Cell;
  costPerConversion: Cell;
};

/** One campaign's spend by network, most first. YouTube's search and watch rows are one. */
export function networkSplit(read: GoogleBreakdownRead, currency: string | null): NetworkSlice[] {
  const byNetwork = new Map<string, { spend: number; conversions: number | null }>();
  for (const row of read.rows) {
    if (row.dimension !== 'network') continue;
    const network = NETWORK_WORDS[row.name] ?? humanize(row.name.toLowerCase());
    const previous = byNetwork.get(network) ?? { spend: 0, conversions: 0 };
    byNetwork.set(network, {
      spend: previous.spend + row.metrics.spend,
      conversions:
        previous.conversions === null || row.metrics.conversions === null
          ? null
          : previous.conversions + row.metrics.conversions,
    });
  }
  const total = [...byNetwork.values()].reduce((sum, slice) => sum + slice.spend, 0);
  return [...byNetwork.entries()]
    .map(
      ([network, slice]): NetworkSlice => ({
        network,
        spend: slice.spend,
        share: total > 0 ? slice.spend / total : null,
        conversions:
          slice.conversions === null
            ? missing(CONVERSIONS_NOT_COUNTED)
            : shown(resultsText(slice.conversions)),
        costPerConversion:
          slice.conversions === null
            ? missing(CONVERSIONS_NOT_COUNTED)
            : slice.conversions > 0
              ? shown(formatCurrency(slice.spend / slice.conversions, currency))
              : missing('No conversions on this network in the window'),
      }),
    )
    .sort((a, b) => b.spend - a.spend);
}

/** Said in the view, always: what no scope reads, so its absence is not read as "fine". */
export const PMAX_NOT_READ =
  "Search categories and audience signals aren't read here: no Google read this page makes returns them. Check them in Google Ads.";
