import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(240);

/**
 * Durable identity for Goal-owned execution. Conversation sessions are
 * intentionally absent: they are replaceable memory containers for one child
 * turn, not orchestration authority.
 */
export const goalExecutionRefSchema = z
  .object({
    goalId: idSchema,
    workNodeId: idSchema,
    harnessRunId: idSchema,
  })
  .strict();
export type GoalExecutionRef = z.infer<typeof goalExecutionRefSchema>;

export const goalChildRunIdentitySchema = goalExecutionRefSchema
  .extend({
    runId: idSchema,
    sessionId: idSchema,
    parentRunId: idSchema.nullable().optional(),
    requestId: idSchema.nullable().optional(),
    wakeupId: idSchema.nullable().optional(),
  })
  .strict();
export type GoalChildRunIdentity = z.infer<typeof goalChildRunIdentitySchema>;

export const goalExecutionResumeCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('initial') }).strict(),
  z
    .object({
      kind: z.literal('request_resolved'),
      requestId: idSchema,
      wakeupId: idSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('retry'),
      priorRunId: idSchema,
    })
    .strict(),
  /**
   * Time passed, and that was the whole cause.
   *
   * Distinct from `request_resolved` because nobody answered anything: a Goal can park on
   * the world rather than on a teammate — a creative trial waiting days for views to
   * accumulate before its round can be measured. Carries no `requestId`, and the wakeup row
   * behind it has none either.
   */
  z
    .object({
      kind: z.literal('timer_elapsed'),
      wakeupId: idSchema,
      scheduledFor: z.iso.datetime({ offset: true }),
    })
    .strict(),
]);
export type GoalExecutionResumeCause = z.infer<typeof goalExecutionResumeCauseSchema>;
