import { z } from 'zod';
import { goalExecutionRefSchema, goalExecutionResumeCauseSchema } from './execution';

export const goalHarnessStatusSchema = z.enum([
  'running',
  'waiting_for_input',
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
    requestId: z.string().min(1),
    triggerKind: z.enum(['resolved', 'cancelled', 'expired']),
    dedupeKey: z.string().min(1),
    attempts: z.number().int().nonnegative(),
  })
  .strict();
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
