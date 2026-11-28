import { z } from 'zod';
import { goalWorkProductSchema } from '../goals/campaign-artifacts';
import { goalExpectedResponseSchema, goalRequestKindSchema, goalRequestTargetSchema } from '../goals/domain';

const id = z.string().trim().min(1).max(240);

export const watchmanClaimSchema = z.object({ wake_id: id, attempt: z.number().int().positive() }).strict();
export type WatchmanClaim = z.infer<typeof watchmanClaimSchema>;

/** The execution identity and blocked node are resolved from the current leased wake. */
export const watchmanWorkRequestInputSchema = z.object({
  request_id: id,
  kind: goalRequestKindSchema,
  prompt: z.string().trim().min(1).max(8_000),
  targets: z.array(goalRequestTargetSchema).min(1).max(100),
  expected_response: goalExpectedResponseSchema,
  checklist_item_ids: z.array(id).min(1).max(200),
  due_at: z.iso.datetime({ offset: true }).optional(),
}).strict();
export type WatchmanWorkRequestInput = z.infer<typeof watchmanWorkRequestInputSchema>;

export const watchmanWorkHandoffInputSchema = z.object({
  request_id: id,
  target_watchman_id: z.string().uuid(),
  objective: z.string().trim().min(1).max(4_000),
  capability: z.string().trim().min(1).max(200),
}).strict();
export type WatchmanWorkHandoffInput = z.infer<typeof watchmanWorkHandoffInputSchema>;
export const watchmanWorkProductInputSchema = goalWorkProductSchema;
