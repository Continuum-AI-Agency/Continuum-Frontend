// The evidence a decision card draws: a few bars of the entities its own figures compare. The
// two costs of a move, the ad that wins against the one it beats, the lines a P8 finding drew.
// Every bar comes from the candidate's chart or its platform card. A card whose figures compare
// nothing draws nothing, because a bar nobody computed is a figure nobody computed.
//
// A bar's tone is the board's cost-against-goal scale (palette.ts): `below` is the good side,
// `above` the side that costs too much or is the problem, `mid` a figure with nothing to be
// judged against. The component paints the tone; text never takes it.

import type { AccountCandidate, AccountChart, PlatformCard } from '@continuum/contracts';
import { formatCurrency } from '../../../../format';
import {
  accountBarGeometry,
  accountBarValueLabel,
  bidTargetLabel,
  countLabel,
  percentLabel,
} from '../../../platformCards/platformCardModel';

export type BarTone = 'below' | 'mid' | 'above';

export type EvidenceBar = {
  label: string;
  /** The bar's own figure, formatted in its unit. */
  value: string;
  /** 0..1 of the track the bar fills. */
  fill: number;
  tone: BarTone;
  /** 0..1 of the track where a goal, a target or a threshold sits; null without one. */
  tick: number | null;
};

/** More rows than this stop being a glance; the card's figure line names the rest. */
export const MAX_BARS = 5;

/** A cost within this share of its goal reads as at the goal: the board's own tolerance
 *  (marksModel's AT_GOAL_TOLERANCE), so a bar and a bullet never disagree about one cost. */
const AT_GOAL_BAND = 0.02;

type Row = { label: string; amount: number; value: string; tone: BarTone };

type AccountFindingCard = Extract<PlatformCard, { variant: 'google_account_finding' }>;
type HeadroomChart = Extract<AccountChart, { shape: 'headroom' }>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** A cost against its goal: under it is good, over it is bad, within 2% is at the goal. With
 *  `higherIsBetter` (a ROAS) the sides swap. No goal, nothing to judge it by. */
export function costTone(cost: number, goal: number | null, higherIsBetter = false): BarTone {
  if (goal == null || !(goal > 0) || !(cost > 0)) return 'mid';
  const ratio = higherIsBetter ? goal / cost : cost / goal;
  if (ratio <= 1 - AT_GOAL_BAND) return 'below';
  if (ratio >= 1 + AT_GOAL_BAND) return 'above';
  return 'mid';
}

/** Bars on one scale: each one against the largest of them, and of the tick when there is one. */
function onOneScale(rows: readonly Row[], tickAt: number | null = null): EvidenceBar[] {
  const kept = rows.slice(0, MAX_BARS);
  const extent = Math.max(0, tickAt ?? 0, ...kept.map((row) => row.amount));
  const fraction = (amount: number) => (extent > 0 ? clamp01(amount / extent) : 0);
  return kept.map((row) => ({
    label: row.label,
    value: row.value,
    fill: fraction(row.amount),
    tone: row.tone,
    tick: tickAt == null ? null : fraction(tickAt),
  }));
}

/** One bar that is a share of a whole: the track is the whole, so the length is the share. */
function shareBar(label: string, share: number, tone: BarTone): EvidenceBar {
  return { label, value: percentLabel(share), fill: clamp01(share), tone, tick: null };
}

function chartValue(unit: string, currency: string | null): (value: number) => string {
  if (unit === 'currency') return (value) => formatCurrency(value, currency);
  if (unit === 'ratio') return (value) => String(Math.round(value * 100) / 100);
  return countLabel;
}

/** A gauge against its ceiling. Frequency is good while low, so reaching the ceiling is bad; a
 *  gauge that is good while high is bad when it falls short of it. */
function headroomTone(gauge: HeadroomChart['gauges'][number]): BarTone {
  if (!(gauge.ceiling > 0)) return 'mid';
  const reach = gauge.value / gauge.ceiling;
  if (gauge.good_when_low) return reach >= 1 ? 'above' : reach >= 0.8 ? 'mid' : 'below';
  return reach >= 1 ? 'below' : reach >= 0.8 ? 'mid' : 'above';
}

/** The shapes that compare entities draw them as bars. A trend, an interval and a quadrant are
 *  not entities side by side, so they draw none here. */
function chartBars(chart: AccountChart, currency: string | null): EvidenceBar[] {
  switch (chart.shape) {
    case 'transfer': {
      const value = chartValue(chart.unit, currency);
      return onOneScale([
        {
          label: chart.from.label,
          amount: chart.from.cost_per_result,
          value: value(chart.from.cost_per_result),
          tone: 'above',
        },
        {
          label: chart.to.label,
          amount: chart.to.cost_per_result,
          value: value(chart.to.cost_per_result),
          tone: 'below',
        },
      ]);
    }
    case 'threshold': {
      const value = chartValue(chart.unit, currency);
      const short = (amount: number): BarTone => (amount < chart.threshold ? 'above' : 'below');
      const rows: Row[] = chart.bars.map((bar) => ({
        label: bar.label,
        amount: bar.value,
        value: value(bar.value),
        tone: short(bar.value),
      }));
      if (chart.combined) {
        rows.push({
          label: chart.combined.label,
          amount: chart.combined.value,
          value: value(chart.combined.value),
          tone: short(chart.combined.value),
        });
      }
      return onOneScale(rows, chart.threshold);
    }
    case 'share':
      return chart.slices
        .slice(0, MAX_BARS)
        .map((slice) =>
          shareBar(slice.label, slice.share, slice.label === chart.focus_label ? 'above' : 'mid'),
        );
    case 'headroom': {
      const value = chartValue(chart.unit, currency);
      return chart.gauges.slice(0, MAX_BARS).map((gauge) => {
        const extent = Math.max(gauge.value, gauge.ceiling);
        return {
          label: gauge.label,
          value: value(gauge.value),
          fill: extent > 0 ? clamp01(gauge.value / extent) : 0,
          tone: headroomTone(gauge),
          tick: extent > 0 ? clamp01(gauge.ceiling / extent) : null,
        };
      });
    }
    case 'rates':
    case 'interval':
    case 'quadrant':
      return [];
  }
}

/** The producer's own bars, on the geometry the Overview's finding card draws them with. */
function findingBars(card: AccountFindingCard): EvidenceBar[] {
  const bars = card.bars ?? [];
  const geometry = accountBarGeometry(bars);
  return bars.slice(0, MAX_BARS).map((bar, index) => ({
    label: bar.label,
    value: accountBarValueLabel(bar.value, card.unit, card.currency),
    fill: geometry[index]?.width ?? 0,
    tone: bar.flagged ? 'above' : 'mid',
    tick: geometry[index]?.target ?? null,
  }));
}

function qualityTone(score: number): BarTone {
  if (score <= 3) return 'above';
  if (score <= 6) return 'mid';
  return 'below';
}

function platformCardBars(card: PlatformCard): EvidenceBar[] {
  switch (card.variant) {
    case 'google_account_finding':
      return findingBars(card);
    case 'google_budget_limited': {
      if (card.proposed_budget_per_day == null) {
        return [shareBar('Impressions lost to budget', card.budget_lost_impression_share, 'above')];
      }
      const perDay = (value: number) => `${formatCurrency(value, card.currency)}/day`;
      return onOneScale([
        {
          label: 'Budget now',
          amount: card.budget_per_day,
          value: perDay(card.budget_per_day),
          tone: 'mid',
        },
        {
          label: 'Proposed',
          amount: card.proposed_budget_per_day,
          value: perDay(card.proposed_budget_per_day),
          tone: 'below',
        },
      ]);
    }
    case 'google_bid_target': {
      const label = (value: number) => bidTargetLabel(value, card.strategy, card.currency);
      const rows: Row[] = [
        {
          label: 'Current target',
          amount: card.current_target,
          value: label(card.current_target),
          tone: 'mid',
        },
      ];
      if (card.actual != null) {
        rows.push({
          label: `Actual, ${card.window_days} days`,
          amount: card.actual,
          value: label(card.actual),
          tone: costTone(card.actual, card.current_target, card.strategy === 'target_roas'),
        });
      }
      rows.push({
        label: 'Proposed',
        amount: card.proposed_target,
        value: label(card.proposed_target),
        tone: 'mid',
      });
      return onOneScale(rows);
    }
    case 'meta_cost_cap': {
      const money = (value: number) => formatCurrency(value, card.currency);
      return onOneScale([
        {
          label: 'Cost cap now',
          amount: card.current_cap,
          value: money(card.current_cap),
          tone: costTone(card.current_cap, card.portfolio_goal),
        },
        {
          label: 'Proposed',
          amount: card.proposed_cap,
          value: money(card.proposed_cap),
          tone: costTone(card.proposed_cap, card.portfolio_goal),
        },
        {
          label: 'Portfolio CPA goal',
          amount: card.portfolio_goal,
          value: money(card.portfolio_goal),
          tone: 'mid',
        },
      ]);
    }
    case 'google_negative_terms':
      return onOneScale(
        [...card.terms]
          .sort((a, b) => b.spend - a.spend)
          .map((term) => ({
            label: `"${term.term}"`,
            amount: term.spend,
            value: formatCurrency(term.spend, card.currency),
            tone: term.conversions === 0 ? 'above' : 'mid',
          })),
      );
    case 'google_low_quality_keyword':
      return [
        {
          label: 'Quality Score',
          value: `${card.quality_score}/10`,
          fill: clamp01(card.quality_score / 10),
          tone: qualityTone(card.quality_score),
          tick: null,
        },
      ];
    case 'google_ad_drag': {
      if (card.cost_per_result == null || card.winner == null) return [];
      const money = (value: number) => formatCurrency(value, card.currency);
      return onOneScale([
        {
          label: card.ad_label,
          amount: card.cost_per_result,
          value: money(card.cost_per_result),
          tone: 'above',
        },
        {
          label: card.winner.label,
          amount: card.winner.cost_per_result,
          value: money(card.winner.cost_per_result),
          tone: 'below',
        },
      ]);
    }
    case 'google_ad_winner': {
      const money = (value: number) => formatCurrency(value, card.currency);
      return onOneScale([
        {
          label: card.winner.label,
          amount: card.winner.cost_per_result,
          value: money(card.winner.cost_per_result),
          tone: 'below',
        },
        {
          label: card.comparator.label,
          amount: card.comparator.cost_per_result,
          value: money(card.comparator.cost_per_result),
          tone: 'above',
        },
      ]);
    }
    case 'google_audience_saturation': {
      const money = (value: number) => formatCurrency(value, card.currency);
      return onOneScale([
        {
          label: 'Last 3 days',
          amount: card.cost_per_result_now,
          value: money(card.cost_per_result_now),
          tone: 'above',
        },
        {
          label: 'Last 14 days',
          amount: card.cost_per_result_before,
          value: money(card.cost_per_result_before),
          tone: 'mid',
        },
      ]);
    }
    case 'google_pmax_assets': {
      const asset = card.assets.find((entry) => entry.cost_per_result != null);
      if (asset?.cost_per_result == null) return [];
      const money = (value: number) => formatCurrency(value, card.currency);
      return onOneScale([
        {
          label: asset.label,
          amount: asset.cost_per_result,
          value: money(asset.cost_per_result),
          tone: 'above',
        },
        {
          label: asset.best_of_kind.label,
          amount: asset.best_of_kind.cost_per_result,
          value: money(asset.best_of_kind.cost_per_result),
          tone: 'below',
        },
      ]);
    }
    case 'meta_creative_fatigue':
    case 'tiktok_creative_fatigue': {
      const rows: Row[] = [
        {
          label: 'CTR before',
          amount: card.ctr_before,
          value: percentLabel(card.ctr_before),
          tone: 'mid',
        },
        {
          label: 'CTR now',
          amount: card.ctr_now,
          value: percentLabel(card.ctr_now),
          tone: 'above',
        },
      ];
      if (card.replacement) {
        rows.push({
          label: card.replacement.name,
          amount: card.replacement.ctr,
          value: percentLabel(card.replacement.ctr),
          tone: 'below',
        });
      }
      return onOneScale(rows);
    }
    case 'tiktok_hook_retention':
      return onOneScale([
        {
          label: card.creative_name,
          amount: card.hold_2s,
          value: percentLabel(card.hold_2s),
          tone: 'above',
        },
        {
          label: 'Portfolio',
          amount: card.portfolio_hold_2s,
          value: percentLabel(card.portfolio_hold_2s),
          tone: 'mid',
        },
      ]);
    case 'tiktok_budget_below_learning': {
      const perDay = (value: number) => `${formatCurrency(value, card.currency)}/day`;
      return onOneScale([
        {
          label: 'Budget now',
          amount: card.budget_per_day,
          value: perDay(card.budget_per_day),
          tone: 'above',
        },
        {
          label: 'Learning needs',
          amount: card.required_budget_per_day,
          value: perDay(card.required_budget_per_day),
          tone: 'mid',
        },
      ]);
    }
    case 'tiktok_scheduled_decrease': {
      const perDay = (value: number) => `${formatCurrency(value, card.currency)}/day`;
      return onOneScale([
        {
          label: 'Budget now',
          amount: card.budget_per_day,
          value: perDay(card.budget_per_day),
          tone: 'mid',
        },
        {
          label: 'Scheduled',
          amount: card.target_budget_per_day,
          value: perDay(card.target_budget_per_day),
          tone: 'below',
        },
      ]);
    }
    // One figure, a list of missing assets, a review or a status: nothing side by side.
    case 'google_pmax_asset_group':
    case 'google_video_readonly':
    case 'google_promote_term':
    case 'google_delivery_issue':
    case 'tiktok_delivery_issue':
    case 'tiktok_spark_candidate':
    case 'tiktok_attribution_window':
    case 'cross_platform_move':
      return [];
  }
}

/** The bars a card draws, from its platform card when it has one, else from its chart. */
export function evidenceBarsOf(
  candidate: AccountCandidate,
  platformCard: PlatformCard | null,
  currency: string | null,
): EvidenceBar[] {
  if (platformCard) return platformCardBars(platformCard);
  return candidate.chart ? chartBars(candidate.chart, currency) : [];
}
