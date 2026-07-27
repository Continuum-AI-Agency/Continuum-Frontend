import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(240);
const timestampSchema = z.string().trim().min(1);
const nonEmptyTextSchema = z.string().trim().min(1);

export const goalHumanActorSchema = z
  .object({
    kind: z.literal('human'),
    userId: idSchema,
  })
  .strict();

export const goalAgentActorSchema = z
  .object({
    kind: z.literal('agent'),
    agent: idSchema,
    runId: idSchema.optional(),
  })
  .strict();

export const goalActorSchema = z.discriminatedUnion('kind', [
  goalHumanActorSchema,
  goalAgentActorSchema,
]);
export type GoalActor = z.infer<typeof goalActorSchema>;

export const GOAL_CAPABILITY_DOMAINS = [
  'strategy',
  'research',
  'paid_media',
  'organic',
  'creative',
  'measurement',
  'conversion',
  'brand',
  'operations',
  'compliance',
] as const;

/**
 * Capability is intentionally a non-empty string rather than a closed enum.
 * The constants provide shared defaults without preventing future humans or
 * agents from advertising a newly introduced capability.
 */
export const goalCapabilitySchema = idSchema;
export type GoalCapability = z.infer<typeof goalCapabilitySchema>;

export const goalVisibilitySchema = z.enum(['private', 'brand', 'invited']);
export type GoalVisibility = z.infer<typeof goalVisibilitySchema>;

export const goalStatusSchema = z.enum([
  'draft',
  'planning',
  'active',
  'blocked',
  'in_review',
  'completed',
  'archived',
]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalSuccessCriterionSchema = z
  .object({
    id: idSchema,
    statement: nonEmptyTextSchema,
    metric: nonEmptyTextSchema.optional(),
    target: nonEmptyTextSchema.optional(),
    dueAt: timestampSchema.optional(),
  })
  .strict();
export type GoalSuccessCriterion = z.infer<typeof goalSuccessCriterionSchema>;

export const goalResourceKindSchema = z.enum([
  'jaina_session',
  'organic_session',
  'agent_run',
  'canvas_room',
  'optimizer_portfolio',
  'campaign',
  'report',
  'library_asset',
  'external',
]);
export type GoalResourceKind = z.infer<typeof goalResourceKindSchema>;

export const goalResourceRefSchema = z
  .object({
    kind: goalResourceKindSchema,
    id: idSchema,
    uri: z.string().trim().min(1).optional(),
  })
  .strict();
export type GoalResourceRef = z.infer<typeof goalResourceRefSchema>;

export const goalSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    id: idSchema,
    brandId: idSchema,
    kind: idSchema,
    title: nonEmptyTextSchema.max(300),
    objective: nonEmptyTextSchema.max(4_000),
    successCriteria: z.array(goalSuccessCriterionSchema).min(1).max(50),
    scope: z.array(goalResourceRefSchema).max(200).default([]),
    visibility: goalVisibilitySchema,
    invitedMemberIds: z.array(idSchema).max(200).default([]),
    status: goalStatusSchema,
    facilitator: goalActorSchema.optional(),
    activePlanId: idSchema.optional(),
    activePlanVersion: z.number().int().positive().optional(),
    createdBy: goalActorSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((goal, context) => {
    if (goal.visibility === 'invited' && goal.invitedMemberIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['invitedMemberIds'],
        message: 'An invited goal must name at least one invited member.',
      });
    }
    if (goal.visibility !== 'invited' && goal.invitedMemberIds.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['invitedMemberIds'],
        message: 'Only invited goals may carry invited member IDs.',
      });
    }
  });
export type Goal = z.infer<typeof goalSchema>;

export const goalWorkstreamStatusSchema = z.enum([
  'proposed',
  'ready',
  'active',
  'blocked',
  'in_review',
  'completed',
  'cancelled',
]);
export type GoalWorkstreamStatus = z.infer<typeof goalWorkstreamStatusSchema>;

export const goalWorkstreamSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    planId: idSchema,
    title: nonEmptyTextSchema.max(300),
    objective: nonEmptyTextSchema.max(4_000),
    successCriteria: z.array(nonEmptyTextSchema).min(1).max(30),
    requiredCapabilities: z.array(goalCapabilitySchema).min(1).max(30),
    status: goalWorkstreamStatusSchema,
    leadAssignmentId: idSchema.optional(),
    assignmentIds: z.array(idSchema).max(100).default([]),
    artifactIds: z.array(idSchema).max(100).default([]),
  })
  .strict();
export type GoalWorkstream = z.infer<typeof goalWorkstreamSchema>;

export const goalNodeKindSchema = z.enum([
  'workstream',
  'work_node',
  'assignment',
  'resource',
  'evidence',
  'request',
  'artifact',
  'decision',
]);
export type GoalNodeKind = z.infer<typeof goalNodeKindSchema>;

export const goalNodeRefSchema = z
  .object({
    kind: goalNodeKindSchema,
    id: idSchema,
  })
  .strict();
export type GoalNodeRef = z.infer<typeof goalNodeRefSchema>;

export const goalDependencyRelationshipSchema = z.enum([
  'blocks',
  'informs',
  'produces',
  'consumes',
  'relates',
]);
export type GoalDependencyRelationship = z.infer<typeof goalDependencyRelationshipSchema>;

export const goalDependencySchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    from: goalNodeRefSchema,
    to: goalNodeRefSchema,
    relationship: goalDependencyRelationshipSchema,
    required: z.boolean().default(true),
    rationale: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict()
  .refine(
    (dependency) =>
      dependency.from.kind !== dependency.to.kind || dependency.from.id !== dependency.to.id,
    {
      path: ['to'],
      message: 'A Goal dependency cannot point a node at itself.',
    },
  );
export type GoalDependency = z.infer<typeof goalDependencySchema>;

export const goalPlanStatusSchema = z.enum(['proposed', 'active', 'rejected', 'superseded']);
export type GoalPlanStatus = z.infer<typeof goalPlanStatusSchema>;

const hasWorkstreamCycle = (
  workstreamIds: ReadonlySet<string>,
  dependencies: readonly z.infer<typeof goalDependencySchema>[],
): boolean => {
  const adjacency = new Map<string, string[]>();
  for (const id of workstreamIds) adjacency.set(id, []);

  for (const dependency of dependencies) {
    if (dependency.from.kind !== 'workstream' || dependency.to.kind !== 'workstream') continue;
    if (!workstreamIds.has(dependency.from.id) || !workstreamIds.has(dependency.to.id)) continue;
    adjacency.get(dependency.from.id)?.push(dependency.to.id);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;

    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of workstreamIds) {
    if (visit(id)) return true;
  }
  return false;
};

export const goalPlanSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    version: z.number().int().positive(),
    status: goalPlanStatusSchema,
    summary: nonEmptyTextSchema.max(4_000),
    workstreams: z.array(goalWorkstreamSchema).min(1).max(100),
    dependencies: z.array(goalDependencySchema).max(500).default([]),
    createdBy: goalActorSchema,
    createdAt: timestampSchema,
    activatedBy: goalActorSchema.optional(),
    activatedAt: timestampSchema.optional(),
    supersedesPlanId: idSchema.optional(),
  })
  .strict()
  .superRefine((plan, context) => {
    const workstreamIds = new Set<string>();
    for (const [index, workstream] of plan.workstreams.entries()) {
      if (workstream.goalId !== plan.goalId) {
        context.addIssue({
          code: 'custom',
          path: ['workstreams', index, 'goalId'],
          message: 'Every workstream must belong to the plan Goal.',
        });
      }
      if (workstream.planId !== plan.id) {
        context.addIssue({
          code: 'custom',
          path: ['workstreams', index, 'planId'],
          message: 'Every workstream must belong to this plan.',
        });
      }
      if (workstreamIds.has(workstream.id)) {
        context.addIssue({
          code: 'custom',
          path: ['workstreams', index, 'id'],
          message: 'Workstream IDs must be unique within a plan.',
        });
      }
      workstreamIds.add(workstream.id);
    }

    for (const [index, dependency] of plan.dependencies.entries()) {
      if (dependency.goalId !== plan.goalId) {
        context.addIssue({
          code: 'custom',
          path: ['dependencies', index, 'goalId'],
          message: 'Every dependency must belong to the plan Goal.',
        });
      }
      for (const endpoint of ['from', 'to'] as const) {
        const ref = dependency[endpoint];
        if (ref.kind === 'workstream' && !workstreamIds.has(ref.id)) {
          context.addIssue({
            code: 'custom',
            path: ['dependencies', index, endpoint, 'id'],
            message: 'Workstream dependencies must reference a workstream in the plan.',
          });
        }
      }
    }

    if (hasWorkstreamCycle(workstreamIds, plan.dependencies)) {
      context.addIssue({
        code: 'custom',
        path: ['dependencies'],
        message: 'A Goal plan workstream graph must be acyclic.',
      });
    }
  });
export type GoalPlan = z.infer<typeof goalPlanSchema>;

export const goalAssignmentResponsibilitySchema = z.enum([
  'lead',
  'contributor',
  'reviewer',
  'approver',
  'observer',
]);
export type GoalAssignmentResponsibility = z.infer<typeof goalAssignmentResponsibilitySchema>;

export const goalAssignmentStatusSchema = z.enum([
  'proposed',
  'accepted',
  'active',
  'blocked',
  'completed',
  'declined',
  'cancelled',
]);
export type GoalAssignmentStatus = z.infer<typeof goalAssignmentStatusSchema>;

export const goalExecutionLeaseSchema = z
  .object({
    holder: goalActorSchema,
    acquiredAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict();
export type GoalExecutionLease = z.infer<typeof goalExecutionLeaseSchema>;

export const goalAssignmentSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    workstreamId: idSchema.optional(),
    title: nonEmptyTextSchema.max(300),
    responsibility: goalAssignmentResponsibilitySchema,
    capability: goalCapabilitySchema,
    assignee: goalActorSchema.nullable().default(null),
    status: goalAssignmentStatusSchema,
    executionLease: goalExecutionLeaseSchema.nullable().default(null),
    assignedBy: goalActorSchema,
    assignedAt: timestampSchema,
    handedOffFromAssignmentId: idSchema.optional(),
  })
  .strict();
export type GoalAssignment = z.infer<typeof goalAssignmentSchema>;

export const goalResourceSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    ref: goalResourceRefSchema,
    title: nonEmptyTextSchema.max(300),
    description: z.string().trim().max(2_000).optional(),
    attachedBy: goalActorSchema,
    attachedAt: timestampSchema,
  })
  .strict();
export type GoalResource = z.infer<typeof goalResourceSchema>;

export const goalEvidenceSourceKindSchema = z.enum([
  'primary',
  'first_party',
  'expert_input',
  'analysis',
]);
export type GoalEvidenceSourceKind = z.infer<typeof goalEvidenceSourceKindSchema>;

export const goalEvidenceSourceSchema = z
  .object({
    kind: goalEvidenceSourceKindSchema,
    title: nonEmptyTextSchema.max(500),
    url: z.string().url().optional(),
    publisher: z.string().trim().min(1).max(300).optional(),
    capturedAt: timestampSchema,
  })
  .strict();
export type GoalEvidenceSource = z.infer<typeof goalEvidenceSourceSchema>;

export const goalEvidenceSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    artifactId: idSchema.optional(),
    claim: nonEmptyTextSchema.max(8_000),
    source: goalEvidenceSourceSchema,
    excerpt: z.string().trim().min(1).max(4_000).optional(),
    confidence: z.number().min(0).max(1),
    createdBy: goalActorSchema,
    createdAt: timestampSchema,
  })
  .strict();
export type GoalEvidence = z.infer<typeof goalEvidenceSchema>;

export const goalRequestKindSchema = z.enum([
  'clarification',
  'decision',
  'approval',
  'evidence',
  'review',
  'handoff',
]);
export type GoalRequestKind = z.infer<typeof goalRequestKindSchema>;

export const goalRequestTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('actor'),
      actor: goalActorSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('assignment'),
      assignmentId: idSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('capability'),
      capability: goalCapabilitySchema,
    })
    .strict(),
]);
export type GoalRequestTarget = z.infer<typeof goalRequestTargetSchema>;

export const goalRequestResolutionPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('first_response') }).strict(),
  z.object({ kind: z.literal('all') }).strict(),
  z
    .object({
      kind: z.literal('quorum'),
      quorum: z.number().int().min(2),
    })
    .strict(),
]);
export type GoalRequestResolutionPolicy = z.infer<typeof goalRequestResolutionPolicySchema>;

export const goalInputFieldSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), multiline: z.boolean().default(false) }).strict(),
  z
    .object({
      kind: z.literal('choice'),
      options: z
        .array(z.object({ id: idSchema, label: nonEmptyTextSchema.max(300) }).strict())
        .min(1)
        .max(50),
      multiple: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal('money'),
      currency: z.string().regex(/^[A-Z]{3}$/),
      minimumMinor: z.number().int().nonnegative().optional(),
      maximumMinor: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('number'),
      unit: z.string().trim().min(1).max(80).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('date') }).strict(),
  z.object({ kind: z.literal('date_range') }).strict(),
  z.object({ kind: z.literal('boolean') }).strict(),
  z.object({ kind: z.literal('approval') }).strict(),
  z.object({ kind: z.literal('evidence'), allowText: z.boolean().default(true) }).strict(),
  z.object({ kind: z.literal('url') }).strict(),
  z.object({ kind: z.literal('asset_version_ref') }).strict(),
]);
export type GoalInputField = z.infer<typeof goalInputFieldSchema>;

export const goalFormFieldSchema = z
  .object({
    id: idSchema,
    path: z.string().trim().startsWith('/').max(1_000),
    label: nonEmptyTextSchema.max(300),
    help: z.string().trim().min(1).max(1_000).optional(),
    required: z.boolean().default(true),
    input: goalInputFieldSchema,
  })
  .strict();
export type GoalFormField = z.infer<typeof goalFormFieldSchema>;

export const goalExpectedResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text') }).strict(),
  z
    .object({
      kind: z.literal('choice'),
      options: z
        .array(z.object({ id: idSchema, label: nonEmptyTextSchema.max(300) }).strict())
        .min(1)
        .max(50),
    })
    .strict(),
  z
    .object({
      kind: z.literal('money'),
      currency: z.string().regex(/^[A-Z]{3}$/),
      minimumMinor: z.number().int().nonnegative().optional(),
      maximumMinor: z.number().int().nonnegative().optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.minimumMinor === undefined ||
        value.maximumMinor === undefined ||
        value.minimumMinor <= value.maximumMinor,
      {
        path: ['maximumMinor'],
        message: 'The maximum money response must not be less than the minimum.',
      },
    ),
  z.object({ kind: z.literal('approval') }).strict(),
  z.object({ kind: z.literal('evidence'), allowText: z.boolean().default(true) }).strict(),
  z
    .object({
      kind: z.literal('form'),
      fields: z.array(goalFormFieldSchema).min(1).max(50),
    })
    .strict()
    .superRefine((form, context) => {
      const ids = new Set<string>();
      const paths = new Set<string>();
      for (const [index, field] of form.fields.entries()) {
        if (ids.has(field.id)) {
          context.addIssue({
            code: 'custom',
            path: ['fields', index, 'id'],
            message: 'Goal form field IDs must be unique.',
          });
        }
        if (paths.has(field.path)) {
          context.addIssue({
            code: 'custom',
            path: ['fields', index, 'path'],
            message: 'Goal form field paths must be unique.',
          });
        }
        ids.add(field.id);
        paths.add(field.path);
      }
    }),
]);
export type GoalExpectedResponse = z.infer<typeof goalExpectedResponseSchema>;

export const goalStructuredResponseLeafValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: nonEmptyTextSchema.max(8_000) }).strict(),
  z.object({ kind: z.literal('choice'), optionId: idSchema }).strict(),
  z
    .object({ kind: z.literal('multi_choice'), optionIds: z.array(idSchema).min(1).max(50) })
    .strict(),
  z
    .object({
      kind: z.literal('money'),
      amountMinor: z.number().int().nonnegative(),
      currency: z.string().regex(/^[A-Z]{3}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('number'),
      value: z.number(),
      unit: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('date'), value: timestampSchema }).strict(),
  z
    .object({
      kind: z.literal('date_range'),
      startsAt: timestampSchema,
      endsAt: timestampSchema,
    })
    .strict()
    .refine((value) => Date.parse(value.startsAt) <= Date.parse(value.endsAt), {
      path: ['endsAt'],
      message: 'A Goal date range cannot end before it starts.',
    }),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('approval'), approved: z.boolean() }).strict(),
  z.object({ kind: z.literal('evidence'), note: z.string().trim().max(8_000).optional() }).strict(),
  z.object({ kind: z.literal('url'), url: z.string().url() }).strict(),
  z
    .object({
      kind: z.literal('asset_version_ref'),
      assetId: idSchema,
      versionId: idSchema,
    })
    .strict(),
]);
export type GoalStructuredResponseLeafValue = z.infer<typeof goalStructuredResponseLeafValueSchema>;

export const goalStructuredResponseValueSchema = z.discriminatedUnion('kind', [
  ...goalStructuredResponseLeafValueSchema.options,
  z
    .object({
      kind: z.literal('form'),
      values: z
        .array(
          z
            .object({
              fieldId: idSchema,
              value: goalStructuredResponseLeafValueSchema,
            })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
]);
export type GoalStructuredResponseValue = z.infer<typeof goalStructuredResponseValueSchema>;

export const goalRequestResponseSchema = z
  .object({
    id: idSchema,
    requestId: idSchema,
    responder: goalActorSchema,
    response: nonEmptyTextSchema.max(8_000),
    evidenceIds: z.array(idSchema).max(100).default([]),
    evidenceAttachmentIds: z.array(idSchema).max(100).default([]),
    structuredValue: goalStructuredResponseValueSchema.optional(),
    createdAt: timestampSchema,
  })
  .strict();
export type GoalRequestResponse = z.infer<typeof goalRequestResponseSchema>;

export const goalRequestStatusSchema = z.enum(['open', 'resolved', 'cancelled', 'expired']);
export type GoalRequestStatus = z.infer<typeof goalRequestStatusSchema>;

export const goalRequestSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    kind: goalRequestKindSchema,
    prompt: nonEmptyTextSchema.max(8_000),
    requestedBy: goalActorSchema,
    targets: z.array(goalRequestTargetSchema).min(1).max(100),
    resolutionPolicy: goalRequestResolutionPolicySchema,
    expectedResponse: goalExpectedResponseSchema.default({ kind: 'text' }),
    status: goalRequestStatusSchema,
    blockedNodeRefs: z.array(goalNodeRefSchema).max(100).default([]),
    checklistItemIds: z.array(idSchema).max(200).default([]),
    dueAt: timestampSchema.optional(),
    responses: z.array(goalRequestResponseSchema).max(200).default([]),
    resolution: z.string().trim().min(1).max(8_000).optional(),
    createdAt: timestampSchema,
    resolvedAt: timestampSchema.optional(),
  })
  .strict();
export type GoalRequest = z.infer<typeof goalRequestSchema>;

export const goalArtifactFormatSchema = z.enum(['markdown', 'json', 'link', 'file', 'dataset']);
export type GoalArtifactFormat = z.infer<typeof goalArtifactFormatSchema>;

export const goalArtifactRequirementSchema = z.enum(['core', 'conditional', 'optional']);
export type GoalArtifactRequirement = z.infer<typeof goalArtifactRequirementSchema>;

export const goalArtifactStatusSchema = z.enum([
  'proposed',
  'drafting',
  'ready_for_review',
  'accepted',
  'rejected',
  'superseded',
  'waived',
]);
export type GoalArtifactStatus = z.infer<typeof goalArtifactStatusSchema>;

export const goalArtifactSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    workstreamId: idSchema.optional(),
    templateArtifactId: idSchema.optional(),
    artifactType: idSchema,
    title: nonEmptyTextSchema.max(300),
    format: goalArtifactFormatSchema,
    contentSchemaId: idSchema.optional(),
    contentSchemaVersion: z.number().int().positive().optional(),
    validatedVersionId: idSchema.optional(),
    requirement: goalArtifactRequirementSchema,
    status: goalArtifactStatusSchema,
    /**
     * Library is the only persisted-content authority. Goal artifacts store
     * identity and workflow state while pinning accepted content to an exact
     * immutable Library version.
     */
    libraryAssetId: idSchema,
    acceptedVersionId: idSchema.optional(),
    /** Read-side snapshot of the Library head; never acceptance authority. */
    headVersionId: idSchema.optional(),
    requiredSectionIds: z.array(idSchema).max(100).default([]),
    completedSectionIds: z.array(idSchema).max(100).default([]),
    /**
     * Code-owned checklist identities snapshotted when the artifact is
     * materialized. Resolution lives in Goal checklist rows and may only be
     * advanced by an exact-version validation.
     */
    checklistItemIds: z.array(idSchema).max(1_000).default([]),
    dependencyIds: z.array(idSchema).max(200).default([]),
    evidenceIds: z.array(idSchema).max(500).default([]),
    resourceIds: z.array(idSchema).max(500).default([]),
    contributors: z.array(goalActorSchema).max(100).default([]),
    reviewers: z.array(goalActorSchema).max(100).default([]),
    createdBy: goalActorSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    acceptedBy: goalActorSchema.optional(),
    acceptedAt: timestampSchema.optional(),
    staleAt: timestampSchema.optional(),
    staleReason: z.string().trim().min(1).max(2_000).optional(),
    promotedToBrandDocumentId: idSchema.optional(),
    promotedAt: timestampSchema.optional(),
    waiverReason: z.string().trim().min(1).max(2_000).optional(),
    supersedesArtifactId: idSchema.optional(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (
      artifact.format === 'json' &&
      (!artifact.contentSchemaId || artifact.contentSchemaVersion === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['contentSchemaId'],
        message: 'Structured Goal artifacts must identify their content schema and version.',
      });
    }
    if (artifact.format === 'json' && artifact.checklistItemIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['checklistItemIds'],
        message: 'Structured Goal artifacts must snapshot their enforced checklist identities.',
      });
    }
    if (artifact.status === 'accepted') {
      const complete = new Set(artifact.completedSectionIds);
      const missing = artifact.requiredSectionIds.filter((sectionId) => !complete.has(sectionId));
      if (missing.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['completedSectionIds'],
          message: `Accepted artifacts must complete every required section: ${missing.join(', ')}.`,
        });
      }
      if (!artifact.acceptedBy || !artifact.acceptedAt) {
        context.addIssue({
          code: 'custom',
          path: ['acceptedBy'],
          message: 'Accepted artifacts must record who accepted them and when.',
        });
      }
      if (!artifact.acceptedVersionId) {
        context.addIssue({
          code: 'custom',
          path: ['acceptedVersionId'],
          message: 'Accepted artifacts must pin an exact Library version.',
        });
      }
      if (
        artifact.format === 'json' &&
        artifact.validatedVersionId !== artifact.acceptedVersionId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['validatedVersionId'],
          message: 'Accepted structured artifacts must validate the exact accepted version.',
        });
      }
    }
    if (artifact.status === 'waived' && !artifact.waiverReason) {
      context.addIssue({
        code: 'custom',
        path: ['waiverReason'],
        message: 'A waived artifact must record its waiver rationale.',
      });
    }
    if (artifact.staleAt && !artifact.staleReason) {
      context.addIssue({
        code: 'custom',
        path: ['staleReason'],
        message: 'A stale artifact must explain which accepted dependency changed.',
      });
    }
  });
export type GoalArtifact = z.infer<typeof goalArtifactSchema>;

export const goalDecisionOptionSchema = z
  .object({
    id: idSchema,
    label: nonEmptyTextSchema.max(300),
    description: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
export type GoalDecisionOption = z.infer<typeof goalDecisionOptionSchema>;

export const goalDecisionOutcomeSchema = z
  .object({
    optionId: idSchema.optional(),
    summary: nonEmptyTextSchema.max(4_000),
    structuredValue: goalStructuredResponseValueSchema.optional(),
  })
  .strict();
export type GoalDecisionOutcome = z.infer<typeof goalDecisionOutcomeSchema>;

export const goalDecisionSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    question: nonEmptyTextSchema.max(4_000),
    options: z.array(goalDecisionOptionSchema).max(50).default([]),
    outcome: goalDecisionOutcomeSchema,
    rationale: nonEmptyTextSchema.max(8_000),
    decidedBy: goalActorSchema,
    evidenceIds: z.array(idSchema).max(200).default([]),
    relatedArtifactIds: z.array(idSchema).max(100).default([]),
    relatedWorkstreamIds: z.array(idSchema).max(100).default([]),
    decidedAt: timestampSchema,
    supersedesDecisionId: idSchema.optional(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (!decision.outcome.optionId) return;
    if (!decision.options.some((option) => option.id === decision.outcome.optionId)) {
      context.addIssue({
        code: 'custom',
        path: ['outcome', 'optionId'],
        message: 'A selected decision outcome must reference one of the recorded options.',
      });
    }
  });
export type GoalDecision = z.infer<typeof goalDecisionSchema>;

export const goalAlignmentStatusSchema = z.enum([
  'aligned',
  'partially_aligned',
  'misaligned',
  'unknown',
]);
export type GoalAlignmentStatus = z.infer<typeof goalAlignmentStatusSchema>;

export const goalAlignmentSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    subject: goalNodeRefSchema,
    criterionIds: z.array(idSchema).min(1).max(50),
    status: goalAlignmentStatusSchema,
    rationale: nonEmptyTextSchema.max(4_000),
    evidenceIds: z.array(idSchema).max(100).default([]),
    checkedBy: goalActorSchema,
    checkedAt: timestampSchema,
  })
  .strict();
export type GoalAlignment = z.infer<typeof goalAlignmentSchema>;
