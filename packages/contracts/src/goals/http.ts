import { z } from 'zod';
import { goalChatDeliverySchema } from '../chat/goal-routing';
import {
  campaignArtifactDocumentSchema,
  campaignArtifactDraftDocumentSchema,
  goalArtifactValidationSchema,
  goalChecklistItemSchema,
  goalWorkNodeResultRecordSchema,
} from './campaign-artifacts';
import { goalCommandInputSchema } from './commands';
import {
  goalActorSchema,
  goalAlignmentSchema,
  goalArtifactSchema,
  goalAssignmentSchema,
  goalDecisionSchema,
  goalDependencySchema,
  goalEvidenceSchema,
  goalPlanSchema,
  goalRequestSchema,
  goalResourceSchema,
  goalSchema,
  goalStatusSchema,
  goalSuccessCriterionSchema,
  goalVisibilitySchema,
  goalWorkstreamSchema,
} from './domain';
import {
  DEFAULT_GOAL_REQUEST_SLA_HOURS,
  goalCapabilityRouteSchema,
  goalEvidenceAttachmentSchema,
  goalSupervisorProjectionSchema,
  goalWorkNodeSchema,
} from './supervisor';

const idSchema = z.string().trim().min(1).max(240);

/**
 * Read-side participant projection. Authorization continues to derive from the
 * authenticated brand membership; this record only supplies display detail.
 */
export const goalParticipantSchema = z
  .object({
    actor: goalActorSchema,
    displayName: z.string().trim().min(1).max(300),
    detail: z.string().trim().min(1).max(1_000).optional(),
    avatarUrl: z.string().url().optional(),
  })
  .strict();
export type GoalParticipant = z.infer<typeof goalParticipantSchema>;

/**
 * Read-side Library projection for rendering one exact artifact version.
 * `content` is materialized convenience data, never Goal persistence authority.
 */
export const goalArtifactDocumentSchema = z
  .object({
    artifactId: idSchema,
    libraryAssetId: idSchema,
    versionId: idSchema,
    content: z.string().optional(),
    document: z
      .union([campaignArtifactDocumentSchema, campaignArtifactDraftDocumentSchema])
      .optional(),
    contentUrl: z.string().url().optional(),
    editable: z.boolean(),
  })
  .strict();
export type GoalArtifactDocument = z.infer<typeof goalArtifactDocumentSchema>;

export const goalSummarySchema = z
  .object({
    id: idSchema,
    brandId: idSchema,
    kind: idSchema,
    title: z.string().trim().min(1).max(300),
    objective: z.string().trim().min(1).max(4_000),
    visibility: goalVisibilitySchema,
    status: goalStatusSchema,
    facilitator: goalActorSchema.optional(),
    activePlanId: idSchema.optional(),
    activePlanVersion: z.number().int().positive().optional(),
    artifactCount: z.number().int().nonnegative(),
    resolvedArtifactCount: z.number().int().nonnegative(),
    openRequestCount: z.number().int().nonnegative(),
    updatedAt: z.string().trim().min(1),
    version: z.number().int().positive(),
  })
  .strict();
export type GoalSummary = z.infer<typeof goalSummarySchema>;

export const listGoalsQuerySchema = z
  .object({
    brandId: idSchema.optional(),
    visibility: goalVisibilitySchema.optional(),
    status: goalStatusSchema.optional(),
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;

export const listGoalsResponseSchema = z
  .object({
    goals: z.array(goalSummarySchema),
    nextCursor: idSchema.nullable(),
  })
  .strict();
export type ListGoalsResponse = z.infer<typeof listGoalsResponseSchema>;

export const createGoalRequestSchema = z
  .object({
    brandId: idSchema,
    kind: idSchema,
    title: z.string().trim().min(1).max(300),
    objective: z.string().trim().min(1).max(4_000),
    successCriteria: z.array(goalSuccessCriterionSchema).min(1).max(50),
    visibility: goalVisibilitySchema,
    invitedMemberIds: z.array(idSchema).max(200).default([]),
    facilitator: goalActorSchema.optional(),
    templateId: idSchema.optional(),
    activatedArtifactIds: z.array(idSchema).max(100).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.visibility === 'invited' && input.invitedMemberIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['invitedMemberIds'],
        message: 'An invited goal must name at least one invited member.',
      });
    }
    if (!input.templateId && (input.activatedArtifactIds?.length ?? 0) > 0) {
      context.addIssue({
        code: 'custom',
        path: ['activatedArtifactIds'],
        message: 'Activated campaign documents require a Goal template.',
      });
    }
  });
export type CreateGoalRequest = z.infer<typeof createGoalRequestSchema>;

export const createGoalResponseSchema = z
  .object({
    goal: goalSchema,
    artifacts: z.array(goalArtifactSchema),
  })
  .strict();
export type CreateGoalResponse = z.infer<typeof createGoalResponseSchema>;

export const upsertGoalCapabilityRouteRequestSchema = z
  .object({
    capability: idSchema,
    primaryUserId: z.string().uuid(),
    backupUserId: z.string().uuid().optional(),
    escalationUserId: z.string().uuid().optional(),
    scope: z.enum(['goal', 'brand']).default('goal'),
    slaHours: z
      .record(
        z.enum(['clarification', 'decision', 'approval', 'evidence', 'review', 'handoff']),
        z
          .number()
          .int()
          .min(1)
          .max(24 * 30),
      )
      .default(DEFAULT_GOAL_REQUEST_SLA_HOURS),
  })
  .strict();
export type UpsertGoalCapabilityRouteRequest = z.infer<
  typeof upsertGoalCapabilityRouteRequestSchema
>;

export const upsertGoalCapabilityRouteResponseSchema = z
  .object({ route: goalCapabilityRouteSchema })
  .strict();
export type UpsertGoalCapabilityRouteResponse = z.infer<
  typeof upsertGoalCapabilityRouteResponseSchema
>;

export const registerGoalEvidenceAttachmentRequestSchema = z
  .object({
    requestId: idSchema.optional(),
    sourceStoragePath: z.string().trim().min(1).max(1_500),
    filename: z.string().trim().min(1).max(500),
  })
  .strict();
export type RegisterGoalEvidenceAttachmentRequest = z.infer<
  typeof registerGoalEvidenceAttachmentRequestSchema
>;

export const registerGoalEvidenceAttachmentResponseSchema = z
  .object({ attachment: goalEvidenceAttachmentSchema })
  .strict();
export type RegisterGoalEvidenceAttachmentResponse = z.infer<
  typeof registerGoalEvidenceAttachmentResponseSchema
>;

export const goalSnapshotSchema = z
  .object({
    goal: goalSchema,
    plans: z.array(goalPlanSchema),
    workstreams: z.array(goalWorkstreamSchema),
    assignments: z.array(goalAssignmentSchema),
    artifacts: z.array(goalArtifactSchema),
    requests: z.array(goalRequestSchema),
    evidence: z.array(goalEvidenceSchema),
    decisions: z.array(goalDecisionSchema),
    resources: z.array(goalResourceSchema),
    dependencies: z.array(goalDependencySchema),
    alignments: z.array(goalAlignmentSchema),
    participants: z.array(goalParticipantSchema).default([]),
    artifactDocuments: z.array(goalArtifactDocumentSchema).default([]),
    chatDeliveries: z.array(goalChatDeliverySchema).default([]),
    workNodes: z.array(goalWorkNodeSchema).default([]),
    capabilityRoutes: z.array(goalCapabilityRouteSchema).default([]),
    evidenceAttachments: z.array(goalEvidenceAttachmentSchema).default([]),
    checklistItems: z.array(goalChecklistItemSchema).default([]),
    artifactValidations: z.array(goalArtifactValidationSchema).default([]),
    workNodeResults: z.array(goalWorkNodeResultRecordSchema).default([]),
    supervisor: goalSupervisorProjectionSchema.optional(),
    lastSeq: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type GoalSnapshot = z.infer<typeof goalSnapshotSchema>;

/**
 * Alias for route implementations that name the POST body by endpoint role.
 * Actor, goalId, and issuedAt are intentionally absent: the server derives them
 * from the authenticated principal, route path, and clock.
 */
export const goalCommandRequestSchema = z
  .object({
    command: goalCommandInputSchema,
  })
  .strict();
export type GoalCommandRequest = z.infer<typeof goalCommandRequestSchema>;
