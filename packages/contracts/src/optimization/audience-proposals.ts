// Audience proposals: what the optimizer's daily audience analysis produces for an ad set
// that fired F2 (frequency saturation) or F3 (reach exhausted), how a person approves it,
// and what the worker read back from Meta after creating the new ad set.
//
// One row per (portfolio, ad set, trigger, day) in optimizer.audience_proposals, reached only
// through optimizer_* RPCs. The recommendation row stays pending the whole time (the queue
// lists pending rows only); the proposal carries the state.

import { z } from 'zod';
import {
  audienceExpansionOptionSchema,
  audienceSizeEstimateSchema,
} from '../audience-intel/expansion';
import { metaTargetingSpecSchema } from '../paid/meta-targeting';

export const audienceProposalStatusSchema = z.enum([
  'queued',
  'proposing',
  'ready',
  'blocked',
  'approved',
  'executing',
  'executed',
  'activate_requested',
  'activating',
  'undo_requested',
  'undoing',
  'undone',
  'failed',
  'cancelled',
  'superseded',
]);
export type AudienceProposalStatus = z.infer<typeof audienceProposalStatusSchema>;

/** Statuses during which the row owns the ad set's audience decision — the sweep must not
 *  open a second proposal beside one of these. */
export const AUDIENCE_PROPOSAL_LIVE_STATUSES: readonly AudienceProposalStatus[] = [
  'queued',
  'proposing',
  'ready',
  'blocked',
  'approved',
  'executing',
  'activate_requested',
  'activating',
  'undo_requested',
  'undoing',
];

export const audienceProposalModeSchema = z.enum(['replace', 'add']);
export type AudienceProposalMode = z.infer<typeof audienceProposalModeSchema>;

export const audienceProposalTriggerSchema = z.enum([
  'F2_audience_saturation',
  'F3_audience_exhausted',
]);

export const audienceProposalBlockSchema = z
  .object({
    code: z.enum([
      'cbo_campaign',
      'source_not_active',
      'no_creatives',
      'no_verified_options',
      'no_budget_headroom',
      'billing_event_underivable',
      'special_ad_category',
      'targeting_unavailable',
    ]),
    message: z.string().min(1),
    campaign_id: z.string().nullable().default(null),
    campaign_name: z.string().nullable().default(null),
  })
  .loose();
export type AudienceProposalBlock = z.infer<typeof audienceProposalBlockSchema>;

export const audienceProposalCreativeSchema = z.object({
  ad_id: z.string(),
  ad_name: z.string().nullable().default(null),
  creative_row_id: z.string().nullable().default(null),
  /** Meta creative id — the only thing `createAd` needs to reuse it. */
  creative_id: z.string(),
  source_adset_id: z.string(),
  source_adset_name: z.string().nullable().default(null),
  cost_per_event: z.number().nullable().default(null),
  events: z.number().nonnegative().default(0),
  spend: z.number().nonnegative().default(0),
  poster_url: z.string().nullable().default(null),
  rank: z.number().int().positive(),
});
export type AudienceProposalCreative = z.infer<typeof audienceProposalCreativeSchema>;

export const audienceProposalBudgetSchema = z.object({
  suggested_minor_units: z.number().int().nonnegative(),
  currency: z.string(),
  source: z.enum(['source_adset', 'jaina_bounded']),
  bounds: z.object({
    min_minor_units: z.number().int().nonnegative(),
    max_minor_units: z.number().int().nonnegative(),
  }),
  /** Why the bound is what it is: "portfolio total $500/day, $410 already assigned". */
  note: z.string().nullable().default(null),
});
export type AudienceProposalBudget = z.infer<typeof audienceProposalBudgetSchema>;

export const audienceProposalSourceSchema = z.object({
  adset_id: z.string(),
  adset_name: z.string().nullable().default(null),
  campaign_id: z.string(),
  campaign_name: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
  optimization_goal: z.string().nullable().default(null),
  billing_event: z.string().nullable().default(null),
  promoted_object: z.record(z.string(), z.unknown()).nullable().default(null),
  placements: z.record(z.string(), z.unknown()).nullable().default(null),
  daily_budget_minor_units: z.number().int().nonnegative().nullable().default(null),
  is_cbo: z.boolean().default(false),
  audience_type: z.string().nullable().default(null),
});

export const audienceProposalReachSchema = z.object({
  current: audienceSizeEstimateSchema.nullable().default(null),
  proposed: audienceSizeEstimateSchema.nullable().default(null),
  estimated_at: z.string().nullable().default(null),
});

/** The plan: everything the card renders and everything the worker writes. */
export const audienceProposalPlanSchema = z.object({
  version: z.literal(1),
  mode: audienceProposalModeSchema,
  trigger: audienceProposalTriggerSchema,
  diagnosis: z.string().min(1),
  rationale: z.string().min(1),
  previous_spec: metaTargetingSpecSchema,
  previous_spec_hash: z.string().min(1),
  options: z.array(audienceExpansionOptionSchema),
  chosen_option_ids: z.array(z.string()),
  targeting_spec: metaTargetingSpecSchema,
  advantage_audience: z.object({ enabled: z.boolean(), rationale: z.string() }),
  reach: audienceProposalReachSchema,
  budget: audienceProposalBudgetSchema,
  adset_name: z.string().min(1),
  creatives: z.array(audienceProposalCreativeSchema),
  creatives_disclosure: z.string(),
  source: audienceProposalSourceSchema,
  grounded_on: z.array(z.string()).default([]),
  disclosure: z.string().default(''),
  prompt_version: z.string().default('v1'),
});
export type AudienceProposalPlan = z.infer<typeof audienceProposalPlanSchema>;

/** What the person decided on the card. */
export const audienceProposalApprovalSchema = z.object({
  budget_minor_units: z.number().int().nonnegative(),
  activate: z.boolean(),
  mode: audienceProposalModeSchema,
});
export type AudienceProposalApproval = z.infer<typeof audienceProposalApprovalSchema>;

const readBackAdsetSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().default(null),
    status: z.string().nullable().default(null),
    effective_status: z.string().nullable().default(null),
    daily_budget: z.string().nullable().default(null),
    optimization_goal: z.string().nullable().default(null),
    billing_event: z.string().nullable().default(null),
    bid_strategy: z.string().nullable().default(null),
    targeting: metaTargetingSpecSchema.nullable().default(null),
    promoted_object: z.record(z.string(), z.unknown()).nullable().default(null),
  })
  .loose();

const readBackAdSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().default(null),
    status: z.string().nullable().default(null),
    effective_status: z.string().nullable().default(null),
    creative_id: z.string().nullable().default(null),
    thumbnail_url: z.string().nullable().default(null),
    source_adset_id: z.string().nullable().default(null),
    source_adset_name: z.string().nullable().default(null),
  })
  .loose();

/** Everything as READ BACK from Meta after the writes — never the intent. */
export const audienceProposalResultSchema = z
  .object({
    read_back_at: z.string().nullable().default(null),
    campaign: z
      .object({
        id: z.string(),
        name: z.string().nullable().default(null),
        status: z.string().nullable().default(null),
      })
      .loose()
      .nullable()
      .default(null),
    adset: readBackAdsetSchema.nullable().default(null),
    ads: z.array(readBackAdSchema).default([]),
    source_adset: z
      .object({
        id: z.string(),
        name: z.string().nullable().default(null),
        prior_status: z.string().nullable().default(null),
        status_after: z.string().nullable().default(null),
        paused: z.boolean().default(false),
        note: z.string().nullable().default(null),
      })
      .nullable()
      .default(null),
    activation: z
      .object({
        requested: z.boolean(),
        adset_status_after: z.string().nullable().default(null),
        ads_status_after: z.array(z.string()).default([]),
        note: z.string().nullable().default(null),
      })
      .nullable()
      .default(null),
    advantage_audience_written: z.boolean().nullable().default(null),
    ads_manager_urls: z
      .object({
        campaign: z.string().nullable().default(null),
        adset: z.string().nullable().default(null),
        ads: z.array(z.string()).default([]),
      })
      .nullable()
      .default(null),
  })
  .loose();
export type AudienceProposalResult = z.infer<typeof audienceProposalResultSchema>;

export const audienceProposalUndoResultSchema = z
  .object({
    read_back_at: z.string().nullable().default(null),
    new_adset_status: z.string().nullable().default(null),
    new_ads_status: z.array(z.string()).default([]),
    source_adset_status: z.string().nullable().default(null),
    note: z.string().nullable().default(null),
  })
  .loose();
export type AudienceProposalUndoResult = z.infer<typeof audienceProposalUndoResultSchema>;

/** One row of optimizer_get_audience_proposals. Lenient on the jsonb columns: a row with a
 *  malformed plan still lists (the card says so) instead of hiding every other row. */
export const audienceProposalRowSchema = z
  .object({
    id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
    brand_id: z.string().uuid(),
    ad_account_id: z.string(),
    campaign_id: z.string().nullable().default(null),
    adset_id: z.string(),
    trigger: z.string(),
    kind: z.string().default('audience_expand'),
    recommendation_id: z.string().uuid().nullable().default(null),
    cycle_run_id: z.string().uuid().nullable().default(null),
    utc_day: z.string(),
    status: audienceProposalStatusSchema,
    requested_via: z.enum(['cycle', 'human']).default('cycle'),
    requested_by: z.string().uuid().nullable().default(null),
    attempts: z.number().int().nonnegative().default(0),
    proposal: z.record(z.string(), z.unknown()).nullable().default(null),
    proposal_built_at: z.string().nullable().default(null),
    blocked_by: z.record(z.string(), z.unknown()).nullable().default(null),
    approved_at: z.string().nullable().default(null),
    approved_by: z.string().uuid().nullable().default(null),
    approval: z.record(z.string(), z.unknown()).nullable().default(null),
    result: z.record(z.string(), z.unknown()).nullable().default(null),
    executed_at: z.string().nullable().default(null),
    undo_requested_at: z.string().nullable().default(null),
    undo_result: z.record(z.string(), z.unknown()).nullable().default(null),
    undone_at: z.string().nullable().default(null),
    error: z.record(z.string(), z.unknown()).nullable().default(null),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .loose();
export type AudienceProposalRow = z.infer<typeof audienceProposalRowSchema>;

export function readProposalPlan(
  row: Pick<AudienceProposalRow, 'proposal'>,
): AudienceProposalPlan | null {
  const parsed = audienceProposalPlanSchema.safeParse(row.proposal);
  return parsed.success ? parsed.data : null;
}

export function readProposalBlock(
  row: Pick<AudienceProposalRow, 'blocked_by'>,
): AudienceProposalBlock | null {
  const parsed = audienceProposalBlockSchema.safeParse(row.blocked_by);
  return parsed.success ? parsed.data : null;
}

export function readProposalResult(
  row: Pick<AudienceProposalRow, 'result'>,
): AudienceProposalResult | null {
  const parsed = audienceProposalResultSchema.safeParse(row.result);
  return parsed.success ? parsed.data : null;
}

export type AudienceProposalCardState =
  | 'none'
  | 'queued'
  | 'proposing'
  | 'blocked_cbo'
  | 'blocked'
  | 'ready'
  | 'approved'
  | 'executing'
  | 'executed'
  | 'switching'
  | 'undoing'
  | 'undone'
  | 'failed';

/** What the card shows for a row; `none` for the terminal states that no longer own the
 *  decision (cancelled, superseded) so the card offers a fresh analysis. */
export function audienceProposalCardState(
  row: Pick<AudienceProposalRow, 'status' | 'blocked_by'> | null | undefined,
): AudienceProposalCardState {
  if (!row) return 'none';
  switch (row.status) {
    case 'queued':
      return 'queued';
    case 'proposing':
      return 'proposing';
    case 'blocked':
      return readProposalBlock(row)?.code === 'cbo_campaign' ? 'blocked_cbo' : 'blocked';
    case 'ready':
      return 'ready';
    case 'approved':
      return 'approved';
    case 'executing':
      return 'executing';
    case 'executed':
      return 'executed';
    case 'activate_requested':
    case 'activating':
      return 'switching';
    case 'undo_requested':
    case 'undoing':
      return 'undoing';
    case 'undone':
      return 'undone';
    case 'failed':
      return 'failed';
    default:
      return 'none';
  }
}

/** The newest row that speaks for this recommendation: by recommendation id first, then
 *  by (ad set, trigger). Terminal rows count only when nothing live exists. */
export function proposalForRecommendation(
  rows: readonly AudienceProposalRow[],
  rec: { id: string; adset_id: string; trigger: string },
): AudienceProposalRow | null {
  const candidates = rows.filter(
    (row) =>
      row.recommendation_id === rec.id ||
      (row.adset_id === rec.adset_id && row.trigger === rec.trigger),
  );
  if (candidates.length === 0) return null;
  const live = candidates.filter((row) =>
    (AUDIENCE_PROPOSAL_LIVE_STATUSES as readonly string[]).includes(row.status),
  );
  const pool = live.length > 0 ? live : candidates.filter((row) => row.status !== 'superseded');
  const sorted = [...(pool.length > 0 ? pool : candidates)].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
  return sorted[0] ?? null;
}

export function clampBudgetMinorUnits(
  value: number,
  bounds: { min_minor_units: number; max_minor_units: number },
): number {
  const rounded = Math.round(value);
  return Math.min(bounds.max_minor_units, Math.max(bounds.min_minor_units, rounded));
}

/** Ads Manager deep links. `act` wants the numeric account id without the `act_` prefix. */
export function adsManagerUrls(input: {
  adAccountId: string;
  campaignId?: string | null;
  adsetId?: string | null;
  adIds?: readonly string[];
}): { campaign: string | null; adset: string | null; ads: string[] } {
  const act = input.adAccountId.replace(/^act_/, '');
  const base = `https://adsmanager.facebook.com/adsmanager/manage`;
  const campaign = input.campaignId
    ? `${base}/campaigns?act=${act}&selected_campaign_ids=${input.campaignId}`
    : null;
  const adset =
    input.campaignId && input.adsetId
      ? `${base}/adsets?act=${act}&selected_campaign_ids=${input.campaignId}&selected_adset_ids=${input.adsetId}`
      : null;
  const ads =
    input.adsetId && input.adIds && input.adIds.length > 0
      ? input.adIds.map(
          (adId) =>
            `${base}/ads?act=${act}&selected_adset_ids=${input.adsetId}&selected_ad_ids=${adId}`,
        )
      : [];
  return { campaign, adset, ads };
}
