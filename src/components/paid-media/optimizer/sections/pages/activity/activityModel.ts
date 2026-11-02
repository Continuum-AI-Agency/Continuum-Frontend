// The Activity page's reading of its two reads, pure so the chart and the list below it can never
// disagree about what happened when.
//
// Three hands change an ad account, and the page names each one:
//   optimizer — what autopilot or a cycle wrote (actor 'autopilot', or no recorded actor);
//   team      — what a person approved or changed (actor 'human');
//   platform  — what happened on the ad platform outside Continuum: the changes its own change
//               history saw (Google: in Google Ads, by its recommendations, by a rule), the days
//               the account stopped showing ads, read off its daily spend, and the enrolled ad
//               sets that left the account, read off the server log's roster drift.
//
// The spend line is the account's own daily series (the paid-media-metrics account overview),
// over the complete days of the window. Today is still being written, so it gets a column for
// its events but no point on the line.

import type { OptimizerLogRow, PaidAccountOverview } from '@continuum/contracts';
import { calendarDayIn, shiftDay } from '@/lib/paid-media/reportingWindow';
import type { OptimizerActionFeedRow } from '../../../useOptimizerData';
import { readActionChange } from '../../actionRows';
import { BOARD_COLOR } from '../../board/palette';
import { groupActionFeed } from '../../crossPlatformMove/moveDecisionModel';
import { ALL_PORTFOLIOS, readLifecycleRow } from '../../logFilters';

export type ActivitySource = 'optimizer' | 'team' | 'platform';
export type ActivitySourceFilter = 'all' | ActivitySource;

export const ACTIVITY_SOURCES = [
  'optimizer',
  'team',
  'platform',
] as const satisfies readonly ActivitySource[];

export const SOURCE_COPY: Record<ActivitySource, { label: string; hint: string }> = {
  optimizer: { label: 'Optimizer', hint: 'What autopilot and the cycles wrote.' },
  team: { label: 'Team', hint: 'What a person approved or changed.' },
  platform: {
    label: 'Platform',
    hint: 'What happened on the ad platform outside Continuum: changes made there, days without ads, ad sets that left.',
  },
};

/** The board's three validated categorical slots, one per hand. */
export const SOURCE_COLOR: Record<ActivitySource, string> = {
  optimizer: BOARD_COLOR.search,
  team: BOARD_COLOR.pmax,
  platform: BOARD_COLOR.video,
};

/** Which hand made an action row. A row with no recorded actor was written by the machine. */
export function actionSource(row: Pick<OptimizerActionFeedRow, 'actor_kind'>): ActivitySource {
  return row.actor_kind === 'human' ? 'team' : 'optimizer';
}

/** One calendar day of the chart, in the viewer's calendar (the list groups days the same way). */
export type ActivityDay = { key: string; complete: boolean };

/** The window's complete days ending yesterday, then today. */
export function activityDays(windowDays: number, now: Date = new Date()): ActivityDay[] {
  const today = calendarDayIn(now);
  const days: ActivityDay[] = [];
  for (let back = windowDays; back >= 1; back -= 1) {
    days.push({ key: shiftDay(today, -back), complete: true });
  }
  days.push({ key: today, complete: false });
  return days;
}

/** The viewer's calendar day an instant falls on; null for an unreadable timestamp. */
export function dayKeyOf(ts: string): string | null {
  const at = new Date(ts);
  return Number.isFinite(at.getTime()) ? calendarDayIn(at) : null;
}

const DAY_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Oct 26" from a `YYYY-MM-DD` day key. */
export function dayKeyLabel(key: string): string {
  const at = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(at.getTime()) ? DAY_FMT.format(at) : key;
}

/** The local midnight a day key starts at, as an instant: where a whole-day event sorts. */
export function dayStartIso(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).toISOString();
}

export type SpendDay = {
  key: string;
  /** Null on today, which is still being written. */
  spend: number | null;
  /** A complete day the account showed no ad: nothing spent and no impression. */
  dark: boolean;
};

export type SpendSeries = {
  days: SpendDay[];
  /** Spend over the complete days. */
  total: number;
  /** The highest day, the line's ceiling. */
  max: number;
  darkDays: number;
  completeDays: number;
  currency: string | null;
};

/**
 * The account's spend day by day over the chart's days. A day the platform reports nothing for is
 * a day it showed no ad: Meta and Google both leave a day without delivery out of a daily read.
 * Null when the read carries a total but no day-by-day series — a flat line there would be a lie.
 */
export function spendSeries(
  overview: Pick<PaidAccountOverview, 'trends' | 'metrics' | 'currency'>,
  days: readonly ActivityDay[],
): SpendSeries | null {
  const trends = overview.trends ?? [];
  if (trends.length === 0 && overview.metrics.spend > 0) return null;
  const byDay = new Map<string, { spend: number; impressions: number | null }>();
  for (const point of trends) {
    if (!point.date) continue;
    const key = point.date.slice(0, 10);
    const seen = byDay.get(key);
    const impressions =
      point.impressions == null
        ? (seen?.impressions ?? null)
        : (seen?.impressions ?? 0) + point.impressions;
    byDay.set(key, { spend: (seen?.spend ?? 0) + (point.spend ?? 0), impressions });
  }
  const series: SpendDay[] = days.map((day) => {
    if (!day.complete) return { key: day.key, spend: null, dark: false };
    const read = byDay.get(day.key);
    const spend = read?.spend ?? 0;
    const shown = (read?.impressions ?? 0) > 0;
    return { key: day.key, spend, dark: spend <= 0 && !shown };
  });
  const complete = series.filter((day) => day.spend !== null);
  const total = complete.reduce((sum, day) => sum + (day.spend ?? 0), 0);
  return {
    days: series,
    total,
    max: complete.reduce((top, day) => Math.max(top, day.spend ?? 0), 0),
    darkDays: complete.filter((day) => day.dark).length,
    completeDays: complete.length,
    currency: overview.currency ?? null,
  };
}

/** A day the account stopped showing ads, or started again. */
export type DeliveryEvent = {
  id: string;
  kind: 'stopped' | 'resumed';
  key: string;
  /** The last dark day of the stretch that starts here ('stopped'), or that ended ('resumed'). */
  through: string;
  /** Whether the stretch runs to the end of the read: still no ads yesterday. */
  ongoing: boolean;
};

/** The edges of every stretch without ads inside the window. A window that opens dark has no
 *  edge to name: the shading shows it, and its start is outside what was read. */
export function deliveryEvents(series: SpendSeries): DeliveryEvent[] {
  const complete = series.days.filter((day) => day.spend !== null);
  const events: DeliveryEvent[] = [];
  for (let index = 1; index < complete.length; index += 1) {
    const day = complete[index];
    const previous = complete[index - 1];
    if (!day || !previous) continue;
    if (day.dark && !previous.dark) {
      let end = index;
      while (complete[end + 1]?.dark) end += 1;
      events.push({
        id: `delivery:stopped:${day.key}`,
        kind: 'stopped',
        key: day.key,
        through: complete[end]?.key ?? day.key,
        ongoing: end === complete.length - 1,
      });
    } else if (!day.dark && previous.dark) {
      events.push({
        id: `delivery:resumed:${day.key}`,
        kind: 'resumed',
        key: day.key,
        through: previous.key,
        ongoing: false,
      });
    }
  }
  return events;
}

/** The words a delivery edge is listed with — product chrome, so English. */
export function deliveryWords(event: DeliveryEvent): { title: string; detail: string } {
  if (event.kind === 'resumed') {
    return {
      title: 'Ads showing again',
      detail: `The account delivered again after showing no ad through ${dayKeyLabel(event.through)}.`,
    };
  }
  const span =
    event.key === event.through
      ? `on ${dayKeyLabel(event.key)}`
      : `from ${dayKeyLabel(event.key)} to ${dayKeyLabel(event.through)}`;
  return {
    title: 'No ads shown',
    detail: event.ongoing
      ? `The account has shown no ad since ${dayKeyLabel(event.key)}: nothing spent, no impression.`
      : `The account showed no ad ${span}: nothing spent, no impression.`,
  };
}

/** The server log's rows that report something the platform did, not the machine. */
export function isPlatformLog(row: Pick<OptimizerLogRow, 'event'>): boolean {
  return row.event === 'roster_drift_detected';
}

/** One change the platform's own change history saw, made outside Continuum, as words. */
export type PlatformChange = {
  /** ISO 8601, with the account's offset. */
  at: string;
  /** "Budget changed", "Ad added". */
  what: string;
  /** The campaign (and ad group) it touched, when the platform names it. */
  where: string | null;
  detail: string | null;
  /** The channel that made it: "in Google Ads", "by Google's recommendations". */
  who: string;
};

/** A platform event as the list renders it, beside the action rows. */
export type ActivityPlatformItem =
  | { kind: 'log'; id: string; ts: string; portfolioName: string | null; row: OptimizerLogRow }
  | { kind: 'delivery'; id: string; ts: string; portfolioName: null; event: DeliveryEvent }
  | { kind: 'change'; id: string; ts: string; portfolioName: null; change: PlatformChange };

export function logEventId(row: Pick<OptimizerLogRow, 'id' | 'ts'>): string {
  return `log:${row.id}:${row.ts}`;
}

export function actionEventId(row: Pick<OptimizerActionFeedRow, 'id'>): string {
  return `action:${row.id}`;
}

export function moveEventId(moveId: string): string {
  return `move:${moveId}`;
}

/** The platform's events of the window, newest first: roster drift from the log, the delivery
 *  edges from the spend read, the changes the platform's own history saw. */
export function platformItems(
  logs: readonly OptimizerLogRow[],
  delivery: readonly DeliveryEvent[],
  changes: readonly PlatformChange[] = [],
): ActivityPlatformItem[] {
  const items: ActivityPlatformItem[] = [
    ...changes.map(
      (change, index): ActivityPlatformItem => ({
        kind: 'change',
        id: `change:${change.at}:${index}`,
        ts: change.at,
        portfolioName: null,
        change,
      }),
    ),
    ...logs.filter(isPlatformLog).map(
      (row): ActivityPlatformItem => ({
        kind: 'log',
        id: logEventId(row),
        ts: row.ts,
        portfolioName: row.portfolio_name ?? null,
        row,
      }),
    ),
    ...delivery.map(
      (event): ActivityPlatformItem => ({
        kind: 'delivery',
        id: event.id,
        ts: dayStartIso(event.key),
        portfolioName: null,
        event,
      }),
    ),
  ];
  return items.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

export type ActivityFilter = { source: ActivitySourceFilter; portfolio: string };

export const ALL_ACTIVITY: ActivityFilter = { source: 'all', portfolio: ALL_PORTFOLIOS };

/** The action rows the list shows under a filter. */
export function filterActions<
  TRow extends Pick<OptimizerActionFeedRow, 'actor_kind' | 'portfolio_name'>,
>(rows: readonly TRow[], filter: ActivityFilter): TRow[] {
  return rows.filter(
    (row) =>
      (filter.source === 'all' || actionSource(row) === filter.source) &&
      (filter.portfolio === ALL_PORTFOLIOS || row.portfolio_name === filter.portfolio),
  );
}

/** The platform events the list shows under a filter. An account-wide event (a day without ads)
 *  belongs to no portfolio, so narrowing to one portfolio leaves it out. */
export function filterPlatformItems(
  items: readonly ActivityPlatformItem[],
  filter: ActivityFilter,
): ActivityPlatformItem[] {
  if (filter.source !== 'all' && filter.source !== 'platform') return [];
  if (filter.portfolio === ALL_PORTFOLIOS) return [...items];
  return items.filter((item) => item.portfolioName === filter.portfolio);
}

function platformLabel(item: ActivityPlatformItem): string {
  if (item.kind === 'delivery') return deliveryWords(item.event).title;
  if (item.kind === 'change') {
    return `${item.change.what}${item.change.where ? ` · ${item.change.where}` : ''}`;
  }
  return `${readLifecycleRow(item.row).title}${item.portfolioName ? ` · ${item.portfolioName}` : ''}`;
}

/** One event on the chart: where it sits and what it says when pointed at. */
export type ActivityEvent = {
  id: string;
  source: ActivitySource;
  dayKey: string;
  label: string;
};

/** The chart's events, from the same filtered rows the list renders: a cross-platform move is
 *  one event, as it is one entry in the list. */
export function activityEvents(
  rows: OptimizerActionFeedRow[],
  platform: readonly ActivityPlatformItem[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const item of groupActionFeed(rows)) {
    if (item.kind === 'move') {
      const dayKey = dayKeyOf(item.move.ts);
      if (!dayKey) continue;
      events.push({
        id: moveEventId(item.move.moveId),
        source: actionSource(item.move.actorRow),
        dayKey,
        label: `Budget move between platforms${item.move.portfolioName ? ` · ${item.move.portfolioName}` : ''}`,
      });
      continue;
    }
    const dayKey = dayKeyOf(item.row.ts);
    if (!dayKey) continue;
    const change = readActionChange(item.row);
    events.push({
      id: actionEventId(item.row),
      source: actionSource(item.row),
      dayKey,
      label: `${change.sentence ?? change.label}${item.row.portfolio_name ? ` · ${item.row.portfolio_name}` : ''}`,
    });
  }
  for (const item of platform) {
    const dayKey = item.kind === 'delivery' ? item.event.key : dayKeyOf(item.ts);
    if (!dayKey) continue;
    events.push({
      id: item.id,
      source: 'platform',
      dayKey,
      label: platformLabel(item),
    });
  }
  return events;
}

/** How many of each hand's events there are, for the filter's counts. */
export function sourceCounts(events: readonly ActivityEvent[]): Record<ActivitySource, number> {
  const counts: Record<ActivitySource, number> = { optimizer: 0, team: 0, platform: 0 };
  for (const event of events) counts[event.source] += 1;
  return counts;
}

/** A marker on the chart: its column, its place in the day's stack, and the day's overflow. */
export type ActivityMarker = ActivityEvent & { column: number; stack: number };

export const MARKER_STACK = 3;

/**
 * Where each event sits: its day's column and its place in that day's stack, the day's first event
 * on top. A day holding more than MARKER_STACK events shows that many and counts the rest, so a
 * busy day never pushes its dots into the line.
 */
export function layoutMarkers(
  events: readonly ActivityEvent[],
  days: readonly ActivityDay[],
): { markers: ActivityMarker[]; overflow: { column: number; count: number }[] } {
  const column = new Map(days.map((day, index) => [day.key, index]));
  const perDay = new Map<number, number>();
  const markers: ActivityMarker[] = [];
  for (const event of events) {
    const at = column.get(event.dayKey);
    if (at === undefined) continue;
    const stack = perDay.get(at) ?? 0;
    perDay.set(at, stack + 1);
    if (stack < MARKER_STACK) markers.push({ ...event, column: at, stack });
  }
  const overflow = [...perDay.entries()]
    .filter(([, count]) => count > MARKER_STACK)
    .map(([at, count]) => ({ column: at, count: count - MARKER_STACK }));
  return { markers, overflow };
}
