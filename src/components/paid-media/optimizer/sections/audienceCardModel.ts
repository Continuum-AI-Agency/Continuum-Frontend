// Pure reads for the audience recommendation card. No React, no fetch: what to show for a
// proposal row, how the buckets group, what the executed result lists as implemented.

import type {
  AudienceExpansionOption,
  AudienceProposalPlan,
  AudienceProposalResult,
  AudienceProposalRow,
  AudienceSizeEstimate,
  MetaTargetingSpec,
  RecommendationRow,
} from '@continuum/contracts';
import {
  audienceProposalCardState,
  proposalForRecommendation,
  readProposalBlock,
  readProposalPlan,
  readProposalResult,
  summarizeTargetingSpec,
  targetingSummaryLine,
} from '@continuum/contracts';

export const AUDIENCE_TRIGGERS = new Set(['F2_audience_saturation', 'F3_audience_exhausted']);

export function isAudienceRecommendation(
  rec: Pick<RecommendationRow, 'kind' | 'trigger'>,
): boolean {
  return rec.kind === 'audience_expand' && AUDIENCE_TRIGGERS.has(rec.trigger);
}

export type AudienceCardView = {
  row: AudienceProposalRow | null;
  state: ReturnType<typeof audienceProposalCardState>;
  plan: AudienceProposalPlan | null;
  block: ReturnType<typeof readProposalBlock>;
  result: AudienceProposalResult | null;
  errorMessage: string | null;
};

export function audienceCardView(
  rows: readonly AudienceProposalRow[],
  rec: Pick<RecommendationRow, 'id' | 'adset_id' | 'trigger'>,
): AudienceCardView {
  const row = proposalForRecommendation(rows, rec);
  const error = row?.error ?? null;
  const message = error && typeof error.message === 'string' ? error.message : null;
  return {
    row,
    state: audienceProposalCardState(row),
    plan: row ? readProposalPlan(row) : null,
    block: row ? readProposalBlock(row) : null,
    result: row ? readProposalResult(row) : null,
    errorMessage: message,
  };
}

export { summarizeTargetingSpec, targetingSummaryLine };

export const BUCKET_LABEL: Record<AudienceExpansionOption['bucket'], string> = {
  currently_live: 'Targets today',
  existing_inventory: 'Already in the account',
  net_new_verified: 'New, verified in the catalogue',
};

export function optionsByBucket(plan: AudienceProposalPlan): Array<{
  bucket: AudienceExpansionOption['bucket'];
  label: string;
  options: Array<AudienceExpansionOption & { chosen: boolean }>;
}> {
  const chosen = new Set(plan.chosen_option_ids);
  return (['net_new_verified', 'existing_inventory', 'currently_live'] as const)
    .map((bucket) => ({
      bucket,
      label: BUCKET_LABEL[bucket],
      options: plan.options
        .filter((o) => o.bucket === bucket)
        .map((o) => ({ ...o, chosen: o.id != null && chosen.has(o.id) })),
    }))
    .filter((group) => group.options.length > 0);
}

const compact = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}K`
      : String(Math.round(n));

export function estimateLabel(estimate: AudienceSizeEstimate | null | undefined): string | null {
  if (!estimate) return null;
  if (estimate.lower === estimate.upper) return compact(estimate.lower);
  return `${compact(estimate.lower)}–${compact(estimate.upper)}`;
}

/** "120K → 1.4M (+11×)" or null when either side is missing. */
export function reachDeltaLabel(plan: AudienceProposalPlan): string | null {
  const current = plan.reach.current;
  const proposed = plan.reach.proposed;
  if (!current || !proposed) return null;
  const from = (current.lower + current.upper) / 2;
  const to = (proposed.lower + proposed.upper) / 2;
  if (from <= 0) return `${estimateLabel(current)} → ${estimateLabel(proposed)}`;
  const ratio = to / from;
  const delta =
    ratio >= 2
      ? `×${ratio.toFixed(1)}`
      : `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`;
  return `${estimateLabel(current)} → ${estimateLabel(proposed)} (${delta})`;
}

export function majorUnits(minor: number): number {
  return Math.round(minor) / 100;
}
export function minorUnits(major: number): number {
  return Math.round(major * 100);
}

export type ImplementedRow = { label: string; value: string };

/** "What was implemented" — from the read-back, never from the intent. */
export function implementedRows(
  result: AudienceProposalResult,
  plan: AudienceProposalPlan | null,
): ImplementedRow[] {
  const rows: ImplementedRow[] = [];
  if (result.campaign)
    rows.push({
      label: 'Campaign',
      value: `${result.campaign.name ?? ''} (${result.campaign.id})`.trim(),
    });
  if (result.adset) {
    const a = result.adset;
    rows.push({ label: 'Ad set', value: `${a.name ?? ''} (${a.id})`.trim() });
    rows.push({ label: 'Status', value: a.effective_status ?? a.status ?? '—' });
    if (a.daily_budget)
      rows.push({
        label: 'Daily budget',
        value: `${majorUnits(Number(a.daily_budget))} (minor ${a.daily_budget})`,
      });
    if (a.optimization_goal) rows.push({ label: 'Optimisation goal', value: a.optimization_goal });
    if (a.billing_event) rows.push({ label: 'Billing event', value: a.billing_event });
    if (a.bid_strategy) rows.push({ label: 'Bid strategy', value: a.bid_strategy });
    if (a.targeting) {
      rows.push({
        label: 'Targeting',
        value: targetingSummaryLine(a.targeting as MetaTargetingSpec),
      });
      const s = summarizeTargetingSpec(a.targeting as MetaTargetingSpec);
      if (s.interests.length) rows.push({ label: 'Interests', value: s.interests.join(', ') });
      if (s.behaviors.length) rows.push({ label: 'Behaviours', value: s.behaviors.join(', ') });
      if (s.customAudienceCount)
        rows.push({ label: 'Custom audiences', value: String(s.customAudienceCount) });
      rows.push({
        label: 'Advantage+ audience',
        value: s.advantageAudience == null ? 'not set' : s.advantageAudience ? 'on' : 'off',
      });
    }
    if (a.promoted_object)
      rows.push({ label: 'Promoted object', value: JSON.stringify(a.promoted_object) });
  }
  for (const ad of result.ads) {
    const source = ad.source_adset_name ?? ad.source_adset_id;
    rows.push({
      label: 'Ad',
      value: `${ad.name ?? ad.id} (${ad.id}) · ${ad.effective_status ?? ad.status ?? '—'} · creative ${ad.creative_id ?? '?'}${source ? ` · from ${source}` : ''}`,
    });
  }
  if (result.source_adset) {
    rows.push({
      label: 'Source ad set',
      value: `${result.source_adset.name ?? result.source_adset.id} · ${result.source_adset.paused ? `paused (was ${result.source_adset.prior_status ?? '?'})` : `left ${result.source_adset.status_after ?? result.source_adset.prior_status ?? 'as is'}`}${result.source_adset.note ? ` · ${result.source_adset.note}` : ''}`,
    });
  }
  if (result.activation) {
    rows.push({
      label: 'Activation',
      value: result.activation.requested
        ? `requested · ad set ${result.activation.adset_status_after ?? '?'} · ads ${result.activation.ads_status_after.join(', ') || '—'}`
        : 'not requested (created paused)',
    });
  }
  if (plan)
    rows.push({
      label: 'Mode',
      value: plan.mode === 'replace' ? 'Replace the current audience' : 'Add a new audience',
    });
  return rows;
}
