/**
 * The human's CHOICE on an approval card, and the one gated tool that offers one today.
 *
 * An approval card normally asks one question — approve or deny the exact call on screen.
 * Some calls warrant a second answer that is narrower than the call: Ramiro's decision
 * (P4, 2026-10-29) is that a direct budget or bid change has NO % cap, so the card instead
 * always asks, states every change plainly, and offers TWO ways to approve — apply the
 * change, or pause the affected ad sets so the team can review first.
 *
 * THE VARIANT NEVER WIDENS THE SIGNED CALL. It travels beside the decision on
 * `jainaToolActionSchema.approval_variant`, exactly as `publication_mode` does for
 * `paid_scaffold_publish`: the arguments the gate hashed are unchanged, and the variant only
 * picks which part of them runs. `pause_for_review` writes no budget at all — it pauses the
 * ad sets the SAME signed input already names in `affected_adset_ids_for_review`.
 *
 * `JAINA_APPROVAL_VARIANTS_BY_TOOL` is the one declaration both sides read: the Frontend
 * renders a button per entry (with its label), and the Backend resume refuses a variant the
 * tool does not declare. A tool absent from it is an ordinary Approve/Deny card.
 *
 * The budget-change INPUT lives here too, because the Frontend renders it ("You are about to
 * change N budgets", the ad sets a pause would stop) and the Backend tool parses it. One
 * schema, two readers — the FE↔BE rule in root AGENTS.md §4.
 */

import { z } from 'zod';

export const jainaApprovalVariantSchema = z.enum(['apply', 'pause_for_review']);
export type JainaApprovalVariant = z.infer<typeof jainaApprovalVariantSchema>;

export type JainaApprovalVariantOption = {
  readonly variant: JainaApprovalVariant;
  /** The button text, in English (product copy is English). */
  readonly label: string;
  /** One sentence the card may show under the buttons: what this choice does. */
  readonly description: string;
};

export const CHANGE_META_BUDGET_BID_TOOL_NAME = 'change_meta_budget_bid';

/**
 * Which gated tools offer a choice of approval, and the choices in display order. The
 * FIRST entry is what a bare "approve" (Slack, an older client) means.
 */
export const JAINA_APPROVAL_VARIANTS_BY_TOOL: Readonly<
  Record<string, readonly JainaApprovalVariantOption[]>
> = {
  [CHANGE_META_BUDGET_BID_TOOL_NAME]: [
    {
      variant: 'apply',
      label: 'Apply changes',
      description: 'Writes the new amounts on Meta and reads each one back.',
    },
    {
      variant: 'pause_for_review',
      label: 'Pause these ad sets for review',
      description:
        'Changes no budget or bid. Pauses the ad sets listed so your team can review them first.',
    },
  ],
};

/** The choices a tool's card offers, or null when it is an ordinary Approve/Deny card. */
export const approvalVariantsOf = (
  toolName: string,
): readonly JainaApprovalVariantOption[] | null =>
  JAINA_APPROVAL_VARIANTS_BY_TOOL[toolName] ?? null;

/** True only when `toolName` declares `variant`. Anything else is refused, never coerced. */
export const isApprovalVariantOffered = (
  toolName: string,
  variant: JainaApprovalVariant,
): boolean => (approvalVariantsOf(toolName) ?? []).some((option) => option.variant === variant);

// ---------------------------------------------------------------------------
// change_meta_budget_bid — the input a person approves
// ---------------------------------------------------------------------------

/** The most entities one card may change: the Optimizer's own per-request limit. */
export const META_BUDGET_BID_MAX_CHANGES = 50;

export const metaBudgetBidFieldSchema = z.enum(['daily_budget', 'lifetime_budget', 'bid_amount']);
export type MetaBudgetBidChangeField = z.infer<typeof metaBudgetBidFieldSchema>;

/**
 * FLAT, string enums and plain integers only. A numeric enum or a union anywhere in a tool
 * schema makes Gemini reject the whole declaration, so "the entity has no value for this
 * field" is `0`, not `null` — Meta reports an unset budget as absent or "0", and the
 * gateway's drift check already reads both as unset.
 */
export const metaBudgetBidChangeSchema = z.object({
  entity_id: z
    .string()
    .min(1)
    .describe('The Meta campaign or ad set id. Never guess it — read it first.'),
  level: z.enum(['campaign', 'adset']).describe("What entity_id is: 'campaign' or 'adset'."),
  entity_name: z
    .string()
    .min(1)
    .describe('The entity name exactly as you read it. Shown on the approval card.'),
  field: metaBudgetBidFieldSchema.describe(
    "Which value changes: 'daily_budget', 'lifetime_budget' or 'bid_amount'.",
  ),
  expected_current_minor_units: z
    .number()
    .int()
    .min(0)
    .describe(
      'The value you read for this field RIGHT NOW, in MINOR units exactly as Meta returned ' +
        'it (e.g. 5000 for 50.00). 0 when the entity has no value for this field. Shown as ' +
        'the "before"; if Meta holds anything else the change is refused and nothing is written.',
    ),
  new_minor_units: z
    .number()
    .int()
    .positive()
    .describe('The new value in MINOR units (e.g. 7500 for 75.00).'),
  currency: z
    .string()
    .min(3)
    .max(3)
    .describe("The ad account's ISO currency code, e.g. 'MXN' or 'USD'."),
});
export type MetaBudgetBidChange = z.infer<typeof metaBudgetBidChangeSchema>;

export const metaReviewAdSetSchema = z.object({
  adset_id: z.string().min(1).describe('An ad set id this change affects.'),
  name: z.string().min(1).describe('Its name exactly as you read it.'),
  expected_status: z
    .enum(['ACTIVE', 'PAUSED'])
    .describe('The status you read for it. An ad set already PAUSED is left as it is.'),
});
export type MetaReviewAdSet = z.infer<typeof metaReviewAdSetSchema>;

export const changeMetaBudgetBidInputSchema = z
  .object({
    changes: z
      .array(metaBudgetBidChangeSchema)
      .min(1)
      .describe(`One entry per value that changes, at most ${META_BUDGET_BID_MAX_CHANGES}.`),
    affected_adset_ids_for_review: z
      .array(metaReviewAdSetSchema)
      .min(1)
      .describe(
        'The ad sets these changes affect: for an ad-set change, that ad set; for a campaign ' +
          'change, the ad sets under it. If the user chooses "pause for review" instead of ' +
          'applying, exactly these are paused and no budget is changed.',
      ),
    reason: z.string().min(1).describe("Why, in the user's terms. Recorded on the audit row."),
    idempotency_key: z
      .string()
      .min(8)
      .max(128)
      .describe(
        'A fresh unique key for THIS proposal (e.g. a uuid). The same key and entity never ' +
          'write twice.',
      ),
  })
  // The cap and the shape rules live in a refinement, not in `maxItems`: a bound on an array
  // of objects is what Gemini unrolls when it compiles a declaration.
  .superRefine((input, ctx) => {
    if (input.changes.length > META_BUDGET_BID_MAX_CHANGES) {
      ctx.addIssue({
        code: 'custom',
        path: ['changes'],
        message: `At most ${META_BUDGET_BID_MAX_CHANGES} changes per card.`,
      });
    }
    const seen = new Set<string>();
    input.changes.forEach((change, index) => {
      const key = `${change.entity_id}:${change.field}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index],
          message: `${change.entity_id} ${change.field} appears twice.`,
        });
      }
      seen.add(key);
      if (change.new_minor_units === change.expected_current_minor_units) {
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'new_minor_units'],
          message: 'The new value equals the current one; there is nothing to change.',
        });
      }
      // Meta carries a bid on the ad set; a campaign's bid strategy has no amount of its own.
      if (change.level === 'campaign' && change.field === 'bid_amount') {
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'field'],
          message: 'A bid amount is set on the ad set, not on the campaign.',
        });
      }
    });
  });
export type ChangeMetaBudgetBidInput = z.infer<typeof changeMetaBudgetBidInputSchema>;
