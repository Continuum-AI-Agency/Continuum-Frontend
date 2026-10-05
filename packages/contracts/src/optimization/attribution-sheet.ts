// The client's spreadsheet as a portfolio attribution source (decisiones 20): which column is
// the date, the entity key and the conversion volume, what a sync read and matched, and the
// header suggestion the Frontend's mapping step starts from.
// Design: docs/optimizer-multiplatform/portafolio-modelo.html §C.1 (Hoja del cliente).
// Producer: Continuum-Optimizer/src/multiplatform/attribution/. Rows land in
// optimizer.portfolio_conversions_daily (20261001120200), one whole day at a time.

import { z } from 'zod';
import { PlatformIdSchema } from '../paid/platform';

export const SheetSourceSchema = z.enum(['google_sheet', 'csv_upload']);
export type SheetSource = z.infer<typeof SheetSourceSchema>;

/** What the key column holds. An *_id or utm_* key is tried as an id first, then as a name. */
export const SheetMatchKeyKindSchema = z.enum([
  'adset_id',
  'adset_name',
  'campaign_id',
  'campaign_name',
  'utm_campaign',
  'utm_content',
]);
export type SheetMatchKeyKind = z.infer<typeof SheetMatchKeyKindSchema>;

/** The entity level a key kind addresses: ad set / ad group, or campaign. */
export function sheetMatchLevel(kind: SheetMatchKeyKind): 'group' | 'campaign' {
  return kind === 'adset_id' || kind === 'adset_name' || kind === 'utm_content'
    ? 'group'
    : 'campaign';
}

/** iso = YYYY-MM-DD (a time after it is allowed), dmy = DD/MM/YYYY, mdy = MM/DD/YYYY,
 *  serial = a Sheets / Excel day number (UNFORMATTED_VALUE). */
export const SheetDateFormatSchema = z.enum(['iso', 'dmy', 'mdy', 'serial']);
export type SheetDateFormat = z.infer<typeof SheetDateFormatSchema>;

/** A column by its header text (as the mapping step shows it) or by 0-based index. */
export const SheetColumnRefSchema = z.union([z.string().trim().min(1), z.number().int().min(0)]);
export type SheetColumnRef = z.infer<typeof SheetColumnRefSchema>;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const SheetAttributionConfigSchema = z
  .object({
    source: SheetSourceSchema,
    /** Google Sheets file id (the /d/<id>/ part of the URL). Required for google_sheet. */
    spreadsheetId: z.string().trim().min(1).optional(),
    /** The tab title. Absent = the first tab. */
    tab: z.string().trim().min(1).optional(),
    /** brand_profiles.user_integrations id of the google_workspace connection to read with. */
    integrationId: z.string().uuid().optional(),
    /** 1-based row number of the header row; data starts on the row after it. */
    headerRow: z.number().int().min(1).default(1),
    columns: z.object({
      date: SheetColumnRefSchema,
      matchKey: SheetColumnRefSchema,
      conversions: SheetColumnRefSchema,
      value: SheetColumnRefSchema.optional(),
      platform: SheetColumnRefSchema.optional(),
    }),
    matchKeyKind: SheetMatchKeyKindSchema,
    dateFormat: SheetDateFormatSchema,
    /** IANA zone the sheet's timestamps are written in. A date-only cell is that day as
     *  written; a cell with a time is moved to its UTC day. */
    timezone: z.string().refine(isTimeZone, 'not an IANA time zone'),
  })
  .superRefine((config, ctx) => {
    if (config.source === 'google_sheet' && !config.spreadsheetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spreadsheetId'],
        message: 'a google_sheet source needs its spreadsheetId',
      });
    }
  });
export type SheetAttributionConfig = z.infer<typeof SheetAttributionConfigSchema>;
export type SheetAttributionConfigInput = z.input<typeof SheetAttributionConfigSchema>;

export const SheetRowErrorCodeSchema = z.enum([
  'missing_date',
  'bad_date',
  'missing_key',
  'missing_conversions',
  'bad_conversions',
  'bad_value',
  'bad_platform',
  'ambiguous_key',
]);
export type SheetRowErrorCode = z.infer<typeof SheetRowErrorCodeSchema>;

/** One reported problem. `row` is the sheet's own 1-based row number, so the client can find it. */
export const SheetRowErrorSchema = z.object({
  row: z.number().int().min(1),
  column: z.string().nullable(),
  code: SheetRowErrorCodeSchema,
  message: z.string(),
});
export type SheetRowError = z.infer<typeof SheetRowErrorSchema>;

export const SheetUnmatchedSampleSchema = z.object({
  row: z.number().int().min(1),
  key: z.string(),
  platform: PlatformIdSchema.nullable(),
});
export type SheetUnmatchedSample = z.infer<typeof SheetUnmatchedSampleSchema>;

/** The most unmatched rows a report carries; the counts stay exact. */
export const SHEET_UNMATCHED_SAMPLE_LIMIT = 20;

/** The coverage at which the sheet is used instead of what each platform reports. */
export const SHEET_COVERAGE_THRESHOLD = 0.8;

export const SheetSyncReportSchema = z
  .object({
    /** Non-blank data rows under the header. */
    rowsRead: z.number().int().nonnegative(),
    rowsMatched: z.number().int().nonnegative(),
    /** Valid rows whose key named no entity of the portfolio: kept in the unmatched bucket. */
    rowsUnmatched: z.number().int().nonnegative(),
    /** Rows that failed validation: reported in `errors`, written nowhere. */
    rowsInvalid: z.number().int().nonnegative(),
    matchedBy: z.object({
      id: z.number().int().nonnegative(),
      name: z.number().int().nonnegative(),
      utm: z.number().int().nonnegative(),
    }),
    /** Share of the portfolio's entities with spend in `window` that the sheet matched there. */
    coverage: z.object({
      ratio: z.number().min(0).max(1),
      covered: z.number().int().nonnegative(),
      spending: z.number().int().nonnegative(),
      window: z.object({ since: z.string().date(), until: z.string().date() }),
    }),
    used: z.enum(['spreadsheet', 'platform']),
    fallbackReason: z.enum(['none', 'coverage', 'error']),
    /** The day range replaced whole in portfolio_conversions_daily; null when nothing valid. */
    replaced: z.object({ since: z.string().date(), until: z.string().date() }).nullable(),
    unmatchedSamples: z.array(SheetUnmatchedSampleSchema).max(SHEET_UNMATCHED_SAMPLE_LIMIT),
    errors: z.array(SheetRowErrorSchema),
  })
  .superRefine((report, ctx) => {
    if (report.rowsMatched + report.rowsUnmatched + report.rowsInvalid !== report.rowsRead) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'every row read is matched, unmatched or invalid — none dropped silently',
      });
    }
    if (report.matchedBy.id + report.matchedBy.name !== report.rowsMatched) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['matchedBy'],
        message: 'matchedBy.id + matchedBy.name must equal rowsMatched (utm is a subset)',
      });
    }
    if ((report.used === 'platform') === (report.fallbackReason === 'none')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallbackReason'],
        message: 'a fallback to platform names its reason; a used sheet has none',
      });
    }
  });
export type SheetSyncReport = z.infer<typeof SheetSyncReportSchema>;

export const SheetColumnRoleSchema = z.enum([
  'date',
  'matchKey',
  'conversions',
  'value',
  'platform',
]);
export type SheetColumnRole = z.infer<typeof SheetColumnRoleSchema>;

/** One guess of the mapping step: which column plays a role, and how sure the guess is. */
export const SheetColumnSuggestionSchema = z.object({
  column: z.number().int().min(0),
  header: z.string(),
  confidence: z.number().min(0).max(1),
});
export type SheetColumnSuggestion = z.infer<typeof SheetColumnSuggestionSchema>;

export const SheetHeaderSuggestionSchema = z.object({
  headerRow: z.number().int().min(1),
  headers: z.array(z.string()),
  columns: z.object({
    date: SheetColumnSuggestionSchema.nullable(),
    matchKey: SheetColumnSuggestionSchema.nullable(),
    conversions: SheetColumnSuggestionSchema.nullable(),
    value: SheetColumnSuggestionSchema.nullable(),
    platform: SheetColumnSuggestionSchema.nullable(),
  }),
  matchKeyKind: SheetMatchKeyKindSchema.nullable(),
  dateFormat: SheetDateFormatSchema.nullable(),
});
export type SheetHeaderSuggestion = z.infer<typeof SheetHeaderSuggestionSchema>;

// ── The Frontend's calls to the sheet source ──────────────────────────────────────────────
// Reading a sheet (Google token, CSV parsing, header guess, matching against the portfolio)
// happens in the Optimizer service; the browser reaches it through one edge function, the
// way every other optimizer call does. Saving the mapping is optimizer_upsert_sheet_attribution_source.

/** The edge function the Manage panel's Attribution section calls. */
export const SHEET_ATTRIBUTION_EDGE = 'optimizer-attribution-sheet';

/** Data rows the mapping step previews under the header. */
export const SHEET_PREVIEW_ROW_LIMIT = 5;

/** A CSV the browser hands over whole. 2 MB holds years of daily rows. */
export const SHEET_CSV_MAX_CHARS = 2_000_000;

const sheetLocationShape = {
  portfolioId: z.string().uuid(),
  source: SheetSourceSchema,
  spreadsheetId: z.string().trim().min(1).optional(),
  tab: z.string().trim().min(1).optional(),
  integrationId: z.string().uuid().optional(),
  csv: z.string().max(SHEET_CSV_MAX_CHARS).optional(),
};

/** inspect: the tabs, the first rows and the header guess. Reads only. */
export const SheetInspectRequestSchema = z.object({
  action: z.literal('inspect'),
  ...sheetLocationShape,
});
export type SheetInspectRequest = z.infer<typeof SheetInspectRequestSchema>;

export const SheetInspectResponseSchema = z.object({
  /** Every tab of a Google Sheet; empty for a CSV. */
  tabs: z.array(z.string()),
  /** The tab read; null for a CSV. */
  tab: z.string().nullable(),
  suggestion: SheetHeaderSuggestionSchema,
  /** The first data rows under the header, cells as the sheet shows them. */
  preview: z.array(z.array(z.string())).max(SHEET_PREVIEW_ROW_LIMIT),
});
export type SheetInspectResponse = z.infer<typeof SheetInspectResponseSchema>;

/** check: read and match with a mapping, write nothing. Answers a SheetSyncReport. */
export const SheetCheckRequestSchema = z.object({
  action: z.literal('check'),
  portfolioId: z.string().uuid(),
  config: SheetAttributionConfigSchema,
  csv: z.string().max(SHEET_CSV_MAX_CHARS).optional(),
});
export type SheetCheckRequest = z.input<typeof SheetCheckRequestSchema>;

/** sync: re-read the saved source now and replace its days. Answers a SheetSyncReport. */
export const SheetSyncRequestSchema = z.object({
  action: z.literal('sync'),
  portfolioId: z.string().uuid(),
  csv: z.string().max(SHEET_CSV_MAX_CHARS).optional(),
});
export type SheetSyncRequest = z.infer<typeof SheetSyncRequestSchema>;

export const SheetAttributionRequestSchema = z.discriminatedUnion('action', [
  SheetInspectRequestSchema,
  SheetCheckRequestSchema,
  SheetSyncRequestSchema,
]);
export type SheetAttributionRequest = z.input<typeof SheetAttributionRequestSchema>;
