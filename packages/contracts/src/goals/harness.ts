import { z } from 'zod';
import { goalExecutionRefSchema, goalExecutionResumeCauseSchema } from './execution';

export const goalHarnessStatusSchema = z.enum([
  'running',
  'waiting_for_input',
  /**
   * Parked on the world rather than on a teammate — a published trial round waiting for
   * views to accumulate before it can be measured. Distinct from `waiting_for_input`
   * because there is no request outstanding and nobody to chase: the supervisor must not
   * surface it as "waiting on a teammate", and escalation must not fire against it.
   */
  'waiting_for_timer',
  'completed',
  'failed',
  'cancelled',
]);
export type GoalHarnessStatus = z.infer<typeof goalHarnessStatusSchema>;

export const goalHarnessCheckpointSchema = z
  .object({
    harnessRunId: z.string().min(1),
    goalId: z.string().min(1),
    workNodeId: z.string().min(1),
    harnessKey: z.string().min(1),
    status: goalHarnessStatusSchema,
    checkpointVersion: z.number().int().nonnegative(),
    jainaSessionId: z.string().min(1).nullable(),
    blockedRequestId: z.string().min(1).nullable(),
    lastChildRunId: z.string().min(1).nullable(),
    lastGoalSequence: z.number().int().nonnegative(),
    checkpoint: z.record(z.string(), z.unknown()),
  })
  .strict();
export type GoalHarnessCheckpoint = z.infer<typeof goalHarnessCheckpointSchema>;

export const goalHarnessWakeupSchema = z
  .object({
    wakeupId: z.string().uuid(),
    goalId: z.string().min(1),
    harnessRunId: z.string().min(1),
    /** Null only for `scheduled` wakeups, where time passing is the cause and there is no
     *  request to point at. Mirrors the DB's `goal_run_wakeups_request_presence_check`. */
    requestId: z.string().min(1).nullable(),
    triggerKind: z.enum(['resolved', 'cancelled', 'expired', 'scheduled']),
    dedupeKey: z.string().min(1),
    attempts: z.number().int().nonnegative(),
  })
  .strict()
  .refine((wakeup) => (wakeup.triggerKind === 'scheduled') === (wakeup.requestId === null), {
    path: ['requestId'],
    message: 'A scheduled wakeup carries no request; every other kind must name one.',
  });
export type GoalHarnessWakeup = z.infer<typeof goalHarnessWakeupSchema>;

export const goalExecutionPacketSchema = z
  .object({
    identity: goalExecutionRefSchema,
    resumeCause: goalExecutionResumeCauseSchema,
    goalRevision: z.number().int().nonnegative(),
    workNode: z.record(z.string(), z.unknown()),
    snapshot: z.record(z.string(), z.unknown()),
  })
  .strict();
export type GoalExecutionPacket = z.infer<typeof goalExecutionPacketSchema>;
