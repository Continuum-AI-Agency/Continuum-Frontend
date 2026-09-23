// ONE reporting range, shared by every surface that names a window.
//
// Every optimizer panel used to hardcode its own window (funnel d7, angles d14, cost
// timeline the last 30 cycles) with nothing on screen saying which, so the same portfolio
// reported three periods at once. The range lives in the URL (`range=`), resolves here to
// concrete dates, and every read surface takes the resolved range instead of guessing.
//
// It lives in contracts rather than the Frontend because a saved Jaina dashboard records
// the window each block was computed for in this same vocabulary (see
// `streaming/jaina-dashboard-spec.ts`), and a stored, wire-crossing value has one home.
//
// Presets are trailing windows ending today; `flight` is the portfolio's own period
// (start → min(end, today)); `custom` is an explicit from/to. A resolved range also carries
// the PREVIOUS window of equal length (for "vs prior period" deltas) and the nearest
// read-surface lookback (`d7 | d14 | d30`) for RPCs that only take one of those.

import { z } from 'zod';
import type { LookbackWindow } from './service';

export const RANGE_PRESETS = ['d3', 'd7', 'd14', 'd30', 'flight'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const rangePresetSchema = z.enum(RANGE_PRESETS);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** A real calendar date in YYYY-MM-DD — the shape AND a date that exists (2026-13-01 and
 *  2026-02-31 both fail: Date would silently roll them over). */
export function isIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

const isoDateSchema = z.string().refine(isIsoDate, 'expected a real YYYY-MM-DD date');

/** The stored shape of a range: what a URL param, a saved dashboard or a re-run request
 *  carries. A custom range is two real dates in order. */
export const rangeSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), preset: rangePresetSchema }),
  z
    .object({ kind: z.literal('custom'), from: isoDateSchema, to: isoDateSchema })
    .refine((range) => range.from <= range.to, 'a custom range ends on or after it starts'),
]);
export type RangeSpec = z.infer<typeof rangeSpecSchema>;

export const DEFAULT_RANGE: RangeSpec = { kind: 'preset', preset: 'd7' };

const PRESET_DAYS: Record<Exclude<RangePreset, 'flight'>, number> = {
  d3: 3,
  d7: 7,
  d14: 14,
  d30: 30,
};

export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
  d3: '3d',
  d7: '7d',
  d14: '14d',
  d30: '30d',
  flight: 'Flight',
};

/** Today as a UTC ISO date — the same anchor the engine's cycle timestamp uses. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (0 when equal). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** Two dates → a custom range, or null when either is not a real date or they are out of
 *  order. The honest reading of a `since`/`until` pair that may be empty strings. */
export function customRange(
  from: string | null | undefined,
  to: string | null | undefined,
): RangeSpec | null {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return null;
  return { kind: 'custom', from, to };
}

/** `range=` param → spec. Unknown or malformed values fall back to the default rather
 *  than throwing: a stale link should open the dashboard, not break it. */
export function parseRangeParam(raw: string | null | undefined): RangeSpec {
  if (!raw) return DEFAULT_RANGE;
  if ((RANGE_PRESETS as readonly string[]).includes(raw)) {
    return { kind: 'preset', preset: raw as RangePreset };
  }
  const [from, to] = raw.split('_');
  return customRange(from, to) ?? DEFAULT_RANGE;
}

export function serializeRange(spec: RangeSpec): string {
  return spec.kind === 'preset' ? spec.preset : `${spec.from}_${spec.to}`;
}

/** The range as a person reads it, with no "today" to resolve against: "Last 7 days",
 *  "Flight", or the two dates of a custom window. */
export function rangeSpecLabel(spec: RangeSpec): string {
  if (spec.kind === 'custom')
    return spec.from === spec.to ? spec.from : `${spec.from} → ${spec.to}`;
  if (spec.preset === 'flight') return 'Flight';
  return `Last ${PRESET_DAYS[spec.preset]} days`;
}

export type ResolvedRange = {
  spec: RangeSpec;
  from: string;
  to: string;
  /** Inclusive day count. */
  days: number;
  /** Short operator-facing label, e.g. "Last 7 days" or "Flight · Jun 1 → Jun 30". */
  label: string;
  /** The window of equal length ending the day before `from`; null when it would start
   *  before any data can exist (a flight on day one has no prior). */
  previous: { from: string; to: string } | null;
  /** Nearest read-surface lookback for RPCs that only take d7 / d14 / d30. */
  lookback: LookbackWindow;
  /** Nearest engine scoring window for snapshot-window reads (d3 / d7 / d14). */
  window: 'd3' | 'd7' | 'd14';
  /** True when 'flight' was asked for but the portfolio has no flight — the resolved
   *  range is the default preset and the UI should say so. */
  flightMissing: boolean;
};

export type FlightFields = {
  period_start?: string | null;
  period_end?: string | null;
};

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
function fmt(date: string): string {
  return DATE_FMT.format(new Date(`${date}T00:00:00Z`));
}

export function lookbackFor(days: number): LookbackWindow {
  if (days <= 7) return 'd7';
  if (days <= 14) return 'd14';
  return 'd30';
}

export function windowFor(days: number): 'd3' | 'd7' | 'd14' {
  if (days <= 3) return 'd3';
  if (days <= 7) return 'd7';
  return 'd14';
}

export function resolveRange(
  spec: RangeSpec,
  flight: FlightFields | null | undefined,
  today: string = todayIso(),
): ResolvedRange {
  let from: string;
  let to: string;
  let label: string;
  let flightMissing = false;
  let effective = spec;

  if (spec.kind === 'custom') {
    from = spec.from;
    to = spec.to > today ? today : spec.to;
    if (to < from) to = from;
    label = `${fmt(from)} → ${fmt(to)}`;
  } else if (spec.preset === 'flight') {
    const start = flight?.period_start;
    const end = flight?.period_end;
    if (isIsoDate(start) && isIsoDate(end)) {
      from = start;
      to = end < today ? end : today;
      if (to < from) to = from; // flight not started: a single day, honestly empty
      label = `Flight · ${fmt(start)} → ${fmt(end)}`;
    } else {
      flightMissing = true;
      effective = DEFAULT_RANGE;
      const days = PRESET_DAYS.d7;
      to = today;
      from = addDays(today, -(days - 1));
      label = 'Last 7 days · no flight set';
    }
  } else {
    const days = PRESET_DAYS[spec.preset];
    to = today;
    from = addDays(today, -(days - 1));
    label = `Last ${days} days`;
  }

  const days = daysBetween(from, to) + 1;
  const previous = { from: addDays(from, -days), to: addDays(from, -1) };

  return {
    spec: effective,
    from,
    to,
    days,
    label,
    previous,
    lookback: lookbackFor(days),
    window: windowFor(days),
    flightMissing,
  };
}
