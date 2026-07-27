import { describe, expect, it } from 'bun:test';
import {
  CAMPAIGN_RESEARCH_TEMPLATE_ID,
  campaignResearchTemplate,
  createGoalArtifactMarkdown,
  createGoalRequestSchema,
  createGoalResponseSchema,
  getGoalTemplate,
  goalAlignmentSchema,
  goalArtifactDocumentSchema,
  goalArtifactSchema,
  goalCommandReceiptSchema,
  goalCommandRequestSchema,
  goalCommandSchema,
  goalDecisionSchema,
  goalDependencySchema,
  goalEventSchema,
  goalEventsQuerySchema,
  goalEvidenceSchema,
  goalParticipantSchema,
  goalPlanSchema,
  goalRequestSchema,
  goalResourceSchema,
  goalSchema,
  goalSnapshotSchema,
  listGoalsQuerySchema,
  listGoalsResponseSchema,
  materializeGoalTemplateArtifacts,
  parseGoalArtifactMarkdown,
  serializeGoalArtifactMarkdown,
} from '../index';

const HUMAN = { kind: 'human' as const, userId: 'user_1' };
const NOW = '2026-07-26T12:00:00.000Z';

describe('goalSchema', () => {
  it('accepts a private, durable goal with explicit success criteria', () => {
    const goal = goalSchema.parse({
      id: 'goal_1',
      brandId: 'brand_1',
      kind: 'campaign',
      title: 'Launch the fall campaign',
      objective: 'Produce an evidence-backed campaign plan.',
      successCriteria: [
        {
          id: 'criterion_1',
          statement: 'Campaign plan is accepted by the accountable owner.',
        },
      ],
      visibility: 'private',
      status: 'planning',
      createdBy: HUMAN,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });

    expect(goal.invitedMemberIds).toEqual([]);
    expect(goal.schemaVersion).toBe(1);
  });

  it('requires at least one invited member when visibility is invited', () => {
    const parsed = goalSchema.safeParse({
      id: 'goal_1',
      brandId: 'brand_1',
      kind: 'campaign',
      title: 'Launch the fall campaign',
      objective: 'Produce an evidence-backed campaign plan.',
      successCriteria: [{ id: 'criterion_1', statement: 'Plan accepted.' }],
      visibility: 'invited',
      status: 'planning',
      createdBy: HUMAN,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('goalPlanSchema', () => {
  const workstream = (id: string) => ({
    id,
    goalId: 'goal_1',
    planId: 'plan_1',
    title: id,
    objective: `Complete ${id}`,
    successCriteria: [`${id} accepted`],
    requiredCapabilities: ['strategy'],
    status: 'proposed' as const,
  });

  it('accepts an acyclic workstream dependency graph', () => {
    const plan = goalPlanSchema.parse({
      id: 'plan_1',
      goalId: 'goal_1',
      version: 1,
      status: 'proposed',
      summary: 'Research before activation.',
      workstreams: [workstream('research'), workstream('activation')],
      dependencies: [
        {
          id: 'dependency_1',
          goalId: 'goal_1',
          from: { kind: 'workstream', id: 'research' },
          to: { kind: 'workstream', id: 'activation' },
          relationship: 'blocks',
          required: true,
        },
      ],
      createdBy: HUMAN,
      createdAt: NOW,
    });

    expect(plan.workstreams).toHaveLength(2);
  });

  it('rejects a cyclic workstream dependency graph', () => {
    const parsed = goalPlanSchema.safeParse({
      id: 'plan_1',
      goalId: 'goal_1',
      version: 1,
      status: 'proposed',
      summary: 'Invalid cycle.',
      workstreams: [workstream('research'), workstream('activation')],
      dependencies: [
        {
          id: 'dependency_1',
          goalId: 'goal_1',
          from: { kind: 'workstream', id: 'research' },
          to: { kind: 'workstream', id: 'activation' },
          relationship: 'blocks',
          required: true,
        },
        {
          id: 'dependency_2',
          goalId: 'goal_1',
          from: { kind: 'workstream', id: 'activation' },
          to: { kind: 'workstream', id: 'research' },
          relationship: 'blocks',
          required: true,
        },
      ],
      createdBy: HUMAN,
      createdAt: NOW,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('Goal resources, evidence, requests, artifacts, dependencies, and alignment', () => {
  it('parses the durable collaboration records through their public schemas', () => {
    expect(
      goalResourceSchema.parse({
        id: 'resource_1',
        goalId: 'goal_1',
        ref: { kind: 'jaina_session', id: 'session_1' },
        title: 'Jaina research session',
        attachedBy: HUMAN,
        attachedAt: NOW,
      }).ref.kind,
    ).toBe('jaina_session');

    expect(
      goalEvidenceSchema.parse({
        id: 'evidence_1',
        goalId: 'goal_1',
        claim: 'The campaign needs an explicit measurement contract.',
        source: {
          kind: 'primary',
          title: 'Google Analytics campaign guidance',
          url: 'https://support.google.com/analytics/',
          capturedAt: NOW,
        },
        confidence: 0.9,
        createdBy: HUMAN,
        createdAt: NOW,
      }).confidence,
    ).toBe(0.9);

    expect(
      goalRequestSchema.parse({
        id: 'request_1',
        goalId: 'goal_1',
        kind: 'approval',
        prompt: 'Approve the measurement contract.',
        requestedBy: HUMAN,
        targets: [{ kind: 'capability', capability: 'measurement' }],
        resolutionPolicy: { kind: 'quorum', quorum: 2 },
        status: 'open',
        createdAt: NOW,
      }).resolutionPolicy,
    ).toEqual({ kind: 'quorum', quorum: 2 });

    expect(
      goalDependencySchema.parse({
        id: 'dependency_1',
        goalId: 'goal_1',
        from: { kind: 'artifact', id: 'charter' },
        to: { kind: 'artifact', id: 'activation-plan' },
        relationship: 'informs',
        required: true,
      }).relationship,
    ).toBe('informs');

    expect(
      goalAlignmentSchema.parse({
        id: 'alignment_1',
        goalId: 'goal_1',
        subject: { kind: 'artifact', id: 'artifact_1' },
        criterionIds: ['criterion_1'],
        status: 'aligned',
        rationale: 'The artifact directly addresses the acceptance criterion.',
        checkedBy: HUMAN,
        checkedAt: NOW,
      }).status,
    ).toBe('aligned');
  });

  it('does not accept an artifact until every required section and Library version are fixed', () => {
    const parsed = goalArtifactSchema.safeParse({
      id: 'artifact_1',
      goalId: 'goal_1',
      artifactType: 'campaign-charter',
      title: 'Campaign charter',
      format: 'markdown',
      requirement: 'core',
      status: 'accepted',
      libraryAssetId: 'library_asset_1',
      requiredSectionIds: ['objective', 'success-criteria'],
      completedSectionIds: ['objective'],
      createdBy: HUMAN,
      createdAt: NOW,
      updatedAt: NOW,
      acceptedBy: HUMAN,
      acceptedAt: NOW,
    });

    expect(parsed.success).toBe(false);
  });

  it('keeps persisted artifact authority in an exact Library asset version', () => {
    const artifact = goalArtifactSchema.parse({
      id: 'artifact_1',
      goalId: 'goal_1',
      artifactType: 'campaign-charter',
      title: 'Campaign charter',
      format: 'markdown',
      requirement: 'core',
      status: 'accepted',
      libraryAssetId: 'library_asset_1',
      headVersionId: 'version_2',
      acceptedVersionId: 'version_1',
      requiredSectionIds: ['objective'],
      completedSectionIds: ['objective'],
      createdBy: HUMAN,
      createdAt: NOW,
      updatedAt: NOW,
      acceptedBy: HUMAN,
      acceptedAt: NOW,
    });

    expect(artifact.acceptedVersionId).toBe('version_1');
    expect(
      goalArtifactSchema.safeParse({
        ...artifact,
        content: '# Inline content is not the persisted authority',
      }).success,
    ).toBe(false);
  });

  it('records immutable decisions separately from requests and chat', () => {
    const decision = goalDecisionSchema.parse({
      id: 'decision_1',
      goalId: 'goal_1',
      question: 'Which market launches first?',
      options: [
        { id: 'us', label: 'United States' },
        { id: 'uk', label: 'United Kingdom' },
      ],
      outcome: { optionId: 'us', summary: 'Launch in the United States first.' },
      rationale: 'The evidence dossier shows stronger readiness in the US.',
      decidedBy: HUMAN,
      evidenceIds: ['evidence_1'],
      decidedAt: NOW,
    });

    expect(decision.outcome.optionId).toBe('us');
  });
});

describe('campaign-creation template registry', () => {
  it('provides all core campaign artifacts with deterministic dependencies', () => {
    expect(getGoalTemplate(CAMPAIGN_RESEARCH_TEMPLATE_ID)).toBe(campaignResearchTemplate);
    expect(campaignResearchTemplate.version).toBe(1);
    expect(campaignResearchTemplate.artifacts.map((artifact) => artifact.id)).toEqual([
      'campaign-charter',
      'research-dossier',
      'campaign-strategy',
      'audience-strategy',
      'creative-strategy',
      'creative-production-plan',
      'media-budget-strategy',
      'measurement-plan',
      'compliance-register',
      'launch-readiness',
      'offer-destination-brief',
      'lifecycle-journey-plan',
      'partnership-creator-brief',
      'localization-plan',
      'experiment-plan',
      'campaign-execution-package',
    ]);

    const launch = campaignResearchTemplate.artifacts.find(
      (artifact) => artifact.id === 'launch-readiness',
    );
    expect(launch?.defaultDependencies).toEqual([
      'creative-production-plan',
      'media-budget-strategy',
      'measurement-plan',
      'compliance-register',
    ]);
    expect(launch?.requiredSections).toContainEqual({
      id: 'go-no-go',
      title: 'Go/No-Go Decision',
    });
  });

  it('requires every campaign stakeholder discipline before Jaina may execute launch', () => {
    expect(campaignResearchTemplate.workstreams.map((workstream) => workstream.id)).toEqual([
      'commercial-objective',
      'research',
      'campaign-strategy',
      'audience',
      'creative-strategy',
      'creative-operations',
      'media-budget',
      'measurement',
      'compliance-review',
      'launch-readiness',
      'campaign-compilation',
    ]);
    expect(campaignResearchTemplate.readiness.requiredCapabilities).toEqual([
      'strategy',
      'research',
      'paid_media',
      'creative',
      'measurement',
      'operations',
      'compliance',
      'budget_authority',
    ]);
    expect(campaignResearchTemplate.readiness.requiredArtifactIds).toEqual(
      campaignResearchTemplate.artifacts
        .filter((artifact) => artifact.requirement === 'core')
        .map((artifact) => artifact.id),
    );
  });

  it('materializes every core document plus explicitly activated campaign documents', () => {
    const defaultDocuments = materializeGoalTemplateArtifacts(campaignResearchTemplate);
    expect(defaultDocuments).toHaveLength(11);
    expect(defaultDocuments.every((document) => document.requirement === 'core')).toBe(true);

    const activatedDocuments = materializeGoalTemplateArtifacts(campaignResearchTemplate, [
      'localization-plan',
      'experiment-plan',
    ]);
    expect(activatedDocuments.map((document) => document.id)).toEqual([
      ...defaultDocuments.map((document) => document.id),
      'localization-plan',
      'experiment-plan',
    ]);
  });

  it('rejects unknown activated campaign documents before Goal persistence', () => {
    expect(() =>
      materializeGoalTemplateArtifacts(campaignResearchTemplate, ['imaginary-document']),
    ).toThrow('Unknown activated artifact definition');
  });
});

describe('Goal artifact Markdown', () => {
  const frontMatter = {
    schema_version: 1 as const,
    goal_id: 'goal_1',
    artifact_id: 'artifact_1',
    artifact_type: 'goal',
    template_id: CAMPAIGN_RESEARCH_TEMPLATE_ID,
    template_version: 1,
    status: 'drafting' as const,
    version: 1,
    dependencies: [],
    evidence_ids: ['evidence_1'],
    updated_at: NOW,
    updated_by: HUMAN,
  };

  it('round-trips validated YAML front matter and Markdown body', () => {
    const body = '# Campaign Charter\n\n## Objective\n\nLaunch well.';
    const serialized = serializeGoalArtifactMarkdown({ frontMatter, body });
    const parsed = parseGoalArtifactMarkdown(serialized);

    expect(parsed.frontMatter).toEqual(frontMatter);
    expect(parsed.body).toBe(body);
    expect(
      serializeGoalArtifactMarkdown({
        frontMatter: parsed.frontMatter!,
        body: parsed.body,
      }),
    ).toBe(serialized);
  });

  it('preserves the whole document when front matter is invalid', () => {
    const input = '---\ngoal_id: [broken\n---\n# Campaign Charter';
    expect(parseGoalArtifactMarkdown(input)).toEqual({
      frontMatter: null,
      body: input,
      raw: input,
    });
  });

  it('does not create a free-form Markdown authority for typed campaign artifacts', () => {
    expect(() =>
      createGoalArtifactMarkdown({
        templateId: CAMPAIGN_RESEARCH_TEMPLATE_ID,
        artifactDefinitionId: 'campaign-charter',
        goalId: 'goal_1',
        artifactId: 'artifact_1',
        updatedBy: HUMAN,
        updatedAt: NOW,
      }),
    ).toThrow('is not a Markdown artifact');
  });
});

describe('Goal commands and events', () => {
  it('parses a typed request command and its durable event', () => {
    const request = {
      id: 'request_1',
      goalId: 'goal_1',
      kind: 'clarification' as const,
      prompt: 'Which market has launch priority?',
      requestedBy: HUMAN,
      targets: [{ kind: 'capability' as const, capability: 'strategy' }],
      resolutionPolicy: { kind: 'first_response' as const },
      status: 'open' as const,
      createdAt: NOW,
    };

    const command = goalCommandSchema.parse({
      commandId: 'command_1',
      goalId: 'goal_1',
      actor: HUMAN,
      issuedAt: NOW,
      expectedRevision: 2,
      type: 'request.create',
      payload: { request },
    });
    expect(command.type).toBe('request.create');

    const event = goalEventSchema.parse({
      eventId: 'event_1',
      goalId: 'goal_1',
      commandId: 'command_1',
      seq: 12,
      revision: 2,
      ts: NOW,
      actor: HUMAN,
      type: 'request.created',
      data: { request },
    });
    expect(event.seq).toBe(12);
  });

  it('exposes the exact mutation vocabulary used by the Goal dispatcher', () => {
    const commandTypes = [
      'goal.activate',
      'goal.update',
      'goal.complete',
      'plan.propose',
      'plan.activate',
      'workstream.upsert',
      'assignment.upsert',
      'artifact.attach',
      'artifact.accept',
      'artifact.waive',
      'artifact.reconcile',
      'artifact.review',
      'artifact.promote',
      'request.create',
      'request.respond',
      'evidence.add',
      'decision.record',
      'resource.attach',
      'alignment.record',
    ] as const;

    const payloadByType: Record<(typeof commandTypes)[number], unknown> = {
      'goal.activate': {},
      'goal.update': { patch: { title: 'Updated title' } },
      'goal.complete': { summary: 'All required artifacts are accepted.' },
      'plan.propose': {
        plan: {
          id: 'plan_1',
          goalId: 'goal_1',
          version: 1,
          status: 'proposed',
          summary: 'One workstream.',
          workstreams: [
            {
              id: 'workstream_1',
              goalId: 'goal_1',
              planId: 'plan_1',
              title: 'Research',
              objective: 'Research the market.',
              successCriteria: ['Evidence accepted.'],
              requiredCapabilities: ['research'],
              status: 'proposed',
            },
          ],
          createdBy: HUMAN,
          createdAt: NOW,
        },
      },
      'plan.activate': { planId: 'plan_1', planVersion: 1 },
      'workstream.upsert': {
        workstream: {
          id: 'workstream_1',
          goalId: 'goal_1',
          planId: 'plan_1',
          title: 'Research',
          objective: 'Research the market.',
          successCriteria: ['Evidence accepted.'],
          requiredCapabilities: ['research'],
          status: 'active',
        },
      },
      'assignment.upsert': {
        assignment: {
          id: 'assignment_1',
          goalId: 'goal_1',
          title: 'Own research',
          responsibility: 'lead',
          capability: 'research',
          assignee: HUMAN,
          status: 'active',
          assignedBy: HUMAN,
          assignedAt: NOW,
        },
      },
      'artifact.attach': {
        artifact: {
          id: 'artifact_1',
          goalId: 'goal_1',
          artifactType: 'campaign-charter',
          title: 'Campaign Charter',
          format: 'markdown',
          requirement: 'core',
          status: 'drafting',
          libraryAssetId: 'asset_1',
          requiredSectionIds: ['objective'],
          createdBy: HUMAN,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
      'artifact.accept': { artifactId: 'artifact_1', acceptedVersionId: 'version_1' },
      'artifact.waive': { artifactId: 'artifact_1', reason: 'Not applicable.' },
      'artifact.reconcile': {
        artifactId: 'artifact_1',
        headVersionId: 'version_2',
        completedSectionIds: ['objective'],
        evidenceIds: ['evidence_1'],
      },
      'artifact.review': {
        artifactId: 'artifact_1',
        versionId: 'version_2',
        decision: 'approved',
      },
      'artifact.promote': {
        artifactId: 'artifact_1',
        category: 'campaign_deliverable',
      },
      'request.create': {
        request: {
          id: 'request_2',
          goalId: 'goal_1',
          kind: 'review',
          prompt: 'Review the charter.',
          requestedBy: HUMAN,
          targets: [{ kind: 'capability', capability: 'strategy' }],
          resolutionPolicy: { kind: 'first_response' },
          status: 'open',
          createdAt: NOW,
        },
      },
      'request.respond': {
        requestId: 'request_2',
        response: {
          id: 'response_1',
          requestId: 'request_2',
          responder: HUMAN,
          response: 'Approved.',
          createdAt: NOW,
        },
      },
      'evidence.add': {
        evidence: {
          id: 'evidence_1',
          goalId: 'goal_1',
          claim: 'A source supports this.',
          source: { kind: 'primary', title: 'Source', capturedAt: NOW },
          confidence: 1,
          createdBy: HUMAN,
          createdAt: NOW,
        },
      },
      'decision.record': {
        decision: {
          id: 'decision_1',
          goalId: 'goal_1',
          question: 'Proceed?',
          options: [{ id: 'yes', label: 'Yes' }],
          outcome: { optionId: 'yes', summary: 'Proceed.' },
          rationale: 'Evidence is sufficient.',
          decidedBy: HUMAN,
          decidedAt: NOW,
        },
      },
      'resource.attach': {
        resource: {
          id: 'resource_1',
          goalId: 'goal_1',
          ref: { kind: 'jaina_session', id: 'session_1' },
          title: 'Research session',
          attachedBy: HUMAN,
          attachedAt: NOW,
        },
      },
      'alignment.record': {
        alignment: {
          id: 'alignment_1',
          goalId: 'goal_1',
          subject: { kind: 'artifact', id: 'artifact_1' },
          criterionIds: ['criterion_1'],
          status: 'aligned',
          rationale: 'The charter addresses the criterion.',
          checkedBy: HUMAN,
          checkedAt: NOW,
        },
      },
    };

    for (const type of commandTypes) {
      expect(
        goalCommandSchema.parse({
          commandId: `command_${type}`,
          goalId: 'goal_1',
          actor: HUMAN,
          issuedAt: NOW,
          type,
          payload: payloadByType[type],
        }).type,
      ).toBe(type);
    }
  });
});

describe('Goal HTTP wrappers', () => {
  const goalFields = {
    brandId: 'brand_1',
    kind: 'campaign',
    title: 'Launch campaign',
    objective: 'Build an evidence-backed plan.',
    successCriteria: [{ id: 'criterion_1', statement: 'Plan accepted.' }],
    visibility: 'brand' as const,
  };
  const goalInput = {
    ...goalFields,
    templateId: CAMPAIGN_RESEARCH_TEMPLATE_ID,
  };

  it('parses list, create, snapshot, events, and command boundaries', () => {
    expect(listGoalsQuerySchema.parse({ brandId: 'brand_1' }).limit).toBe(50);
    expect(
      listGoalsResponseSchema.parse({
        goals: [],
        nextCursor: null,
      }).goals,
    ).toEqual([]);

    const parsedGoalInput = createGoalRequestSchema.parse(goalInput);
    expect(parsedGoalInput.templateId).toBe(CAMPAIGN_RESEARCH_TEMPLATE_ID);
    expect(parsedGoalInput.activatedArtifactIds).toBeUndefined();
    expect(
      createGoalResponseSchema.parse({
        goal: {
          id: 'goal_1',
          ...goalFields,
          status: 'planning',
          createdBy: HUMAN,
          createdAt: NOW,
          updatedAt: NOW,
          version: 1,
        },
        artifacts: [],
      }).goal.id,
    ).toBe('goal_1');

    expect(
      goalSnapshotSchema.parse({
        goal: {
          id: 'goal_1',
          ...goalFields,
          status: 'planning',
          createdBy: HUMAN,
          createdAt: NOW,
          updatedAt: NOW,
          version: 1,
        },
        plans: [],
        workstreams: [],
        assignments: [],
        artifacts: [],
        requests: [],
        evidence: [],
        decisions: [],
        resources: [],
        dependencies: [],
        alignments: [],
        participants: [
          {
            actor: HUMAN,
            displayName: 'Claighmor',
            detail: 'Goal lead',
            avatarUrl: 'https://example.com/avatar.png',
          },
        ],
        artifactDocuments: [
          {
            artifactId: 'artifact_1',
            libraryAssetId: 'asset_1',
            versionId: 'version_1',
            content: '# Campaign Charter',
            editable: true,
          },
        ],
        lastSeq: 0,
        revision: 1,
      }).lastSeq,
    ).toBe(0);

    expect(goalEventsQuerySchema.parse({ afterSeq: 12 }).limit).toBe(200);

    const command = {
      commandId: 'command_1',
      expectedRevision: 1,
      type: 'goal.activate' as const,
      payload: {},
    };
    expect(goalCommandRequestSchema.parse({ command }).command.type).toBe('goal.activate');
    expect(
      goalCommandReceiptSchema.parse({
        accepted: true,
        commandId: 'command_1',
        eventIds: ['event_1'],
        revision: 2,
        lastSeq: 14,
      }).lastSeq,
    ).toBe(14);
  });

  it('keeps participant and artifact content as read-side projections', () => {
    expect(
      goalParticipantSchema.parse({
        actor: { kind: 'agent', agent: 'jaina', runId: 'run_1' },
        displayName: 'Jaina',
        detail: 'Research facilitator',
      }).displayName,
    ).toBe('Jaina');

    expect(
      goalArtifactDocumentSchema.parse({
        artifactId: 'artifact_1',
        libraryAssetId: 'asset_1',
        versionId: 'version_3',
        contentUrl: 'https://example.com/library/artifact_1.md',
        editable: false,
      }).versionId,
    ).toBe('version_3');

    const snapshotWithoutProjectionFields = {
      goal: {
        id: 'goal_1',
        ...goalFields,
        status: 'planning',
        createdBy: HUMAN,
        createdAt: NOW,
        updatedAt: NOW,
        version: 1,
      },
      plans: [],
      workstreams: [],
      assignments: [],
      artifacts: [],
      requests: [],
      evidence: [],
      decisions: [],
      resources: [],
      dependencies: [],
      alignments: [],
      lastSeq: 0,
      revision: 1,
    };
    const parsed = goalSnapshotSchema.parse(snapshotWithoutProjectionFields);
    expect(parsed.participants).toEqual([]);
    expect(parsed.artifactDocuments).toEqual([]);
    expect(parsed.chatDeliveries).toEqual([]);
  });
});
