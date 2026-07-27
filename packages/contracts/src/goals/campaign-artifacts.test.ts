import { describe, expect, it } from 'bun:test';
import {
  CAMPAIGN_ARTIFACT_TYPES,
  campaignArtifactDocumentSchema,
  campaignArtifactSchemaRegistry,
  campaignChecklistRegistry,
  campaignExecutionPackageDataSchema,
  evaluateCampaignArtifactChecklist,
  goalExpectedResponseSchema,
  goalWorkProductSchema,
} from '../index';

const metadata = {
  schemaVersion: 1 as const,
  contentSchemaVersion: 1 as const,
  goalId: 'goal_1',
  artifactId: 'artifact_1',
  templateId: 'campaign-creation',
  templateVersion: 1,
  createdAt: '2026-07-27T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
};

describe('Campaign Goal artifact contracts', () => {
  it('gives every materializable artifact a strict schema and checklist identity', () => {
    expect(Object.keys(campaignArtifactSchemaRegistry).sort()).toEqual(
      [...CAMPAIGN_ARTIFACT_TYPES].sort(),
    );
    expect(Object.keys(campaignChecklistRegistry).sort()).toEqual(
      [...CAMPAIGN_ARTIFACT_TYPES].sort(),
    );
    expect(
      CAMPAIGN_ARTIFACT_TYPES.every(
        (artifactType) => campaignChecklistRegistry[artifactType].length > 0,
      ),
    ).toBe(true);
  });

  it('requires binding charter values and field-level provenance', () => {
    const parsed = campaignArtifactDocumentSchema.safeParse({
      ...metadata,
      artifactType: 'campaign-charter',
      data: {
        objective: {
          businessOutcome: 'Grow qualified pipeline.',
          campaignObjective: 'Generate 300 qualified demo requests.',
        },
        scopeAndOffer: {
          offerName: 'Fall demo program',
          valueProposition: 'See the product configured for your team.',
          destinationUrl: 'https://example.com/demo',
          includedMarkets: ['US'],
          excludedMarkets: [],
        },
        successCriteria: [
          {
            id: 'qualified-demos',
            metric: 'Qualified demo requests',
            target: 300,
            unit: 'count',
          },
        ],
        budgetAndTiming: {
          approvedBudget: { amountMinor: 2_500_000, currency: 'USD' },
          flight: {
            startsAt: '2026-09-01T00:00:00.000Z',
            endsAt: '2026-10-01T00:00:00.000Z',
            timezone: 'America/Phoenix',
          },
        },
        constraints: [],
        nonGoals: [],
        decisionRights: [
          {
            capability: 'budget_authority',
            decisions: ['Approve total spend'],
            approverUserId: 'user_1',
          },
        ],
      },
      provenance: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('does not allow the execution package to omit approved creative versions', () => {
    const parsed = campaignExecutionPackageDataSchema.safeParse({
      campaignName: 'Fall pipeline',
      objective: 'Generate qualified demos.',
      channels: ['meta'],
      budget: { amountMinor: 2_500_000, currency: 'USD' },
      flight: {
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-10-01T00:00:00.000Z',
        timezone: 'America/Phoenix',
      },
      audienceIds: ['audience_1'],
      creativeAssets: [],
      measurementPlanVersionId: 'version_measurement',
      complianceRegisterVersionId: 'version_compliance',
      launchReadinessVersionId: 'version_launch',
      acceptedArtifactVersions: [{ artifactId: 'artifact_charter', versionId: 'version_charter' }],
      approvalDecisionIds: ['decision_go'],
      unresolvedBlockers: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('requires a public rationale on every structured Jaina work product', () => {
    const parsed = goalWorkProductSchema.safeParse({
      schemaVersion: 1,
      goalId: 'goal_1',
      workNodeId: 'node_1',
      artifactId: 'artifact_1',
      outcome: 'needs_input',
      evidence: [],
      decisions: [],
      requests: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('supports a typed stakeholder form without falling back to prose', () => {
    const form = goalExpectedResponseSchema.parse({
      kind: 'form',
      fields: [
        {
          id: 'approved-budget',
          path: '/data/budgetAndTiming/approvedBudget',
          label: 'Approved campaign budget',
          required: true,
          input: { kind: 'money', currency: 'USD' },
        },
        {
          id: 'go-no-go',
          path: '/data/goNoGo/approved',
          label: 'Approve campaign launch',
          required: true,
          input: { kind: 'approval' },
        },
      ],
    });

    expect(form.kind).toBe('form');
    expect(form.fields).toHaveLength(2);
  });

  it('does not let model confidence replace required stakeholder authority', () => {
    const paths = campaignChecklistRegistry['campaign-charter'].map(
      (requirement) => requirement.path,
    );
    const document = campaignArtifactDocumentSchema.parse({
      ...metadata,
      artifactType: 'campaign-charter',
      data: {
        objective: {
          businessOutcome: 'Grow qualified pipeline.',
          campaignObjective: 'Generate 300 qualified demo requests.',
        },
        scopeAndOffer: {
          offerName: 'Fall demo program',
          valueProposition: 'See the product configured for your team.',
          destinationUrl: 'https://example.com/demo',
          includedMarkets: ['US'],
          excludedMarkets: [],
        },
        successCriteria: [{ id: 'demos', metric: 'Demos', target: 300, unit: 'count' }],
        budgetAndTiming: {
          approvedBudget: { amountMinor: 2_500_000, currency: 'USD' },
          flight: {
            startsAt: '2026-09-01T00:00:00.000Z',
            endsAt: '2026-10-01T00:00:00.000Z',
            timezone: 'America/Phoenix',
          },
        },
        constraints: [],
        nonGoals: [],
        decisionRights: [
          {
            capability: 'budget_authority',
            decisions: ['Approve total spend'],
            approverUserId: 'user_1',
          },
        ],
      },
      provenance: paths.map((path, index) => ({
        path,
        source:
          index === 0
            ? { kind: 'derived', derivation: 'The model inferred this objective.' }
            : {
                kind: 'request_response',
                requestId: `request_${index}`,
                responseId: `response_${index}`,
              },
        confidence: 0.99,
      })),
    });

    const checklist = evaluateCampaignArtifactChecklist({
      goalId: metadata.goalId,
      artifactId: metadata.artifactId,
      versionId: 'version_2',
      document,
      now: metadata.updatedAt,
    });

    expect(checklist[0]?.status).toBe('blocked');
    expect(checklist.slice(1).every((item) => item.status === 'resolved')).toBe(true);
  });
});
