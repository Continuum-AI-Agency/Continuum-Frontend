// The Branches view's figures (Meta twin of the campaign mix): each branch's share of the spend
// against its share of the results, and its cost per result against the goal. A branch sums
// every campaign that names it (Easy Fit's CAÑADAS is its MENSAJES and its FORMULARIO
// campaigns). When the names do not show one campaign per branch, the same rows are the
// campaigns themselves. Headroom reads the same rows for its CPM scatter, so the two views
// cannot disagree about a branch.

import {
  metaBranchesNoResultSentence,
  metaBranchesSingleSentence,
  metaBranchesSpreadSentence,
  type PortfolioListItem,
} from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { groupByBranch } from './branchName';
import {
  type AccountResult,
  accountResult,
  type CostReference,
  type CostTone,
  costPer,
  costReference,
  costTone,
  cpmOf,
  formatMoneyRange,
  formatShare,
  type MetaRankRow,
  type MetaResultKind,
  totalsOf,
} from './metaLensModel';

/** Below this many results a row's cost is shown but never called the best or the worst. */
export const MIN_CALLABLE_RESULTS = 5;

export type MixRow = {
  key: string;
  /** The branch, or the campaign name, as stored. */
  label: string;
  campaignIds: string[];
  spend: number;
  impressions: number;
  results: number | null;
  value: number | null;
  spendShare: number;
  resultShare: number | null;
  costPerResult: number | null;
  cpm: number | null;
  tone: CostTone;
  /** Folds the campaigns that name no branch, or the tail past the rows a view shows. */
  folded: boolean;
};

export type MixModel = {
  by: 'branch' | 'campaign';
  /** Cost per result ascending; rows with no result after them, by spend. */
  rows: MixRow[];
  totals: {
    spend: number;
    impressions: number;
    results: number | null;
    costPerResult: number | null;
    cpm: number | null;
  };
  result: AccountResult | null;
  reference: CostReference | null;
  /** The cheapest and the dearest row with enough results to be called either. */
  best: MixRow | null;
  worst: MixRow | null;
  /** The sentence built from the figures, in the account's language. */
  takeaway: string;
  campaignCount: number;
};

type Bucket = { key: string; label: string; folded: boolean; campaigns: MetaRankRow[] };

function rowOf(
  bucket: Bucket,
  kind: MetaResultKind | null,
  totalSpend: number,
  totalResults: number | null,
): MixRow {
  const sums = totalsOf(bucket.campaigns, kind);
  return {
    key: bucket.key,
    label: bucket.label,
    campaignIds: bucket.campaigns.map((campaign) => campaign.id),
    spend: sums.spend,
    impressions: sums.impressions,
    results: sums.results,
    value: sums.value,
    spendShare: totalSpend > 0 ? sums.spend / totalSpend : 0,
    resultShare:
      sums.results != null && totalResults != null && totalResults > 0
        ? sums.results / totalResults
        : null,
    costPerResult: costPer(sums.spend, sums.results),
    cpm: cpmOf(sums.spend, sums.impressions),
    tone: 'mid',
    folded: bucket.folded,
  };
}

function byCost(a: MixRow, b: MixRow): number {
  if (a.costPerResult != null && b.costPerResult != null) return a.costPerResult - b.costPerResult;
  if (a.costPerResult != null) return -1;
  if (b.costPerResult != null) return 1;
  return b.spend - a.spend;
}

function bucketsOf(campaigns: readonly MetaRankRow[]): { by: MixModel['by']; buckets: Bucket[] } {
  const grouping = groupByBranch(campaigns);
  if (grouping.by === 'campaign') {
    return {
      by: 'campaign',
      buckets: campaigns.map((campaign) => ({
        key: campaign.id,
        label: campaign.name,
        folded: false,
        campaigns: [campaign],
      })),
    };
  }
  const buckets: Bucket[] = grouping.groups.map((group) => ({
    key: group.key,
    label: group.label,
    folded: false,
    campaigns: group.members,
  }));
  if (grouping.ungrouped.length > 0) {
    buckets.push({
      key: 'other',
      label: `${grouping.ungrouped.length} other ${grouping.ungrouped.length === 1 ? 'campaign' : 'campaigns'}`,
      folded: true,
      campaigns: grouping.ungrouped,
    });
  }
  return { by: 'branch', buckets };
}

function callable(rows: readonly MixRow[]): MixRow[] {
  const named = rows.filter((row) => !row.folded && row.costPerResult != null);
  // Only the folded rows priced anything: they are all there is to call.
  const priced = named.length > 0 ? named : rows.filter((row) => row.costPerResult != null);
  const enough = priced.filter((row) => (row.results ?? 0) >= MIN_CALLABLE_RESULTS);
  return enough.length > 0 ? enough : priced;
}

/** The figures the takeaway quotes, printed as the rows print them; the sentence is in
 *  contracts (metaViewsCopy), in the account's language. */
function takeawayOf(model: Omit<MixModel, 'takeaway'>, currency: string | null): string {
  const { best, worst, result, reference, rows } = model;
  const printed = (row: MixRow) => ({
    label: row.label,
    cost: formatCurrency(row.costPerResult, currency),
  });
  if (!result || best?.costPerResult == null) {
    const top = [...rows].sort((a, b) => b.spend - a.spend)[0];
    return metaBranchesNoResultSentence(
      top ? { label: top.label, spendShare: formatShare(top.spendShare) } : null,
    );
  }
  const quoted = reference
    ? { kind: reference.kind, money: formatCurrency(reference.value, currency) }
    : null;
  if (worst && worst.key !== best.key && worst.costPerResult != null) {
    return metaBranchesSpreadSentence(result.kind, printed(best), printed(worst), quoted);
  }
  return metaBranchesSingleSentence(
    result.kind,
    { ...printed(best), resultShare: formatShare(best.resultShare) },
    quoted,
  );
}

/** The rows of the Branches and Headroom views. Null when no campaign spent. */
export function buildMix(
  campaigns: readonly MetaRankRow[],
  portfolios: readonly PortfolioListItem[],
  currency: string | null,
): MixModel | null {
  const spending = campaigns.filter((campaign) => campaign.spend > 0);
  if (spending.length === 0) return null;
  const result = accountResult(spending, portfolios);
  const kind = result?.kind ?? null;
  const sums = totalsOf(spending, kind);
  const { by, buckets } = bucketsOf(spending);
  const averageCost = costPer(sums.spend, sums.results);
  const reference = costReference(result, averageCost);
  const rows = buckets
    .map((bucket) => rowOf(bucket, kind, sums.spend, sums.results))
    .map((row) => ({ ...row, tone: costTone(row.costPerResult, reference?.value ?? null) }))
    .sort(byCost);
  const ranked = callable(rows);
  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? (ranked[ranked.length - 1] ?? null) : null;
  const model: Omit<MixModel, 'takeaway'> = {
    by,
    rows,
    totals: {
      spend: sums.spend,
      impressions: sums.impressions,
      results: sums.results,
      costPerResult: averageCost,
      cpm: cpmOf(sums.spend, sums.impressions),
    },
    result,
    reference,
    best,
    worst,
    campaignCount: spending.length,
  };
  return { ...model, takeaway: takeawayOf(model, currency) };
}

/** The first `max` rows and, past them, one row that folds the rest. */
export function foldTail(model: MixModel, max: number): MixRow[] {
  if (model.rows.length <= max) return model.rows;
  const shown = model.rows.slice(0, Math.max(1, max - 1));
  const rest = model.rows.slice(shown.length);
  const spend = rest.reduce((sum, row) => sum + row.spend, 0);
  const impressions = rest.reduce((sum, row) => sum + row.impressions, 0);
  const counted = rest.filter((row) => row.results != null);
  const results =
    counted.length > 0 ? counted.reduce((sum, row) => sum + (row.results ?? 0), 0) : null;
  const totalResults = model.totals.results;
  const noun = model.by === 'branch' ? 'branches' : 'campaigns';
  const costPerResult = costPer(spend, results);
  return [
    ...shown,
    {
      key: 'tail',
      label: `${rest.length} more ${noun}`,
      campaignIds: rest.flatMap((row) => row.campaignIds),
      spend,
      impressions,
      results,
      value: null,
      spendShare: model.totals.spend > 0 ? spend / model.totals.spend : 0,
      resultShare:
        results != null && totalResults != null && totalResults > 0 ? results / totalResults : null,
      costPerResult,
      cpm: cpmOf(spend, impressions),
      tone: costTone(costPerResult, model.reference?.value ?? null),
      folded: true,
    },
  ];
}

/** The figure a small Branches view leads with: the cheapest to the dearest cost per result. */
export function mixHeadline(
  model: MixModel,
  currency: string | null,
): { figure: string; caption: string } {
  const noun = model.by === 'branch' ? 'branch' : 'campaign';
  if (model.result && model.best?.costPerResult != null) {
    const worst = model.worst?.costPerResult;
    return {
      figure:
        worst != null
          ? formatMoneyRange(model.best.costPerResult, worst, currency)
          : formatCurrency(model.best.costPerResult, currency),
      caption: `Cost per ${model.result.en.one} by ${noun}`,
    };
  }
  return {
    figure: formatCurrency(model.totals.spend, currency),
    caption: `Spend in ${model.campaignCount} ${model.campaignCount === 1 ? 'campaign' : 'campaigns'}`,
  };
}
