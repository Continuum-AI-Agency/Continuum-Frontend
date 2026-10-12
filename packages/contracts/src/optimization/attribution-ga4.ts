// GA4 as a portfolio attribution source (decisiones 7, 20): the property's key events per day
// and session campaign, matched to the portfolio's entities on every platform.
// Design: docs/optimizer-multiplatform/portafolio-modelo.html §C.1 (GA4).
//
// Producer of the report: supabase/functions/google-analytics-metrics (report: 'attribution'),
// a GA4 Data API runReport by date × session source/medium/campaign × Google Ads campaign and
// ad group. Consumer: Continuum-Optimizer/src/multiplatform/attribution/ga4.ts, which writes
// optimizer.portfolio_conversions_daily. GA4 lags 24–48 h, so its window ends yesterday.

import { z } from 'zod';
import { SHEET_COVERAGE_THRESHOLD } from './attribution-sheet';

/** The dimensions of the attribution runReport, in the order the edge requests them. */
export const GA4_ATTRIBUTION_DIMENSIONS = [
  'date',
  'sessionSource',
  'sessionMedium',
  'sessionCampaignId',
  'sessionCampaignName',
  'sessionGoogleAdsCampaignId',
  'sessionGoogleAdsAdGroupId',
] as const;

/** A GA4 event name: letters, digits and underscores, starting with a letter. */
export const Ga4KeyEventSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'not a GA4 event name');

export const Ga4AttributionConfigSchema = z.object({
  source: z.literal('ga4'),
  /** The GA4 property id (digits only), one the brand's Google connection can read. */
  propertyId: z.string().trim().regex(/^\d+$/, 'a GA4 property id is digits only'),
  /** The key event counted as the conversion. Absent = every key event of the property. */
  keyEvent: Ga4KeyEventSchema.nullable().default(null),
});
export type Ga4AttributionConfig = z.infer<typeof Ga4AttributionConfigSchema>;
export type Ga4AttributionConfigInput = z.input<typeof Ga4AttributionConfigSchema>;

const day = z.string().date();
/** A dimension GA4 left empty — '(not set)', '(direct)', '' — is null, never a key. */
const dimension = z.string().min(1).nullable();

/** One runReport row: a day and a session campaign, with its key events and revenue. */
export const Ga4AttributionRowSchema = z.object({
  /** YYYY-MM-DD in the property's time zone. */
  date: day,
  source: dimension,
  medium: dimension,
  /** utm_id — where a {{adset.id}} / __AID__ URL macro lands. */
  campaignId: dimension,
  /** utm_campaign. */
  campaignName: dimension,
  /** Set by Google Ads auto-tagging (gclid). */
  googleAdsCampaignId: dimension,
  googleAdsAdGroupId: dimension,
  keyEvents: z.number().nonnegative(),
  /** totalRevenue in the property's currency; null when GA4 reported none. */
  revenue: z.number().nonnegative().nullable(),
  sessions: z.number().int().nonnegative(),
});
export type Ga4AttributionRow = z.infer<typeof Ga4AttributionRowSchema>;

/** The edge's answer to { report: 'attribution' }. */
export const Ga4AttributionReportSchema = z.object({
  property_id: z.string().regex(/^\d+$/),
  range: z.object({ since: day, until: day }).refine((r) => r.since <= r.until, {
    message: 'since after until',
  }),
  /** Always true: GA4 has no complete today, so the window is clamped to yesterday. */
  ends_yesterday: z.literal(true),
  key_event: z.string().nullable(),
  currency_code: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  time_zone: z.string().nullable(),
  /** Only rows with key events or revenue; a session that converted nothing attributes nothing. */
  rows: z.array(Ga4AttributionRowSchema),
  /** True when the property had more rows than the edge pages through. */
  truncated: z.boolean(),
});
export type Ga4AttributionReport = z.infer<typeof Ga4AttributionReportSchema>;

/** Same bar as the sheet: GA4 is used only when it covers this share of spending entities. */
export const GA4_COVERAGE_THRESHOLD = SHEET_COVERAGE_THRESHOLD;

export const Ga4UnmatchedSampleSchema = z.object({
  date: day,
  platform: z.enum(['meta', 'google_ads', 'tiktok_ads']),
  key: z.string(),
});
export type Ga4UnmatchedSample = z.infer<typeof Ga4UnmatchedSampleSchema>;

export const GA4_UNMATCHED_SAMPLE_LIMIT = 20;

export const Ga4SyncReportSchema = z
  .object({
    propertyId: z.string(),
    keyEvent: z.string().nullable(),
    /** Rows the report carried (each with key events or revenue). */
    rowsRead: z.number().int().nonnegative(),
    /** Rows from no ad platform of the portfolio (organic, direct, email…): not attributable. */
    rowsNotPaid: z.number().int().nonnegative(),
    rowsMatched: z.number().int().nonnegative(),
    /** Paid rows that named no entity: kept in the unmatched bucket of their platform. */
    rowsUnmatched: z.number().int().nonnegative(),
    matchedBy: z.object({
      /** Google Ads auto-tagging ids (sessionGoogleAdsAdGroupId / CampaignId). */
      googleAdsId: z.number().int().nonnegative(),
      /** utm_id filled by a URL macro ({{adset.id}}, __AID__, {{campaign.id}}). */
      utmId: z.number().int().nonnegative(),
      /** utm_campaign equal to an entity name. */
      name: z.number().int().nonnegative(),
    }),
    coverage: z.object({
      ratio: z.number().min(0).max(1),
      covered: z.number().int().nonnegative(),
      spending: z.number().int().nonnegative(),
      window: z.object({ since: day, until: day }),
    }),
    used: z.enum(['ga4', 'platform']),
    fallbackReason: z.enum(['none', 'coverage', 'error']),
    /** The day range fetched and replaced whole; it ends yesterday. */
    replaced: z.object({ since: day, until: day }),
    endsYesterday: z.literal(true),
    truncated: z.boolean(),
    unmatchedSamples: z.array(Ga4UnmatchedSampleSchema).max(GA4_UNMATCHED_SAMPLE_LIMIT),
  })
  .superRefine((report, ctx) => {
    if (report.rowsNotPaid + report.rowsMatched + report.rowsUnmatched !== report.rowsRead) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'every row read is not-paid, matched or unmatched — none dropped silently',
      });
    }
    const { googleAdsId, utmId, name } = report.matchedBy;
    if (googleAdsId + utmId + name !== report.rowsMatched) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['matchedBy'],
        message: 'matchedBy must add up to rowsMatched',
      });
    }
    if ((report.used === 'platform') === (report.fallbackReason === 'none')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallbackReason'],
        message: 'a fallback to platform names its reason; a used GA4 source has none',
      });
    }
  });
export type Ga4SyncReport = z.infer<typeof Ga4SyncReportSchema>;
