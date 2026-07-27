import { z } from 'zod';
import { goalActorSchema, goalRequestKindSchema } from './domain';

const idSchema = z.string().trim().min(1).max(240);
const timestampSchema = z.string().trim().min(1);

export const goalWorkNodeStatusSchema = z.enum([
  'pending',
  'ready',
  'running',
  'waiting_for_input',
  'waiting_for_approval',
  'waiting_for_external',
  'needs_reconciliation',
  'completed',
  'failed',
  'cancelled',
  'superseded',
]);
export type GoalWorkNodeStatus = z.infer<typeof goalWorkNodeStatusSchema>;

export const goalWorkNodePurposeSchema = z.enum(['goal_work', 'artifact_reconciliation']);
export type GoalWorkNodePurpose = z.infer<typeof goalWorkNodePurposeSchema>;

export const goalWorkNodeExecutorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('jaina') }).strict(),
  z.object({ kind: z.literal('specialist'), agent: idSchema }).strict(),
]);
export type GoalWorkNodeExecutor = z.infer<typeof goalWorkNodeExecutorSchema>;

export const goalWorkNodeSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    planId: idSchema,
    workstreamId: idSchema,
    title: z.string().trim().min(1).max(300),
    objective: z.string().trim().min(1).max(8_000),
    purpose: goalWorkNodePurposeSchema,
    executor: goalWorkNodeExecutorSchema,
    requiredCapability: idSchema.optional(),
    status: goalWorkNodeStatusSchema,
    dependencyIds: z.array(idSchema).max(100).default([]),
    producedArtifactIds: z.array(idSchema).max(100).default([]),
    priority: z.number().int().min(0).max(100).default(50),
    attempt: z.number().int().nonnegative().default(0),
    maxAttempts: z.number().int().min(1).max(20).default(5),
    /**
     * @deprecated A legacy session hint retained while stored work-node records
     * are migrated. Goal/work-node/harness IDs are the execution authority.
     */
    sessionId: idSchema.optional(),
    retryAt: timestampSchema.optional(),
    lastError: z.string().trim().min(1).max(2_000).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    completedAt: timestampSchema.optional(),
  })
  .strict()
  .superRefine((node, context) => {
    if (node.dependencyIds.includes(node.id)) {
      context.addIssue({
        code: 'custom',
        path: ['dependencyIds'],
        message: 'A Goal work node cannot depend on itself.',
      });
    }
  });
export type GoalWorkNode = z.infer<typeof goalWorkNodeSchema>;

const slaHoursSchema = z.record(
  goalRequestKindSchema,
  z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
);

export const DEFAULT_GOAL_REQUEST_SLA_HOURS = Object.freeze({
  approval: 4,
  decision: 12,
  review: 12,
  clarification: 24,
  evidence: 24,
  handoff: 24,
} satisfies Record<z.infer<typeof goalRequestKindSchema>, number>);

export const goalCapabilityRouteSchema = z
  .object({
    id: idSchema,
    brandId: idSchema,
    goalId: idSchema.optional(),
    capability: idSchema,
    primaryUserId: z.string().uuid(),
    backupUserId: z.string().uuid().optional(),
    escalationUserId: z.string().uuid().optional(),
    slaHours: slaHoursSchema.default(DEFAULT_GOAL_REQUEST_SLA_HOURS),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .refine((route) => route.primaryUserId !== route.backupUserId, {
    path: ['backupUserId'],
    message: 'A capability backup must differ from its primary owner.',
  });
export type GoalCapabilityRoute = z.infer<typeof goalCapabilityRouteSchema>;

export const goalEvidenceAttachmentSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    requestId: idSchema.optional(),
    filename: z.string().trim().min(1).max(500),
    mimeType: z.string().trim().min(1).max(200),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(25 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    capturedBy: goalActorSchema,
    capturedAt: timestampSchema,
  })
  .strict();
export type GoalEvidenceAttachment = z.infer<typeof goalEvidenceAttachmentSchema>;

export const goalPortfolioStatusSchema = z.enum([
  'on_track',
  'waiting_on_teammate',
  'waiting_on_external',
  'at_risk',
  'needs_approval',
  'ready_to_publish',
  'launching',
  'live_optimizing',
  'failed_recovery_needed',
  'completed',
]);
export type GoalPortfolioStatus = z.infer<typeof goalPortfolioStatusSchema>;

export const goalSupervisorProjectionSchema = z
  .object({
    goalId: idSchema,
    portfolioStatus: goalPortfolioStatusSchema,
    readyNodeIds: z.array(idSchema),
    runningNodeIds: z.array(idSchema),
    waitingNodeIds: z.array(idSchema),
    blockedNodeIds: z.array(idSchema),
    failedNodeIds: z.array(idSchema),
  })
  .strict();
export type GoalSupervisorProjection = z.infer<typeof goalSupervisorProjectionSchema>;

const terminalDependencyStatuses = new Set<GoalWorkNodeStatus>([
  'completed',
  'cancelled',
  'superseded',
]);

export const projectGoalSupervisor = (input: {
  goalId: string;
  nodes: readonly GoalWorkNode[];
  openRequestNodeIds: ReadonlySet<string>;
  now: string;
}): GoalSupervisorProjection => {
  const byId = new Map(input.nodes.map((node) => [node.id, node]));
  const dependenciesSatisfied = (node: GoalWorkNode): boolean =>
    node.dependencyIds.every((dependencyId) => {
      const dependency = byId.get(dependencyId);
      return dependency ? terminalDependencyStatuses.has(dependency.status) : false;
    });
  const retryReady = (node: GoalWorkNode): boolean =>
    !node.retryAt || Date.parse(node.retryAt) <= Date.parse(input.now);

  const ready = input.nodes
    .filter(
      (node) =>
        (node.status === 'pending' || node.status === 'ready' || node.status === 'failed') &&
        node.attempt < node.maxAttempts &&
        retryReady(node) &&
        dependenciesSatisfied(node) &&
        !input.openRequestNodeIds.has(node.id),
    )
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const running = input.nodes.filter((node) => node.status === 'running');
  const waiting = input.nodes.filter(
    (node) =>
      node.status === 'waiting_for_input' ||
      node.status === 'waiting_for_approval' ||
      node.status === 'waiting_for_external' ||
      node.status === 'needs_reconciliation' ||
      input.openRequestNodeIds.has(node.id),
  );
  const blocked = input.nodes.filter(
    (node) =>
      node.status === 'pending' &&
      !ready.some((candidate) => candidate.id === node.id) &&
      !input.openRequestNodeIds.has(node.id),
  );
  const failed = input.nodes.filter(
    (node) => node.status === 'failed' && node.attempt >= node.maxAttempts,
  );

  let portfolioStatus: GoalPortfolioStatus = 'on_track';
  if (
    input.nodes.length > 0 &&
    input.nodes.every((node) => terminalDependencyStatuses.has(node.status))
  ) {
    portfolioStatus = 'completed';
  } else if (failed.length > 0) {
    portfolioStatus = 'failed_recovery_needed';
  } else if (waiting.some((node) => node.status === 'waiting_for_approval')) {
    portfolioStatus = 'needs_approval';
  } else if (waiting.some((node) => node.status === 'waiting_for_input')) {
    portfolioStatus = 'waiting_on_teammate';
  } else if (waiting.some((node) => node.status === 'waiting_for_external')) {
    portfolioStatus = 'waiting_on_external';
  }

  return goalSupervisorProjectionSchema.parse({
    goalId: input.goalId,
    portfolioStatus,
    readyNodeIds: ready.map((node) => node.id),
    runningNodeIds: running.map((node) => node.id),
    waitingNodeIds: waiting.map((node) => node.id),
    blockedNodeIds: blocked.map((node) => node.id),
    failedNodeIds: failed.map((node) => node.id),
  });
};

export const goalNodeToolObservationSchema = z
  .object({
    status: z.enum(['success', 'warning', 'error']),
    summary: z.string().trim().min(1).max(1_000),
    nextActions: z.array(z.string().trim().min(1).max(1_000)).max(20),
    artifacts: z.array(idSchema).max(100),
    rootCauseHint: z.string().trim().min(1).max(2_000).optional(),
    safeRetry: z.string().trim().min(1).max(2_000).optional(),
    stopCondition: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
export type GoalNodeToolObservation = z.infer<typeof goalNodeToolObservationSchema>;
