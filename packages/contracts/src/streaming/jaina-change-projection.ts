/**
 * The PROJECTED AFTER of a change Jaina proposes: what each affected campaign (or ad set, or
 * Google ad group) would look like if the change ran over the same window the evidence was
 * read in — spend, results, cost per result, share of the total — beside what it did.
 *
 * It rides inside `paid.live_change_preview` (./jaina-live-change) as `projection`, so the
 * Scale page's companion canvas opens on the proposal even when no gated edit tool was called
 * (Ramiro, 2026-11-01: "nunca abre el canvas ... ni muestra cómo se verían las campañas").
 * The same figures are the cells of a registered `table` dataset (`datasetId`), so the chat's
 * table and chart blocks and the canvas read one set of numbers; none is typed by a model.
 *
 * A PROJECTION, never a forecast, and the payload says so in every place it can be read:
 *   - `method` names the rule and `assumptions` states it in plain words, with the window;
 *   - an entity with too little evidence is listed in `gaps` and its `after` results are null
 *     — a missing number is never filled in;
 *   - where the method supports a range (an increase past what the platform's own velocity
 *     cap says the observed efficiency can be trusted for) `afterRange` carries it and the
 *     figure shown is the middle of that range.
 *
 * WIRE DTO policy of ./jaina-scaffold: `.passthrough()`, so a Backend that learns one more
 * field never breaks an older Frontend mid-deploy.
 */

import { z } from 'zod';

/** The one rule this contract version describes; a different rule is a different id. */
export const CHANGE_PROJECTION_METHOD_ID = 'observed_efficiency_capped_v1' as const;

export const CHANGE_PROJECTION_PLATFORMS = ['meta', 'google'] as const;
export const changeProjectionPlatformSchema = z.enum(CHANGE_PROJECTION_PLATFORMS);
export type ChangeProjectionPlatform = z.infer<typeof changeProjectionPlatformSchema>;

export const CHANGE_PROJECTION_LEVELS = ['campaign', 'adset', 'ad'] as const;
export const changeProjectionLevelSchema = z.enum(CHANGE_PROJECTION_LEVELS);
export type ChangeProjectionLevel = z.infer<typeof changeProjectionLevelSchema>;

/** What the change does to an entity's spend. `unchanged` is an entity read but not touched. */
export const CHANGE_PROJECTION_ACTIONS = ['increase', 'decrease', 'pause', 'unchanged'] as const;
export const changeProjectionActionSchema = z.enum(CHANGE_PROJECTION_ACTIONS);
export type ChangeProjectionAction = z.infer<typeof changeProjectionActionSchema>;

/**
 * One side of the comparison, over the window. Money is in major currency units. `null` is
 * "not known", never zero: a cell the evidence cannot fill stays null and is shown as such.
 */
export const projectionFiguresSchema = z.object({
  spend: z.number().nullable(),
  results: z.number().nullable(),
  costPerResult: z.number().nullable(),
  /** Conversion value when the read carried it (ROAS = value / spend). */
  value: z.number().nullable(),
  roas: z.number().nullable(),
  /** Fraction (0..1) of the compared set's spend. */
  share: z.number().nullable(),
});
export type ProjectionFigures = z.infer<typeof projectionFiguresSchema>;

export const projectionRangeSchema = z.object({
  resultsLow: z.number().nullable(),
  resultsHigh: z.number().nullable(),
});
export type ProjectionRange = z.infer<typeof projectionRangeSchema>;

export const projectionEntitySchema = z
  .object({
    /** The platform's id, the same one the live tree and the dataset row carry. */
    id: z.string().min(1),
    level: changeProjectionLevelSchema,
    name: z.string(),
    platform: changeProjectionPlatformSchema,
    action: changeProjectionActionSchema,
    /** The change in words, e.g. "+20% daily spend" or "pause". */
    changeLabel: z.string(),
    before: projectionFiguresSchema,
    after: projectionFiguresSchema,
    /** Null on a decrease or a pause: the method gives one answer there. */
    afterRange: projectionRangeSchema.nullable(),
    /** Why `after.results` is null, or a caveat on a figure that is not. */
    note: z.string().nullable(),
  })
  .passthrough();
export type ProjectionEntity = z.infer<typeof projectionEntitySchema>;

export const projectionGapSchema = z.object({
  /** The id or name the change named. */
  entity: z.string(),
  reason: z.string(),
});
export type ProjectionGap = z.infer<typeof projectionGapSchema>;

/** Dates are null when the read named its window only by a label ("last_30d"). */
export const projectionWindowSchema = z.object({
  since: z.string().nullable(),
  until: z.string().nullable(),
  days: z.number().int().positive(),
  label: z.string().nullable(),
});
export type ProjectionWindow = z.infer<typeof projectionWindowSchema>;

export const changeProjectionSchema = z
  .object({
    method: z.object({
      id: z.literal(CHANGE_PROJECTION_METHOD_ID),
      label: z.string(),
      summary: z.string(),
    }),
    platform: changeProjectionPlatformSchema,
    window: projectionWindowSchema,
    currency: z.string().nullable(),
    /** The result the figures count: "Leads", "Conversations", "Purchases", "Conversions". */
    resultLabel: z.string(),
    /** Every entity of the compared set, the touched ones marked by `action`. */
    entities: z.array(projectionEntitySchema).min(1),
    totals: z.object({
      before: projectionFiguresSchema,
      after: projectionFiguresSchema,
      afterRange: projectionRangeSchema.nullable(),
    }),
    /** The rule in plain sentences, window included. Always at least one. */
    assumptions: z.array(z.string()).min(1),
    /** Changes the evidence could not carry (an entity not read, an ambiguous name). */
    gaps: z.array(projectionGapSchema),
    /** The registered `table` dataset whose cells these figures are. */
    datasetId: z.string().min(1),
    /** The datasets the observed side was read from. */
    sourceDatasetIds: z.array(z.string()),
  })
  .passthrough();
export type ChangeProjection = z.infer<typeof changeProjectionSchema>;

/** The `approvalId` of a preview that has no approval: a proposal made in the answer. */
export const PROPOSAL_APPROVAL_ID_PREFIX = 'proposal:' as const;

export function proposalApprovalId(proposalId: string): string {
  return `${PROPOSAL_APPROVAL_ID_PREFIX}${proposalId}`;
}

export function isProposalApprovalId(approvalId: string): boolean {
  return approvalId.startsWith(PROPOSAL_APPROVAL_ID_PREFIX);
}

/** Where a proposal that called no gated tool is listed in the thread: one part per proposal. */
export function changeProjectionPartId(proposalId: string): string {
  return `change-projection:${proposalId}`;
}

/** The dataset columns the projection table carries, in the order a reader scans them. */
export const CHANGE_PROJECTION_COLUMN_KEYS = [
  'entity',
  'change',
  'spend_before',
  'spend_after',
  'results_before',
  'results_after',
  'cost_before',
  'cost_after',
  'share_before',
  'share_after',
] as const;
