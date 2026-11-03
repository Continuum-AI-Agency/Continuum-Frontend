// G05 Mix, the figures: where the Google money goes and what it buys. By campaign type (Search,
// Performance Max, YouTube / Demand Gen) from the Google tab's own read; by campaign when the
// account runs a single type; by course line against the split agreed with the client when the
// Optimizer's P4 finding (course_line_split) holds one. Pure: every share and cost is a division
// of two figures a read carried, and a figure no read carried is null, never zero.

import {
  type GoogleResultBucket,
  type GoogleResultCounts,
  type GoogleTopCampaigns,
  type MixCopyPart,
  type MixCopyResult,
  mixLineSentence,
  mixSplitSentence,
} from '@continuum/contracts';
import { formatCurrency } from '../../../../format';
import {
  CAMPAIGN_TYPE_LABELS,
  type CampaignTypeKey,
  campaignTypeOf,
  type GoogleOverview,
  pricedPerResult,
  RESULT_WORDS,
  resultTypesOf,
} from '../../../platforms/googleAdsOverviewModel';
import { type FindingCard, maxBy, shareLabel } from './mixAuctionSignalModel';

/** The channel a row is coloured by; every type outside the three channels is `other`. */
export type MixChannel = 'search' | 'pmax' | 'video' | 'other';

const CHANNEL_ORDER: readonly MixChannel[] = ['search', 'pmax', 'video', 'other'];

export function channelOf(type: CampaignTypeKey | null): MixChannel {
  return type === 'search' || type === 'pmax' || type === 'video' ? type : 'other';
}

/** What the result is called in the lens's chrome, and which result its takeaway names
 *  (@continuum/contracts words it in the account's language). */
export type ResultWords = { one: string; many: string; copy: MixCopyResult };

const CONVERSIONS: ResultWords = { one: 'conversion', many: 'conversions', copy: 'conversions' };

/** The result's words: the bucket the read counts, or plain "conversions" when it names none. */
export function resultWordsOf(bucket: GoogleResultBucket | null): ResultWords {
  if (!bucket) return CONVERSIONS;
  return { one: RESULT_WORDS[bucket].one, many: RESULT_WORDS[bucket].many, copy: bucket };
}

export type MixRow = {
  key: string;
  label: string;
  channel: MixChannel;
  campaigns: number;
  spend: number;
  /** 0–1 of the spend the rows add up to. */
  spendShare: number;
  /** The row's results; null when the read counts no single result for it. */
  results: number | null;
  /** 0–1 of the results the rows add up to; null when there are none to share. */
  resultShare: number | null;
  /** Null under one whole result: Google splits conversions into fractions. */
  costPerResult: number | null;
};

export type MixSplit = {
  kind: 'type' | 'campaign';
  rows: MixRow[];
  spend: number;
  /** Null when the rows' results are not counted; zero when counted and none came. */
  results: number | null;
  words: ResultWords;
  /** The portfolio's cost-per-result goal for the result counted; null when none applies. */
  goal: number | null;
};

export type MixLine = {
  label: string;
  spend: number;
  /** 0–1 of the spend mapped to a line. */
  share: number;
  /** The share agreed with the client; null when none is stored for the line. */
  target: number | null;
  /** Measured minus agreed, in whole points. */
  deviation: number | null;
  /** The finding's verdict: the line is off the agreed split. */
  flagged: boolean;
};

/** Read on the finding's bars alone (their label is the line's own name, their figures
 *  numbers), so the lens reads the card the same in either language the engine writes. */
export type MixLines = {
  kind: 'line';
  rows: MixLine[];
  windowDays: number;
  currency: string | null;
};

export type MixModel = MixSplit | MixLines | { kind: 'empty'; reason: string };

/** Campaigns past this fold into one "more campaigns" row. */
export const MAX_CAMPAIGN_ROWS = 4;
export const MORE_KEY = 'more';

type Counted = { conversions: number | null; byResult?: GoogleResultCounts | null };
type Counter = { words: ResultWords; count: (row: Counted) => number | null };

/** How a row's result is counted: the single result the read counts, the one result type the
 *  rows counted apart, or nothing — several unlike results are never added together. */
function counterFor(
  resultsDefined: boolean,
  types: readonly GoogleResultBucket[],
  bucket: GoogleResultBucket | null,
): Counter | null {
  if (resultsDefined) return { words: resultWordsOf(bucket), count: (row) => row.conversions };
  const [only] = types;
  if (types.length !== 1 || !only) return null;
  return {
    words: resultWordsOf(only),
    count: (row) => (row.byResult ? (row.byResult[only] ?? 0) : null),
  };
}

type RowFigures = Omit<MixRow, 'spendShare' | 'resultShare' | 'costPerResult'>;

function withShares(
  kind: MixSplit['kind'],
  rows: readonly RowFigures[],
  words: ResultWords,
  goal: number | null,
): MixSplit {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const counted = rows.every((row) => row.results != null);
  const results = counted ? rows.reduce((sum, row) => sum + (row.results ?? 0), 0) : null;
  return {
    kind,
    rows: rows.map((row) => ({
      ...row,
      spendShare: spend > 0 ? row.spend / spend : 0,
      resultShare: results ? (row.results ?? 0) / results : null,
      costPerResult: pricedPerResult(row.spend, row.results),
    })),
    spend,
    results,
    words,
    goal,
  };
}

function isTypeKey(key: string): key is CampaignTypeKey {
  return key in CAMPAIGN_TYPE_LABELS;
}

/**
 * The split by campaign type, from the tab's read: one row per channel in a fixed order (Search,
 * Performance Max, YouTube / Demand Gen), every other type folded into one row that names them.
 * Null when the read has no type for some campaign, or the account runs one type only.
 */
export function mixByType(
  overview: GoogleOverview,
  bucket: GoogleResultBucket | null,
  goal: number | null,
): MixSplit | null {
  if (!overview.byType) return null;
  const counter = counterFor(overview.resultsDefined, overview.resultTypes, bucket);
  const folded = new Map<MixChannel, RowFigures & { labels: string[] }>();
  for (const group of overview.groups) {
    const type = isTypeKey(group.key) ? group.key : null;
    const channel = channelOf(type);
    const results = counter ? counter.count(group) : null;
    const row = folded.get(channel);
    if (row) {
      row.labels.push(group.label);
      row.campaigns += group.campaigns;
      row.spend += group.spend;
      row.results = row.results == null || results == null ? null : row.results + results;
    } else {
      folded.set(channel, {
        key: channel,
        label: group.label,
        labels: [group.label],
        channel,
        campaigns: group.campaigns,
        spend: group.spend,
        results,
      });
    }
  }
  const rows = CHANNEL_ORDER.flatMap((channel) => {
    const row = folded.get(channel);
    if (!row) return [];
    const { labels, ...figures } = row;
    return [{ ...figures, label: labels.join(' · ') }];
  });
  if (rows.length < 2) return null;
  return withShares('type', rows, counter?.words ?? CONVERSIONS, counter ? goal : null);
}

/**
 * The split by campaign, for an account that runs one type: the campaigns that spent, by spend,
 * the tail past MAX_CAMPAIGN_ROWS folded into one row. Null under two spending campaigns.
 */
export function mixByCampaign(
  read: GoogleTopCampaigns,
  bucket: GoogleResultBucket | null,
  goal: number | null,
): MixSplit | null {
  const spending = read.rows
    .filter((row) => row.metrics.spend > 0)
    .sort((a, b) => b.metrics.spend - a.metrics.spend);
  if (spending.length < 2) return null;
  const resultsDefined =
    read.result_basis?.unambiguous !== false &&
    spending.every((row) => row.metrics.conversions != null);
  const counter = counterFor(
    resultsDefined,
    resultsDefined ? [] : resultTypesOf(spending.map((row) => row.metrics)),
    bucket,
  );
  const head: RowFigures[] = spending.slice(0, MAX_CAMPAIGN_ROWS).map((row) => ({
    key: row.id,
    label: row.name,
    channel: channelOf(campaignTypeOf(row.labels?.channel_type)),
    campaigns: 1,
    spend: row.metrics.spend,
    results: counter ? counter.count(row.metrics) : null,
  }));
  const tail = spending.slice(MAX_CAMPAIGN_ROWS);
  if (tail.length > 0) {
    const tailResults = tail.map((row) => (counter ? counter.count(row.metrics) : null));
    head.push({
      key: MORE_KEY,
      label: `${tail.length} more ${tail.length === 1 ? 'campaign' : 'campaigns'}`,
      channel: 'other',
      campaigns: tail.length,
      spend: tail.reduce((sum, row) => sum + row.metrics.spend, 0),
      results: tailResults.every((value) => value != null)
        ? tailResults.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : null,
    });
  }
  return withShares('campaign', head, counter?.words ?? CONVERSIONS, counter ? goal : null);
}

/** The split by course line, from the P4 finding's bars: its measured share and the agreed one. */
export function mixByLine(card: FindingCard): MixLines | null {
  const bars = card.bars ?? [];
  if (bars.length === 0) return null;
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);
  return {
    kind: 'line',
    rows: bars.map((bar) => {
      const share = bar.share ?? (total > 0 ? bar.value / total : 0);
      const target = bar.target_share;
      return {
        label: bar.label,
        spend: bar.value,
        share,
        target,
        deviation: target == null ? null : Math.round((share - target) * 100),
        flagged: bar.flagged,
      };
    }),
    windowDays: card.window_days,
    currency: card.currency,
  };
}

/** Whether the split needs the campaign read: the tab's read has no split by type to give. */
export function needsCampaignRead(overview: GoogleOverview): boolean {
  const campaigns = overview.groups.reduce((sum, group) => sum + group.campaigns, 0);
  return campaigns >= 2 && (!overview.byType || overview.groups.length < 2);
}

export type MixInput = {
  overview: GoogleOverview | null;
  /** The campaign read; null when the split by type stands without it. */
  campaigns: GoogleTopCampaigns | null;
  /** The P4 finding, when the account has agreed lines and the finding fired. */
  lineCard: FindingCard | null;
  bucket: GoogleResultBucket | null;
  goal: number | null;
};

/** The agreed lines first (they are what the client reads the account by), then the split by
 *  type, then by campaign; with fewer than two parts there is no mix to draw. */
export function buildMix({ overview, campaigns, lineCard, bucket, goal }: MixInput): MixModel {
  const lines = lineCard ? mixByLine(lineCard) : null;
  if (lines) return lines;
  if (!overview) return { kind: 'empty', reason: 'The Google Ads read has no campaigns yet.' };
  const split =
    mixByType(overview, bucket, goal) ??
    (campaigns ? mixByCampaign(campaigns, bucket, goal) : null);
  if (split) return split;
  const spending = overview.groups.reduce((sum, group) => sum + group.campaigns, 0);
  return {
    kind: 'empty',
    reason:
      spending === 0
        ? 'No campaign spent in this window.'
        : 'One campaign spent in this window: there is no mix to compare.',
  };
}

/** The row whose share of the results sits furthest from its share of the spend; the largest
 *  spender when the results are not counted. The folded tail never leads. */
export function mixHeadlineRow(split: MixSplit): MixRow | null {
  const rows = split.rows.filter((row) => row.key !== MORE_KEY);
  if (split.results) {
    return maxBy(rows, (row) => Math.abs(row.spendShare - (row.resultShare ?? 0)));
  }
  return maxBy(rows, (row) => row.spend);
}

/** The line furthest from its agreed share, the flagged ones first. */
export function mixHeadlineLine(lines: MixLines): MixLine | null {
  const told = lines.rows.some((row) => row.flagged)
    ? lines.rows.filter((row) => row.flagged)
    : lines.rows;
  return maxBy(told, (row) => Math.abs(row.deviation ?? 0));
}

/** Where a cost per result sits against the portfolio goal, in the board's words. */
export type GoalStanding = { side: 'under' | 'over' | 'on'; label: string };

export function goalStanding(cost: number | null, goal: number | null): GoalStanding | null {
  if (cost == null || goal == null || goal <= 0) return null;
  const pct = Math.round((cost / goal - 1) * 100);
  if (pct === 0) return { side: 'on', label: 'On goal' };
  return pct < 0
    ? { side: 'under', label: `${-pct}% under goal` }
    : { side: 'over', label: `${pct}% over goal` };
}

/** A part of the split as its row prints it, for the takeaway. */
function printed(row: MixRow, counted: boolean, currency: string | null): MixCopyPart {
  return {
    label: row.label,
    spendShare: shareLabel(row.spendShare),
    resultShare: counted && row.resultShare != null ? shareLabel(row.resultShare) : null,
    cost: row.costPerResult == null ? null : formatCurrency(row.costPerResult, currency),
  };
}

function splitTakeaway(split: MixSplit, currency: string | null): string | null {
  const lead = mixHeadlineRow(split);
  if (!lead) return null;
  const others = split.rows.filter((row) => row !== lead && row.key !== MORE_KEY);
  const counted = lead.resultShare != null && split.results != null;
  // With results, the counterpart leans the other way: the part that buys more than it spends,
  // or less. Without them, the next largest spender.
  const leadGap = lead.spendShare - (lead.resultShare ?? 0);
  const counterpart = counted
    ? maxBy(others, (row) => (leadGap > 0 ? 1 : -1) * ((row.resultShare ?? 0) - row.spendShare))
    : maxBy(others, (row) => row.spend);
  return mixSplitSentence(
    printed(lead, counted, currency),
    counterpart ? printed(counterpart, counted, currency) : null,
    split.words.copy,
  );
}

function lineTakeaway(lines: MixLines): string | null {
  const flagged = lines.rows.filter((row) => row.flagged);
  const told = (flagged.length > 0 ? flagged : lines.rows).flatMap((row) =>
    row.target == null
      ? []
      : [{ label: row.label, share: shareLabel(row.share), agreed: shareLabel(row.target) }],
  );
  return mixLineSentence(told);
}

/** The sentence a larger lens closes with, in the account's language, built from its figures. */
export function mixTakeaway(model: MixModel, currency: string | null): string | null {
  if (model.kind === 'empty') return null;
  if (model.kind === 'line') return lineTakeaway(model);
  return splitTakeaway(model, currency);
}
