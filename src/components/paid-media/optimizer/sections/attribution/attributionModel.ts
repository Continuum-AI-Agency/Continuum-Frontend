// What a portfolio counts its results with, in words (frontend.html §4, decisiones 20). One
// rule for the screen: every result figure carries its source, and the source is said ONCE, in
// the header — "Attribution: GA4 · read 3 h ago · 92%". When the source is not the platform,
// the platform's own count sits beside it in grey, as a fact, never as an alarm.
//
// Pure: no React, no fetch. The Manage panel's spreadsheet flow and the detail's By-platform
// block both read their sentences from here so the two can never word the same thing twice.

import {
  type AttributionKind,
  type ConversionsBySource,
  type PortfolioMetrics,
  SHEET_COVERAGE_THRESHOLD,
  type SheetAttributionConfig,
  SheetAttributionConfigSchema,
  type SheetColumnRole,
  type SheetDateFormat,
  type SheetHeaderSuggestion,
  type SheetMatchKeyKind,
  type SheetSource,
  type SheetSyncReport,
  sheetMatchLevel,
} from '@continuum/contracts';

const SOURCE_NAMES: Record<AttributionKind, string> = {
  platform: "Each platform's own",
  ga4: 'GA4',
  spreadsheet: 'Spreadsheet',
};

/** The source's name. The RPC's own labels are written for another audience (and in Spanish),
 *  so the screen names the kind. */
export function attributionSourceName(kind: AttributionKind): string {
  return SOURCE_NAMES[kind];
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". Null in, null out. */
export function formatReadAge(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const read = Date.parse(iso);
  if (Number.isNaN(read)) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - read) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** The conversions_by_source row the slice actually used. */
export function usedSource(metrics: PortfolioMetrics): ConversionsBySource | null {
  return metrics.conversions_by_source.find((row) => row.kind === metrics.attribution.used) ?? null;
}

/** The configured non-platform source, when the portfolio has one. */
export function configuredSource(metrics: PortfolioMetrics): ConversionsBySource | null {
  const kind = metrics.attribution.configured;
  if (kind === 'platform') return null;
  return metrics.conversions_by_source.find((row) => row.kind === kind) ?? null;
}

export type AttributionHeader = {
  /** "Attribution: GA4 · read 3 h ago · 92%" */
  line: string;
  used: AttributionKind;
  /** Why the configured source is not the one in use, or null when it is. */
  fallback: string | null;
};

const FALLBACK_REASONS = {
  coverage: `it covers less than ${percent(SHEET_COVERAGE_THRESHOLD)} of what spent, so each platform's own count is used`,
  error: "its last read failed, so each platform's own count is used",
} as const;

export function attributionHeader(metrics: PortfolioMetrics, now: Date): AttributionHeader {
  const { used, configured, fallback_reason } = metrics.attribution;
  const source = usedSource(metrics);
  const parts = [`Attribution: ${attributionSourceName(used)}`];
  const age = formatReadAge(source?.refreshed_at ?? metrics.read_at, now);
  if (age) parts.push(`read ${age}`);
  if (source) parts.push(percent(source.coverage_pct));
  const fallback =
    fallback_reason === 'none'
      ? null
      : `${attributionSourceName(configured)} is set up, but ${FALLBACK_REASONS[fallback_reason]}.`;
  return { line: parts.join(' · '), used, fallback };
}

// ── The spreadsheet's match check ────────────────────────────────────────────────────────────

function entityWords(kind: SheetMatchKeyKind): string {
  return sheetMatchLevel(kind) === 'group' ? 'ad sets' : 'campaigns';
}

/** "38 of 42 rows matched · 9 of 10 ad sets with spend covered (90%)" */
export function matchCheckLine(report: SheetSyncReport, kind: SheetMatchKeyKind): string {
  const { covered, spending, ratio } = report.coverage;
  return `${report.rowsMatched} of ${report.rowsRead} rows matched · ${covered} of ${spending} ${entityWords(kind)} with spend covered (${percent(ratio)})`;
}

export function clearsCoverageBar(report: SheetSyncReport): boolean {
  return report.coverage.ratio >= SHEET_COVERAGE_THRESHOLD;
}

/** The 80% bar, in plain words. */
export const COVERAGE_BAR_EXPLAINED = `The sheet is used once it covers at least ${percent(SHEET_COVERAGE_THRESHOLD)} of the ad sets and campaigns that spent in the last 7 days. Below that, the Optimizer keeps each platform's own count, so a half-filled sheet can never make a platform look worse than it is.`;

// ── The mapping step ─────────────────────────────────────────────────────────────────────────

export const MATCH_KEY_KIND_LABELS: Record<SheetMatchKeyKind, string> = {
  adset_id: 'Ad set or ad group — ID',
  adset_name: 'Ad set or ad group — name',
  campaign_id: 'Campaign — ID',
  campaign_name: 'Campaign — name',
  utm_campaign: 'UTM campaign',
  utm_content: 'UTM content',
};

export const DATE_FORMAT_LABELS: Record<SheetDateFormat, string> = {
  iso: '2026-09-27',
  dmy: '27/09/2026',
  mdy: '09/27/2026',
  serial: 'Sheets day number',
};

export const COLUMN_ROLE_LABELS: Record<SheetColumnRole, string> = {
  matchKey: 'Ad set or campaign',
  conversions: 'Conversions',
  date: 'Date',
  value: 'Value (optional)',
  platform: 'Platform (optional)',
};

export const REQUIRED_ROLES = ['matchKey', 'conversions', 'date'] as const;
export const OPTIONAL_ROLES = ['value', 'platform'] as const;

export type SheetMappingDraft = {
  headerRow: number;
  columns: Record<SheetColumnRole, number | null>;
  matchKeyKind: SheetMatchKeyKind | null;
  dateFormat: SheetDateFormat | null;
  timezone: string;
};

/** The backend's header guess as the dropdowns' starting point; every guess stays editable. */
export function draftFromSuggestion(
  suggestion: SheetHeaderSuggestion,
  timezone: string,
): SheetMappingDraft {
  const pick = (role: SheetColumnRole) => suggestion.columns[role]?.column ?? null;
  return {
    headerRow: suggestion.headerRow,
    columns: {
      date: pick('date'),
      matchKey: pick('matchKey'),
      conversions: pick('conversions'),
      value: pick('value'),
      platform: pick('platform'),
    },
    matchKeyKind: suggestion.matchKeyKind,
    dateFormat: suggestion.dateFormat,
    timezone,
  };
}

export type SheetLocation =
  | { source: Extract<SheetSource, 'google_sheet'>; spreadsheetId: string; tab: string | null }
  | { source: Extract<SheetSource, 'csv_upload'> };

export type ConfigBuild =
  | { ok: true; config: SheetAttributionConfig }
  | { ok: false; missing: string[] };

/** The draft as a SheetAttributionConfig, or the roles still to pick, by their on-screen names. */
export function buildSheetConfig(location: SheetLocation, draft: SheetMappingDraft): ConfigBuild {
  const missing: string[] = REQUIRED_ROLES.filter((role) => draft.columns[role] === null).map(
    (role) => COLUMN_ROLE_LABELS[role],
  );
  if (!draft.matchKeyKind) missing.push('What the ad set or campaign column holds');
  if (!draft.dateFormat) missing.push('Date format');
  if (missing.length > 0) return { ok: false, missing };

  const optional = (role: SheetColumnRole) => {
    const column = draft.columns[role];
    return column === null ? {} : { [role]: column };
  };
  const parsed = SheetAttributionConfigSchema.safeParse({
    source: location.source,
    ...(location.source === 'google_sheet'
      ? { spreadsheetId: location.spreadsheetId, ...(location.tab ? { tab: location.tab } : {}) }
      : {}),
    headerRow: draft.headerRow,
    columns: {
      date: draft.columns.date,
      matchKey: draft.columns.matchKey,
      conversions: draft.columns.conversions,
      ...optional('value'),
      ...optional('platform'),
    },
    matchKeyKind: draft.matchKeyKind,
    dateFormat: draft.dateFormat,
    timezone: draft.timezone,
  });
  if (!parsed.success) {
    return { ok: false, missing: parsed.error.issues.map((issue) => issue.message) };
  }
  return { ok: true, config: parsed.data };
}

/** A Google Sheets URL or a bare file id → the file id; null when it is neither. */
export function spreadsheetIdFrom(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})/.exec(trimmed);
  if (fromUrl) return fromUrl[1] ?? null;
  return /^[A-Za-z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}
