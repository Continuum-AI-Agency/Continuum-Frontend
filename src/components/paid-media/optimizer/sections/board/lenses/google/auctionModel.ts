// G06 Auction, the figures. For each campaign that serves on Search: the impression share it won
// and what it lost to budget and to rank — Google's own figures over the window, kept apart
// because they call for opposite fixes (moneyLeftModel says why) — with the V3 case marked (half
// or more lost to budget) and its raise locked when the V3 finding says the primary conversion
// must be fixed first. When the account does not deliver, the lens is the calendar of the days it
// showed no ad: G12's account card (since when, and why) and E1's continuity finding (each day of
// the window with its spend). Pure: a share Google did not report is null, never zero.

import {
  type AccountCandidate,
  auctionDarkSentence,
  auctionFindingLabels,
  auctionSharesSentence,
  type GoogleCampaignFields,
  type GoogleTopCampaigns,
  type PlatformCard,
} from '@continuum/contracts';
import { formatCurrency } from '../../../../format';
import { campaignField } from '../../../google/googleReads';
import { shareText } from '../../../google/views/cell';
import {
  accountDeliveryCardOf,
  type GoogleDeliveryStatus,
  googleDeliveryStatusOf,
} from '../../../platforms/googleDeliveryStatusModel';
import { addDays, factOf, findingsOf, leadingNumber, maxBy } from './mixAuctionSignalModel';

/** V3 (capped_budget_locked) fires from half the impressions lost to budget: the engine's
 *  CAPPED_MIN_BUDGET_LOST. The lens marks the same rows. */
export const V3_BUDGET_LOST = 0.5;

export type AuctionChannel = 'search' | 'pmax';

/** The channel types Google reports a Search impression share for. */
const SERVES_ON_SEARCH: Readonly<Record<string, AuctionChannel>> = {
  SEARCH: 'search',
  PERFORMANCE_MAX: 'pmax',
};

export type AuctionRow = {
  id: string;
  name: string;
  channel: AuctionChannel;
  spend: number;
  budgetPerDay: number | null;
  /** 0–1 of the eligible impressions; null when Google did not report it. */
  shown: number | null;
  budgetLost: number | null;
  rankLost: number | null;
  /** Why a share reads "—"; null when Google reported all three. */
  missing: string | null;
  /** V3: half or more of the impressions lost to budget. */
  v3: boolean;
  /** The V3 finding holds this campaign's raise until the primary conversion is fixed. */
  locked: boolean;
};

export type AuctionShares = {
  kind: 'share';
  rows: AuctionRow[];
  /** The campaigns the V3 finding locks, as it names them. */
  locked: string[];
  since: string;
  until: string;
};

export type CalendarDay = {
  day: string;
  /** False for the days that only pad the first and last week. */
  inRange: boolean;
  /** served: ads shown, with the day's spend; dark: no ad shown; unknown: not in the cards. */
  state: 'served' | 'dark' | 'unknown';
  spend: number | null;
};

export type DarkRun = { from: string; to: string; days: number };

export type AuctionDark = {
  kind: 'dark';
  /** Monday-to-Sunday weeks over the days the cards place; null when none can be placed (a
   *  G12 card written before it carried its first dark day). */
  weeks: CalendarDay[][] | null;
  darkDays: number;
  runs: DarkRun[];
  /** The largest spend on a served day, the top of the calendar's shade. */
  maxSpend: number;
  /** The words of G12's account card when Google shows no ad anywhere in the account. */
  status: GoogleDeliveryStatus | null;
  suspended: boolean;
  /** The first day of G12's dark run. */
  darkSince: string | null;
  budgetPerDay: number | null;
  currency: string | null;
  /** E1's estimate of the conversions the dark days cost, at the served-day average. */
  lostConversions: number | null;
  /** The days the calendar's cards read: E1's window, else the lens's own. */
  windowDays: number;
};

export type AuctionModel = AuctionShares | AuctionDark | { kind: 'empty'; reason: string };

function shareField(
  row: GoogleTopCampaigns['rows'][number],
  key: keyof Pick<
    GoogleCampaignFields,
    | 'search_impression_share'
    | 'search_budget_lost_impression_share'
    | 'search_rank_lost_impression_share'
  >,
): { value: number | null; reason: string | null } {
  const field = campaignField(row, key);
  return { value: field.value, reason: field.reason };
}

/** The campaigns that serve on Search and spent, by spend. A Performance Max with no share
 *  reported has nothing to say in an impression-share lens and is left out; a Search campaign
 *  stays, its "—" saying why. */
export function buildAuctionShares(
  read: GoogleTopCampaigns,
  cards: readonly PlatformCard[],
): AuctionShares {
  const locked = findingsOf(cards, 'capped_budget_locked').flatMap((card) =>
    card.campaign_name ? [card.campaign_name] : [],
  );
  const rows = read.rows
    .flatMap((row): AuctionRow[] => {
      const channel = SERVES_ON_SEARCH[row.labels?.channel_type ?? ''];
      if (!channel || row.metrics.spend <= 0) return [];
      const shown = shareField(row, 'search_impression_share');
      const budget = shareField(row, 'search_budget_lost_impression_share');
      const rank = shareField(row, 'search_rank_lost_impression_share');
      if (channel === 'pmax' && shown.value == null && budget.value == null && rank.value == null) {
        return [];
      }
      const perDay = campaignField(row, 'budget_per_day');
      return [
        {
          id: row.id,
          name: row.name,
          channel,
          spend: row.metrics.spend,
          budgetPerDay: perDay.value,
          shown: shown.value,
          budgetLost: budget.value,
          rankLost: rank.value,
          missing: shown.reason ?? budget.reason ?? rank.reason,
          v3: (budget.value ?? 0) >= V3_BUDGET_LOST,
          locked: locked.includes(row.name),
        },
      ];
    })
    .sort((a, b) => b.spend - a.spend);
  return { kind: 'share', rows, locked, since: read.range.since, until: read.range.until };
}

/** The row the small lens leads with: the most lost to budget, else the most lost to rank. */
export function auctionHeadline(
  model: AuctionShares,
): { row: AuctionRow; measure: 'budget' | 'rank'; share: number } | null {
  const budget = maxBy(
    model.rows.filter((row) => (row.budgetLost ?? 0) > 0),
    (row) => row.budgetLost ?? 0,
  );
  if (budget?.budgetLost != null)
    return { row: budget, measure: 'budget', share: budget.budgetLost };
  const rank = maxBy(
    model.rows.filter((row) => (row.rankLost ?? 0) > 0),
    (row) => row.rankLost ?? 0,
  );
  if (rank?.rankLost != null) return { row: rank, measure: 'rank', share: rank.rankLost };
  return null;
}

/** The takeaway: the campaign that loses most to budget (and that its raise waits, when V3 locks
 *  it), then the one that loses more to rank than budget can buy back. */
export function auctionTakeaway(model: AuctionShares): string | null {
  const budget = maxBy(
    model.rows.filter((row) => (row.budgetLost ?? 0) > 0),
    (row) => row.budgetLost ?? 0,
  );
  const rank = maxBy(
    model.rows.filter(
      (row) => row !== budget && (row.rankLost ?? 0) > Math.max(row.budgetLost ?? 0, 0),
    ),
    (row) => row.rankLost ?? 0,
  );
  return auctionSharesSentence(
    budget?.budgetLost != null
      ? { campaign: budget.name, share: shareText(budget.budgetLost), locked: budget.locked }
      : null,
    rank?.rankLost != null ? { campaign: rank.name, share: shareText(rank.rankLost) } : null,
  );
}

// ── The days without ads ──────────────────────────────────────────────────────────────────────

/**
 * E1 labels each day of its window "MM-DD", in order, the last one no later than `today`: the
 * year is read back from there, so a window that crosses New Year keeps both years right.
 */
export function datesOfMonthDays(labels: readonly string[], today: string): (string | null)[] {
  let year = Number(today.slice(0, 4));
  const todayMonthDay = today.slice(5, 10);
  let next: string | null = null;
  const days: (string | null)[] = labels.map(() => null);
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const monthDay = labels[index] ?? '';
    if (!/^\d{2}-\d{2}$/.test(monthDay)) continue;
    if (next === null ? monthDay > todayMonthDay : monthDay > next) year -= 1;
    days[index] = `${year}-${monthDay}`;
    next = monthDay;
  }
  return days;
}

function weekday(day: string): number {
  // Monday 0 … Sunday 6.
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function weeksOf(
  from: string,
  to: string,
  known: ReadonlyMap<string, { state: 'served' | 'dark'; spend: number | null }>,
): CalendarDay[][] {
  const start = addDays(from, -weekday(from));
  const end = addDays(to, 6 - weekday(to));
  const weeks: CalendarDay[][] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (weekday(day) === 0) weeks.push([]);
    const entry = known.get(day);
    weeks[weeks.length - 1]?.push({
      day,
      inRange: day >= from && day <= to,
      state: entry?.state ?? 'unknown',
      spend: entry?.spend ?? null,
    });
  }
  return weeks;
}

function runsOf(darkDays: readonly string[]): DarkRun[] {
  const runs: DarkRun[] = [];
  for (const day of [...darkDays].sort()) {
    const last = runs[runs.length - 1];
    if (last && addDays(last.to, 1) === day) {
      last.to = day;
      last.days += 1;
    } else {
      runs.push({ from: day, to: day, days: 1 });
    }
  }
  return runs;
}

const SUSPENDED = 'SERVING_STATUS_SUSPENDED';

/**
 * The calendar of the days without ads, or null when the account delivers. G12's account card
 * (every enabled campaign dark) and E1's finding (dark runs of two days or more) each put the lens
 * here; E1 places every day of its window with its spend, G12 its dark run from the first day.
 * `window` is the lens's own, the span a G12-only calendar shows.
 */
export function buildAuctionDark(
  candidates: readonly AccountCandidate[],
  cards: readonly PlatformCard[],
  window: { since: string; until: string },
  today: string,
): AuctionDark | null {
  const delivery = accountDeliveryCardOf(candidates);
  const continuity = findingsOf(cards, 'continuity_calendar')[0] ?? null;
  if (!delivery && !continuity) return null;

  const known = new Map<string, { state: 'served' | 'dark'; spend: number | null }>();
  const bars = continuity?.bars ?? [];
  const dates = datesOfMonthDays(
    bars.map((bar) => bar.label),
    today,
  );
  bars.forEach((bar, index) => {
    const day = dates[index];
    if (day) known.set(day, { state: bar.flagged ? 'dark' : 'served', spend: bar.value });
  });
  if (delivery?.dark_since) {
    for (let offset = 0; offset < delivery.dark_days; offset += 1) {
      const day = addDays(delivery.dark_since, offset);
      known.set(day, { state: 'dark', spend: known.get(day)?.spend ?? null });
    }
  }

  const placed = [...known.keys()].sort();
  const dark = placed.filter((day) => known.get(day)?.state === 'dark');
  const first = placed[0];
  const last = placed[placed.length - 1];
  // E1 places its whole window; a G12 run alone sits inside the lens's own window.
  const from = continuity ? first : first && first < window.since ? first : window.since;
  const to = continuity ? last : last && last > window.until ? last : window.until;
  const spends = [...known.values()].flatMap((entry) =>
    entry.state === 'served' && entry.spend != null ? [entry.spend] : [],
  );
  return {
    kind: 'dark',
    weeks: first && from && to ? weeksOf(from, to, known) : null,
    darkDays: dark.length > 0 ? dark.length : (delivery?.dark_days ?? 0),
    runs: runsOf(dark),
    maxSpend: spends.length > 0 ? Math.max(...spends) : 0,
    status: googleDeliveryStatusOf(candidates),
    suspended: delivery?.reasons.includes(SUSPENDED) ?? false,
    darkSince: delivery?.dark_since ?? null,
    budgetPerDay: delivery?.budget_per_day ?? null,
    currency: delivery?.currency ?? continuity?.currency ?? null,
    lostConversions: continuity
      ? leadingNumber(factOf(continuity, auctionFindingLabels.lostConversions))
      : null,
    windowDays:
      continuity?.window_days ??
      Math.round((Date.parse(window.until) - Date.parse(window.since)) / 86_400_000 + 1),
  };
}

/** The takeaway of the calendar: G12's suspension or dark run when Google shows no ad anywhere,
 *  else E1's runs and what they cost. */
export function auctionDarkTakeaway(dark: AuctionDark): string {
  return auctionDarkSentence({
    status: dark.status ? (dark.suspended ? 'suspended' : 'not_delivering') : null,
    darkDays: dark.darkDays,
    darkSince: dark.darkSince,
    budgetPerDay:
      dark.budgetPerDay != null ? formatCurrency(dark.budgetPerDay, dark.currency) : null,
    runs: dark.runs,
    lostConversions:
      dark.lostConversions != null
        ? Math.round(dark.lostConversions).toLocaleString('en-US')
        : null,
  });
}
