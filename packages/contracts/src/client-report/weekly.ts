import { z } from 'zod';

/**
 * The weekly client performance report: the report Mich, Ramiro and Alexia used to write by hand
 * (#melgators-workshop, 2026-11-24), as one payload the Backend composes and every surface reads —
 * the shareable HTML, the email draft, the Slack review post and, later, the Performance module.
 *
 * Every number is computed by the Backend from a named read (`source`); no prose here carries a
 * number the payload does not hold, and no model writes any of it.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);

export const clientReportWindowSchema = z.object({ since: isoDate, until: isoDate });
export type ClientReportWindow = z.infer<typeof clientReportWindowSchema>;

export const CLIENT_REPORT_LANGUAGES = ['es', 'en'] as const;
export const clientReportLanguageSchema = z.enum(CLIENT_REPORT_LANGUAGES);
export type ClientReportLanguage = z.infer<typeof clientReportLanguageSchema>;

/**
 * The metrics a brand can be reported (and targeted) on. A brand reports the ones it has data
 * for; `brand_report_targets.metric` takes the same keys.
 */
export const CLIENT_REPORT_METRICS = [
  'spend',
  'leads',
  'cpl',
  'tours',
  'lead_to_tour',
  'altas',
  'cost_per_alta',
  'attendance',
  'sales',
] as const;
export const clientReportMetricKeySchema = z.enum(CLIENT_REPORT_METRICS);
export type ClientReportMetricKey = z.infer<typeof clientReportMetricKeySchema>;

export const clientReportRangeSchema = z.object({
  low: z.number(),
  mid: z.number(),
  high: z.number(),
});
export type ClientReportRange = z.infer<typeof clientReportRangeSchema>;

export const clientReportSourceSchema = z.object({
  /** The table, RPC or tool the figure was read from. */
  tool: z.string().min(1),
  /** How the figure is counted from it, in one line. */
  definition: z.string().min(1),
});

export const clientReportMetricSchema = z.object({
  key: clientReportMetricKeySchema,
  unit: z.enum(['money', 'count', 'ratio']),
  lower_is_better: z.boolean(),
  source: clientReportSourceSchema,
  /** Last day of complete data for this metric; its windows end here when the week runs past it. */
  data_through: isoDate,
  /** `semi_monthly`: posted on the 1st and the 15th (Poliwin altas) — no week-over-week. */
  cadence: z.enum(['daily', 'semi_monthly']),
  week: z.object({
    window: clientReportWindowSchema,
    prior_window: clientReportWindowSchema,
    value: z.number().nullable(),
    prior: z.number().nullable(),
    /** (value − prior) ÷ prior. Null when either side is null or the prior is zero. */
    change: z.number().nullable(),
  }),
  month: z.object({
    window: clientReportWindowSchema,
    /** The same days of the month before: the "same point last month". */
    prior_window: clientReportWindowSchema,
    value: z.number().nullable(),
    prior: z.number().nullable(),
    change: z.number().nullable(),
  }),
  target: z
    .object({
      month: yearMonth,
      value: z.number(),
      /** Forecast mid ÷ target − 1; null without a month-end forecast. */
      forecast_gap: z.number().nullable(),
    })
    .nullable(),
  next_target: z.object({ month: yearMonth, value: z.number() }).nullable(),
  forecast: z.object({
    month_end: clientReportRangeSchema.nullable(),
    next_month: clientReportRangeSchema.nullable(),
  }),
});
export type ClientReportMetric = z.infer<typeof clientReportMetricSchema>;

export const CLIENT_REPORT_CHANGE_KINDS = [
  'campaign_stopped',
  'campaign_started',
  'campaign_not_active',
  'budget_gap',
  'offer_change',
  'data_gap',
] as const;

export const clientReportChangeSchema = z.object({
  kind: z.enum(CLIENT_REPORT_CHANGE_KINDS),
  /** Composed by the Backend from the figures below. */
  text: z.string().min(1),
  /** Why it matters, one line. */
  impact: z.string().min(1),
  source: z.string().min(1),
});
export type ClientReportChange = z.infer<typeof clientReportChangeSchema>;

export const clientReportRecommendationSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  severity: z.enum(['critical', 'warning', 'info']),
  source: z.string().min(1),
});
export type ClientReportRecommendation = z.infer<typeof clientReportRecommendationSchema>;

export const clientReportAskSchema = z.object({
  text: z.string().min(1),
  reason: z.string().min(1),
});

/**
 * A source that stopped short of the week: its figures end at `data_through` (null when it could
 * not be read at all). Every surface leads with these, so a stale number is never read as current.
 */
export const clientReportStaleSourceSchema = z.object({
  source: z.string().min(1),
  data_through: isoDate.nullable(),
  last_error_at: z.string().nullable(),
  metrics: z.array(clientReportMetricKeySchema),
});
export type ClientReportStaleSource = z.infer<typeof clientReportStaleSourceSchema>;

export const weeklyClientReportSchema = z.object({
  version: z.literal(1),
  generated_at: z.string().min(1),
  brand: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    language: clientReportLanguageSchema,
    timezone: z.string().min(1),
    currency: z.string().min(1),
  }),
  /** The last complete Monday–Sunday week in the brand's zone. */
  week: clientReportWindowSchema,
  month: yearMonth,
  next_month: yearMonth,
  metrics: z.array(clientReportMetricSchema).min(1),
  forecast_method: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    interval: z.string().min(1),
  }),
  changes: z.array(clientReportChangeSchema),
  recommendations: z.array(clientReportRecommendationSchema),
  client_asks: z.array(clientReportAskSchema),
  stale_sources: z.array(clientReportStaleSourceSchema),
  /** What the report could not read, by name. Empty when everything was read. */
  gaps: z.array(z.string().min(1)),
});
export type WeeklyClientReport = z.infer<typeof weeklyClientReportSchema>;

/** The reviewed-draft bundle: what goes to the review thread, never straight to the client. */
export const weeklyClientReportDraftSchema = z.object({
  report: weeklyClientReportSchema,
  email: z.object({ subject: z.string().min(1), body: z.string().min(1) }),
  slack_text: z.string().min(1),
});
export type WeeklyClientReportDraft = z.infer<typeof weeklyClientReportDraftSchema>;

// ---- HTTP (Backend `/api/client-reports`, Frontend Performance → Reports) -------------------

/** A stored report is a `draft` until Continuum staff review it; only a reviewed one is shared. */
export const CLIENT_REPORT_STATUSES = ['draft', 'reviewed'] as const;
export const clientReportStatusSchema = z.enum(CLIENT_REPORT_STATUSES);
export type ClientReportStatus = z.infer<typeof clientReportStatusSchema>;

export const clientReportSummarySchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  week: clientReportWindowSchema,
  status: clientReportStatusSchema,
  generated_at: z.string().min(1),
  reviewed_at: z.string().nullable(),
  stale_sources: z.number().int().min(0),
});
export type ClientReportSummary = z.infer<typeof clientReportSummarySchema>;

export const clientReportListResponseSchema = z.object({
  reports: z.array(clientReportSummarySchema),
  /** Continuum staff: sees drafts, reviews, generates and shares. */
  can_review: z.boolean(),
  /** Staff or a brand owner/admin: sets the monthly targets. */
  can_set_targets: z.boolean(),
});
export type ClientReportListResponse = z.infer<typeof clientReportListResponseSchema>;

export const clientReportDetailResponseSchema = z.object({
  summary: clientReportSummarySchema,
  draft: weeklyClientReportDraftSchema,
});
export type ClientReportDetailResponse = z.infer<typeof clientReportDetailResponseSchema>;

export const CLIENT_REPORT_SHARE_MAX_DAYS = 30;
export const clientReportShareRequestSchema = z.object({
  days: z.number().int().min(1).max(CLIENT_REPORT_SHARE_MAX_DAYS).default(14),
});
export const clientReportShareResponseSchema = z.object({
  /** Backend path of the read-only page; the caller prefixes its API origin. */
  path: z.string().startsWith('/api/client-reports/shared/'),
  expires_at: z.string().min(1),
});
export type ClientReportShareResponse = z.infer<typeof clientReportShareResponseSchema>;

export const clientReportTargetSchema = z.object({
  month: yearMonth,
  metric: clientReportMetricKeySchema,
  value: z.number().min(0),
});
export type ClientReportTarget = z.infer<typeof clientReportTargetSchema>;

export const clientReportTargetsResponseSchema = z.object({
  targets: z.array(clientReportTargetSchema),
});
export type ClientReportTargetsResponse = z.infer<typeof clientReportTargetsResponseSchema>;

/** One month's targets; a null value clears that metric's target. */
export const clientReportTargetsUpdateSchema = z.object({
  month: yearMonth,
  targets: z
    .array(z.object({ metric: clientReportMetricKeySchema, value: z.number().min(0).nullable() }))
    .min(1),
});
export type ClientReportTargetsUpdate = z.infer<typeof clientReportTargetsUpdateSchema>;
