// The platform-neutral optimizer action: what the engine proposes, a human approves, and a
// per-platform applier executes (preflight -> reserve -> read expected -> write -> read
// back -> confirm). Every action names its entity with an EntityRef, so the applier is
// chosen by ref.platform and never by the portfolio.
//
// Standalone for now: Recommendation rows, the apply routes and the audit schema in
// service.ts adopt these shapes in a later wave.
// Design: docs/optimizer-multiplatform/google-acciones.html §2, §5 and §6; tiktok.html §3.6.

import { z } from 'zod';
import {
  BudgetRefSchema,
  CurrencyCodeSchema,
  EntityRefSchema,
  EntityStatusSchema,
} from '../paid/platform';

export const SetStatusActionSchema = z.object({
  kind: z.literal('set_status'),
  ref: EntityRefSchema,
  /** The status the human saw; the applier refuses with `drifted` if it changed since. */
  expected: EntityStatusSchema,
  // Pausing is the only status write. Removal is irreversible on Google and TikTok, and
  // re-activating is a decision for a person in the platform, not for the optimizer.
  target: z.literal('paused'),
});
export type SetStatusAction = z.infer<typeof SetStatusActionSchema>;

const ownerOnSamePlatform = {
  message: 'the budget owner must be on the same platform as the entity',
  path: ['budget', 'ownerRef', 'platform'],
};

export const SetBudgetActionSchema = z
  .object({
    kind: z.literal('set_budget'),
    ref: EntityRefSchema,
    /** The budget as read, in ledger (ISO minor) units. */
    budget: BudgetRefSchema,
    expectedMinor: z.number().int().nonnegative(),
    targetMinor: z.number().int().nonnegative(),
  })
  .refine((action) => action.budget.ownerRef.platform === action.ref.platform, ownerOnSamePlatform);
export type SetBudgetAction = z.infer<typeof SetBudgetActionSchema>;

/** tCPA travels in micros of the account currency, tROAS as a ratio (3.5 = 350%). */
export const BidTargetFieldSchema = z.enum(['target_cpa_micros', 'target_roas']);

export const SetBidTargetActionSchema = z.object({
  kind: z.literal('set_bid_target'),
  ref: EntityRefSchema,
  field: BidTargetFieldSchema,
  expected: z.number().positive(),
  target: z.number().positive(),
});
export type SetBidTargetAction = z.infer<typeof SetBidTargetActionSchema>;

export const NegativeMatchTypeSchema = z.enum(['EXACT', 'PHRASE', 'BROAD']);

const MAX_NEGATIVE_WORDS = 10;

/** Google's keyword limits: 80 characters and 10 words. */
export const NegativeTermSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((text) => text.split(/\s+/).length <= MAX_NEGATIVE_WORDS, 'at most 10 words'),
  matchType: NegativeMatchTypeSchema,
});

export const AddNegativesActionSchema = z.object({
  kind: z.literal('add_negatives'),
  ref: EntityRefSchema,
  terms: z.array(NegativeTermSchema).min(1),
  scope: z.enum(['campaign', 'ad_group', 'shared_set']),
});
export type AddNegativesAction = z.infer<typeof AddNegativesActionSchema>;

const budgetDelta = (leg: SetBudgetAction): number => leg.targetMinor - leg.expectedMinor;

/** Every leg moves money: no zero-delta legs, all decreases before any increase. */
function decreasesFirst(legs: SetBudgetAction[]): boolean {
  const deltas = legs.map(budgetDelta);
  if (deltas.some((delta) => delta === 0)) return false;
  const firstIncrease = deltas.findIndex((delta) => delta > 0);
  return firstIncrease > 0 && deltas.slice(firstIncrease).every((delta) => delta > 0);
}

/** One approval, several legs: budget comes OFF first, so a failure between legs leaves the
 *  client spending less, never more. Each leg keeps its own ledger row (move_id + leg index)
 *  and stays revertible on its own. MVP: one currency per move. */
export const BudgetMoveActionSchema = z
  .object({
    kind: z.literal('budget_move'),
    moveId: z.string().uuid(),
    currency: CurrencyCodeSchema,
    legs: z.array(SetBudgetActionSchema).min(2),
  })
  .refine((move) => move.legs.every((leg) => leg.budget.currency === move.currency), {
    message: 'every leg must be in the move currency',
    path: ['legs'],
  })
  .refine((move) => decreasesFirst(move.legs), {
    message: 'every leg must change its budget, and every decrease must come before any increase',
    path: ['legs'],
  })
  .refine((move) => move.legs.reduce((sum, leg) => sum + budgetDelta(leg), 0) === 0, {
    message: 'a move must take off exactly what it puts on',
    path: ['legs'],
  });
export type BudgetMoveAction = z.infer<typeof BudgetMoveActionSchema>;

export const OptimizerActionSchema = z.discriminatedUnion('kind', [
  SetStatusActionSchema,
  SetBudgetActionSchema,
  SetBidTargetActionSchema,
  AddNegativesActionSchema,
  BudgetMoveActionSchema,
]);
export type OptimizerAction = z.infer<typeof OptimizerActionSchema>;
export type OptimizerActionKind = OptimizerAction['kind'];

/** Why an applier refused an action before writing anything.
 *  - drifted: the live value is no longer what the human approved.
 *  - validate_only_error: Google's validate_only mutate rejected it.
 *  - guardrail: a portfolio or platform limit (caps, daily total, kill switch).
 *  - shared_budget: a Google budget other campaigns also spend.
 *  - platform_readonly: the platform does not accept this write (Google VIDEO, TikTok negatives).
 *  - budget_below_spend_floor: TikTok's 105%-of-today's-spend rule (schedule it instead).
 *  - below_platform_minimum: under the platform's per-currency minimum budget.
 *  - allowlist_required: TikTok upgraded Smart+ writes need an allowlist. */
export const ACTION_REFUSALS = [
  'drifted',
  'validate_only_error',
  'guardrail',
  'shared_budget',
  'platform_readonly',
  'budget_below_spend_floor',
  'below_platform_minimum',
  'allowlist_required',
] as const;
export const ActionRefusalSchema = z.enum(ACTION_REFUSALS);
export type ActionRefusal = z.infer<typeof ActionRefusalSchema>;

export const ActionPreflightSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), detail: z.string().optional() }).strict(),
  z.object({ ok: z.literal(false), refusal: ActionRefusalSchema, detail: z.string().min(1) }),
]);
export type ActionPreflight = z.infer<typeof ActionPreflightSchema>;
