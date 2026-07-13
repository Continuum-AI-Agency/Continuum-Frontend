// The Creative DNA read, as the Library consumes it: one fetch, plus the number
// vocabulary the panel renders with.
//
// One rule governs every formatter here. A null metric was NEVER MEASURED and
// must render as an em dash — never as a zero. `roas: null` means "revenue was
// not captured for this window"; `roas: 0` means "this ad earned nothing".
// Collapsing the first into the second turns "we don't know" into "it failed",
// which is the single most expensive lie this panel could tell.
//
// Rates (ctr, hookRate, holdRate, engagementRate) arrive as RATIOS in [0,1] —
// adSync writes clicks/impressions, the rollup RPC recomputes the same way — so
// they are multiplied here, exactly once, on the way to the screen.

import {
  type AssetPerformance,
  type AssetUsage,
  type AssetVersionRollup,
  assetPerformanceSchema,
  assetUsageSchema,
  type DeploymentLinkMethod,
  type DeploymentTrustFlag,
  type PaidMetricWindow,
} from '@continuum/contracts';
import { z } from 'zod';

/** What an unmeasured metric looks like. Never "0", never "0.0×". */
export const NOT_MEASURED = '—';

export const PERFORMANCE_WINDOWS: readonly PaidMetricWindow[] = ['d7', 'd14', 'd30'];

export const WINDOW_LABEL: Record<PaidMetricWindow, string> = {
  d7: '7d',
  d14: '14d',
  d30: '30d',
};

export const TRUST_FLAG_LABEL: Record<DeploymentTrustFlag, string> = {
  low_evidence: 'low evidence',
  inferred_link: 'inferred link',
  unknown_version: 'unknown version',
};

// Said in full, next to the numbers. A viewer who does not know what
// "inferred link" means will read the figures as fact.
export const TRUST_FLAG_TITLE: Record<DeploymentTrustFlag, string> = {
  low_evidence:
    'Below the evidence floors ($50 spend and 3,000 impressions) — too little data to judge.',
  inferred_link:
    'This link was matched by visual similarity, not observed. These figures may belong to a different creative.',
  unknown_version: 'We could not tell which version of this creative ran.',
};

export const LINK_METHOD_LABEL: Record<DeploymentLinkMethod, string> = {
  declared: 'linked at publish',
  import: 'imported from this ad',
  storage_path: 'matched by storage path',
  byte_hash: 'matched by file hash',
  visual_embedding: 'matched by similarity',
};

export const assetPerformanceResponseSchema = z.object({
  performance: assetPerformanceSchema,
  usage: assetUsageSchema,
});
export type AssetPerformanceResponse = z.infer<typeof assetPerformanceResponseSchema>;
export type { AssetPerformance, AssetUsage };

type Metric = number | null | undefined;

/** A measurement exists. Anything else — null, undefined, NaN — does not. */
export function isMeasured(value: Metric): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatCount(value: Metric): string {
  return isMeasured(value) ? Math.round(value).toLocaleString('en-US') : NOT_MEASURED;
}

export function formatMoney(value: Metric): string {
  if (!isMeasured(value)) return NOT_MEASURED;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Ratio in [0,1] → percent. 0 is a real rate and renders as "0.00%". */
export function formatRate(value: Metric): string {
  return isMeasured(value) ? `${(value * 100).toFixed(2)}%` : NOT_MEASURED;
}

/** ROAS. A multiple, not a currency: 2.41×. */
export function formatMultiple(value: Metric): string {
  return isMeasured(value) ? `${value.toFixed(2)}×` : NOT_MEASURED;
}

export function versionLabel(versionNumber: number | null | undefined): string {
  return typeof versionNumber === 'number' ? `Version ${versionNumber}` : 'Unknown version';
}

// "Which version is winning" — answered only when the answer is honest. A single
// scored version has nothing to beat, an unmeasurable ROAS cannot lead, and a tie
// has no winner. In all three cases nobody is crowned; the rollups still render
// side by side and the viewer draws their own conclusion.
export function leadingRollup(rollups: readonly AssetVersionRollup[]): AssetVersionRollup | null {
  const scored = rollups.filter((rollup) => isMeasured(rollup.roas));
  if (scored.length < 2) return null;

  const [best, runnerUp] = [...scored].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  if (!best || !runnerUp) return null;
  return best.roas === runnerUp.roas ? null : best;
}

export async function fetchAssetPerformance(input: {
  brandId: string;
  assetId: string;
  window: PaidMetricWindow;
}): Promise<AssetPerformanceResponse> {
  const params = new URLSearchParams({
    brandId: input.brandId,
    assetId: input.assetId,
    window: input.window,
  });
  const response = await fetch(`/api/library/performance?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Performance request failed (${response.status})`);
  }
  return assetPerformanceResponseSchema.parse(await response.json());
}
