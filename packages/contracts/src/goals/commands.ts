import { z } from 'zod';
import {
  goalActorSchema,
  goalAlignmentSchema,
  goalArtifactSchema,
  goalAssignmentSchema,
  goalDecisionSchema,
  goalEvidenceSchema,
  goalPlanSchema,
  goalRequestResponseSchema,
  goalRequestSchema,
  goalResourceSchema,
  goalSchema,
  goalSuccessCriterionSchema,
  goalVisibilitySchema,
  goalWorkstreamSchema,
} from './domain';

const idSchema = z.string().trim().min(1).max(240);
const timestampSchema = z.string().trim().min(1);

export const goalUpdatePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    objective: z.string().trim().min(1).max(4_000).optional(),
    successCriteria: z.array(goalSuccessCriterionSchema).min(1).max(50).optional(),
    visibility: goalVisibilitySchema.optional(),
    invitedMemberIds: z.array(idSchema).max(200).optional(),
    status: z.enum(['draft', 'planning', 'active', 'blocked', 'in_review']).optional(),
    facilitator: goalActorSchema.optional(),
  })
  .strict();
export type GoalUpdatePatch = z.infer<typeof goalUpdatePatchSchema>;

const commandPayloads = {
  'goal.activate': z.object({}).strict(),
  'goal.update': z.object({ patch: goalUpdatePatchSchema }).strict(),
  'goal.complete': z.object({ summary: z.string().trim().min(1).max(8_000).optional() }).strict(),
  'plan.propose': z.object({ plan: goalPlanSchema }).strict(),
  'plan.activate': z
    .object({ planId: idSchema, planVersion: z.number().int().positive() })
    .strict(),
  'workstream.upsert': z.object({ workstream: goalWorkstreamSchema }).strict(),
  'assignment.upsert': z.object({ assignment: goalAssignmentSchema }).strict(),
  'artifact.attach': z
    .object({
      artifact: goalArtifactSchema.refine(
        (artifact) => artifact.status === 'proposed' || artifact.status === 'drafting',
        'Artifacts must enter a Goal as proposed or drafting; acceptance is a separate command.',
      ),
    })
    .strict(),
  'artifact.accept': z.object({ artifactId: idSchema, acceptedVersionId: idSchema }).strict(),
  'artifact.waive': z
    .object({ artifactId: idSchema, reason: z.string().trim().min(1).max(4_000) })
    .strict(),
  'artifact.reconcile': z
    .object({
      artifactId: idSchema,
      headVersionId: idSchema,
      completedSectionIds: z.array(idSchema).max(100).optional(),
      evidenceIds: z.array(idSchema).max(500).optional(),
    })
    .strict(),
  'artifact.review': z
    .object({
      artifactId: idSchema,
      versionId: idSchema,
      decision: z.enum(['approved', 'changes_requested']),
      note: z.string().trim().min(1).max(4_000).optional(),
    })
    .strict(),
  'artifact.promote': z
    .object({
      artifactId: idSchema,
      name: z.string().trim().min(1).max(300).optional(),
      category: z
        .enum([
          'brand_guidelines',
          'creative_strategy',
          'audience_persona',
          'product_info',
          'campaign_deliverable',
          'misc',
        ])
        .default('campaign_deliverable'),
    })
    .strict(),
  'request.create': z.object({ request: goalRequestSchema }).strict(),
  'request.respond': z
    .object({ requestId: idSchema, response: goalRequestResponseSchema })
    .strict(),
  'evidence.add': z.object({ evidence: goalEvidenceSchema }).strict(),
  'decision.record': z.object({ decision: goalDecisionSchema }).strict(),
  'resource.attach': z.object({ resource: goalResourceSchema }).strict(),
  'alignment.record': z.object({ alignment: goalAlignmentSchema }).strict(),
} as const;

type CommandType = keyof typeof commandPayloads;

const inputCommand = <Type extends CommandType>(type: Type) =>
  z
    .object({
      commandId: idSchema,
      expectedRevision: z.number().int().nonnegative().optional(),
      type: z.literal(type),
      payload: commandPayloads[type],
    })
    .strict();

export const goalCommandInputSchema = z.discriminatedUnion('type', [
  inputCommand('goal.activate'),
  inputCommand('goal.update'),
  inputCommand('goal.complete'),
  inputCommand('plan.propose'),
  inputCommand('plan.activate'),
  inputCommand('workstream.upsert'),
  inputCommand('assignment.upsert'),
  inputCommand('artifact.attach'),
  inputCommand('artifact.accept'),
  inputCommand('artifact.waive'),
  inputCommand('artifact.reconcile'),
  inputCommand('artifact.review'),
  inputCommand('artifact.promote'),
  inputCommand('request.create'),
  inputCommand('request.respond'),
  inputCommand('evidence.add'),
  inputCommand('decision.record'),
  inputCommand('resource.attach'),
  inputCommand('alignment.record'),
]);
export type GoalCommandInput = z.infer<typeof goalCommandInputSchema>;

const durableCommand = <Type extends CommandType>(type: Type) =>
  z
    .object({
      commandId: idSchema,
      goalId: idSchema,
      actor: goalActorSchema,
      issuedAt: timestampSchema,
      expectedRevision: z.number().int().nonnegative().optional(),
      type: z.literal(type),
      payload: commandPayloads[type],
    })
    .strict();

export const goalCommandSchema = z.discriminatedUnion('type', [
  durableCommand('goal.activate'),
  durableCommand('goal.update'),
  durableCommand('goal.complete'),
  durableCommand('plan.propose'),
  durableCommand('plan.activate'),
  durableCommand('workstream.upsert'),
  durableCommand('assignment.upsert'),
  durableCommand('artifact.attach'),
  durableCommand('artifact.accept'),
  durableCommand('artifact.waive'),
  durableCommand('artifact.reconcile'),
  durableCommand('artifact.review'),
  durableCommand('artifact.promote'),
  durableCommand('request.create'),
  durableCommand('request.respond'),
  durableCommand('evidence.add'),
  durableCommand('decision.record'),
  durableCommand('resource.attach'),
  durableCommand('alignment.record'),
]);
export type GoalCommand = z.infer<typeof goalCommandSchema>;

const eventEnvelope = {
  eventId: idSchema,
  goalId: idSchema,
  commandId: idSchema,
  seq: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  ts: timestampSchema,
  actor: goalActorSchema,
};

const event = <Type extends string, Data extends z.ZodType>(type: Type, data: Data) =>
  z
    .object({
      ...eventEnvelope,
      type: z.literal(type),
      data,
    })
    .strict();

export const goalEventSchema = z.discriminatedUnion('type', [
  event('goal.created', z.object({ goal: goalSchema }).strict()),
  event('goal.activated', z.object({}).strict()),
  event('goal.updated', z.object({ patch: goalUpdatePatchSchema }).strict()),
  event(
    'goal.completed',
    z.object({ summary: z.string().trim().min(1).max(8_000).optional() }).strict(),
  ),
  event('plan.proposed', z.object({ plan: goalPlanSchema }).strict()),
  event(
    'plan.activated',
    z.object({ planId: idSchema, planVersion: z.number().int().positive() }).strict(),
  ),
  event('workstream.upserted', z.object({ workstream: goalWorkstreamSchema }).strict()),
  event('assignment.upserted', z.object({ assignment: goalAssignmentSchema }).strict()),
  event('artifact.attached', z.object({ artifact: goalArtifactSchema }).strict()),
  event(
    'artifact.accepted',
    z.object({ artifactId: idSchema, acceptedVersionId: idSchema }).strict(),
  ),
  event(
    'artifact.waived',
    z.object({ artifactId: idSchema, reason: z.string().trim().min(1).max(4_000) }).strict(),
  ),
  event(
    'artifact.reconciled',
    z
      .object({
        artifactId: idSchema,
        headVersionId: idSchema,
        completedSectionIds: z.array(idSchema).max(100).optional(),
        evidenceIds: z.array(idSchema).max(500).optional(),
      })
      .strict(),
  ),
  event(
    'artifact.reviewed',
    z
      .object({
        artifactId: idSchema,
        versionId: idSchema,
        decision: z.enum(['approved', 'changes_requested']),
        note: z.string().trim().min(1).max(4_000).optional(),
      })
      .strict(),
  ),
  event(
    'artifact.promoted',
    z
      .object({
        artifactId: idSchema,
        name: z.string().trim().min(1).max(300).optional(),
        category: z.enum([
          'brand_guidelines',
          'creative_strategy',
          'audience_persona',
          'product_info',
          'campaign_deliverable',
          'misc',
        ]),
        documentId: idSchema,
        libraryVersionId: idSchema,
      })
      .strict(),
  ),
  event('request.created', z.object({ request: goalRequestSchema }).strict()),
  event(
    'request.responded',
    z.object({ requestId: idSchema, response: goalRequestResponseSchema }).strict(),
  ),
  event('evidence.added', z.object({ evidence: goalEvidenceSchema }).strict()),
  event('decision.recorded', z.object({ decision: goalDecisionSchema }).strict()),
  event('resource.attached', z.object({ resource: goalResourceSchema }).strict()),
  event('alignment.recorded', z.object({ alignment: goalAlignmentSchema }).strict()),
]);
export type GoalEvent = z.infer<typeof goalEventSchema>;

export const goalEventsQuerySchema = z
  .object({
    afterSeq: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type GoalEventsQuery = z.infer<typeof goalEventsQuerySchema>;

export const goalEventsPageSchema = z
  .object({
    goalId: idSchema,
    events: z.array(goalEventSchema),
    nextSeq: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type GoalEventsPage = z.infer<typeof goalEventsPageSchema>;

export const goalCommandReceiptSchema = z
  .object({
    accepted: z.literal(true),
    commandId: idSchema,
    eventIds: z.array(idSchema).min(1),
    revision: z.number().int().nonnegative(),
    lastSeq: z.number().int().nonnegative(),
  })
  .strict();
export type GoalCommandReceipt = z.infer<typeof goalCommandReceiptSchema>;
