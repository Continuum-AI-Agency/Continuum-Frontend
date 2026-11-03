// What the Optimizer did while nobody was watching (H07, the Overnight Log).
//
// Each action carries the outcome it actually had — a write that failed reads `failed`, with the
// platform's reason, never `applied` — and the moves the autopilot held back because they were
// over the per-cycle change cap are listed apart under `capSkipped`. Read from
// public.optimizer_list_action_outcomes and served at HOME_READ_PATHS.overnightLog
// (GET ?brandId=&hours=, default the last 24 hours, 1..168).

import { z } from 'zod';
import { homeReadEnvelopeSchema, homeReadSourceSchema } from './envelope';

export const HOME_OVERNIGHT_DEFAULT_HOURS = 24;
export const HOME_OVERNIGHT_MAX_HOURS = 168;

export const homeOvernightOutcomeSchema = z.enum([
  /** The platform holds the change. */
  'applied',
  /** A write was attempted, or refused before writing, and did not land; `outcomeReason` says why. */
  'failed',
  /** A status write that paused an ad, ad set, campaign or group. */
  'paused',
  /** Something new was created and left paused for a person to switch on (an audience proposal). */
  'created_paused',
  /** Proposed and waiting for a person to approve it. */
  'pending_approval',
  /** Approved by a person and waiting for the executor to write it. */
  'queued',
  /** Applied, then reverted by a later write that points back at it. */
  'undone',
  /** Not written, on purpose (an approval voided, a batch refused); `outcomeReason` says why. */
  'skipped',
]);
export type HomeOvernightOutcome = z.infer<typeof homeOvernightOutcomeSchema>;

/** The ledger the action was read from — what a tap opens. */
export const homeOvernightEntrySourceSchema = z.enum([
  'apply_audit',
  'cycle_item',
  'action_ledger',
  'recommendation',
  'audience_proposal',
]);
export type HomeOvernightEntrySource = z.infer<typeof homeOvernightEntrySourceSchema>;

/** Who authorised it: the autopilot, a person, the Optimizer proposing, or a live bench run. */
export const homeOvernightActorSchema = z.enum(['autopilot', 'human', 'optimizer', 'bench']);
export type HomeOvernightActor = z.infer<typeof homeOvernightActorSchema>;

const isoInstant = z.string().datetime({ offset: true });
const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code');

/** Before → after of a write, when the ledger recorded one. Amounts are in minor units. */
export const homeOvernightChangeSchema = z.object({
  fromMinor: z.number().int().nullable(),
  toMinor: z.number().int().nullable(),
  /** Null on rows written before currency was recorded: omit the amount rather than assume one. */
  currency: currencySchema.nullable(),
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
});
export type HomeOvernightChange = z.infer<typeof homeOvernightChangeSchema>;

export const homeOvernightEntrySchema = z.object({
  id: z.string().min(1),
  at: isoInstant,
  source: homeOvernightEntrySourceSchema,
  /** budget | status | convert | bid | negatives | keyword | undo | audience, or a
   *  recommendation kind (pause, creative_refresh, …) for a proposal. */
  kind: z.string().min(1),
  /** One line naming what was acted on: the entity's name, else its id, else the portfolio. */
  title: z.string().min(1),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  outcome: homeOvernightOutcomeSchema,
  outcomeReason: z.string().nullable(),
  portfolioId: z.string().uuid().nullable(),
  portfolioName: z.string().nullable(),
  platform: z.string().nullable(),
  actor: homeOvernightActorSchema.nullable(),
  change: homeOvernightChangeSchema.nullable(),
  justification: z.string().nullable(),
});
export type HomeOvernightEntry = z.infer<typeof homeOvernightEntrySchema>;

const count = z.number().int().nonnegative();

/** Per outcome over EVERY action in the window, not only the listed ones. */
export const homeOvernightCountsSchema = z.object({
  applied: count,
  failed: count,
  paused: count,
  createdPaused: count,
  pendingApproval: count,
  queued: count,
  undone: count,
  skipped: count,
  /** = capSkipped.count. */
  skippedByCap: count,
});
export type HomeOvernightCounts = z.infer<typeof homeOvernightCountsSchema>;

/** A move the autopilot held instead of writing because it was over max_change_pct_per_cycle. */
export const homeOvernightCapItemSchema = z.object({
  id: z.string().min(1),
  at: isoInstant,
  portfolioId: z.string().uuid(),
  platform: z.string().nullable(),
  entityId: z.string().min(1),
  entityName: z.string().nullable(),
  /** The proposed change as a fraction (0.6 = +60%). */
  changePct: z.number().finite().nullable(),
  /** The solver bent the velocity cap on this item (ItemDiagnostics.capBreached). */
  capBreached: z.boolean(),
  reason: z.string().nullable(),
});
export type HomeOvernightCapItem = z.infer<typeof homeOvernightCapItemSchema>;

export const homeOvernightLogDataSchema = z.object({
  window: z.object({
    since: isoInstant,
    until: isoInstant,
    hours: z.number().int().min(1).max(HOME_OVERNIGHT_MAX_HOURS),
  }),
  /** Newest first, bounded; `truncated` says when the window held more than were listed. */
  entries: z.array(homeOvernightEntrySchema),
  counts: homeOvernightCountsSchema,
  /** The same actions per ledger they were read from; sums to `total`. */
  bySource: z.object({
    applyAudit: count,
    cycleItem: count,
    actionLedger: count,
    recommendation: count,
    audienceProposal: count,
  }),
  total: count,
  truncated: z.boolean(),
  capSkipped: z.object({ count, items: z.array(homeOvernightCapItemSchema) }),
  source: homeReadSourceSchema,
});
export type HomeOvernightLogData = z.infer<typeof homeOvernightLogDataSchema>;

export const homeOvernightLogReadSchema = homeReadEnvelopeSchema(homeOvernightLogDataSchema);
export type HomeOvernightLogRead = z.infer<typeof homeOvernightLogReadSchema>;
