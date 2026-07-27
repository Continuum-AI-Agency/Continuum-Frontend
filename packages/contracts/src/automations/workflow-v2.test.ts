import { describe, expect, test } from 'bun:test';
import {
  AUTOMATION_WORKFLOW_SCHEMA_VERSION,
  automationEvidenceEventSchema,
  automationSourceQuerySchemas,
  automationWorkflowDefinitionSchema,
  createLegacyAutomationWorkflow,
  testAutomationWorkflowResponseSchema,
} from '.';

const schedule = {
  kind: 'daily' as const,
  time: '09:00',
  timezone: 'UTC',
};

describe('automation workflow v2 contracts', () => {
  test('normalizes persisted v1 definitions to v2', () => {
    const legacy = createLegacyAutomationWorkflow({
      agent: 'jaina',
      prompt: 'Summarize performance.',
      schedule,
      recipients: { memberUserIds: [], externalEmails: ['owner@example.com'] },
    });
    const storedV1 = { ...legacy, schemaVersion: 1 as const };

    const parsed = automationWorkflowDefinitionSchema.parse(storedV1);

    expect(parsed.schemaVersion).toBe(AUTOMATION_WORKFLOW_SCHEMA_VERSION);
    const agent = parsed.nodes.find((node) => node.type === 'agent');
    expect(agent?.type === 'agent' ? agent.config.policy.toolMode : null).toBe('auto');
  });

  test('validates deterministic paid analytics source queries', () => {
    expect(
      automationSourceQuerySchemas.paid_analytics.parse({
        provider: 'meta',
        adAccountId: 'act_123',
        datePreset: 'last_30d',
        level: 'account',
        objectId: 'act_123',
        metrics: ['spend', 'impressions', 'clicks'],
        includeTopAds: true,
        topAdsLimit: 8,
      }),
    ).toMatchObject({
      provider: 'meta',
      datePreset: 'last_30d',
      includeTopAds: true,
    });
  });

  test('requires redacted evidence and exposes simulated action receipts', () => {
    const event = automationEvidenceEventSchema.parse({
      seq: 1,
      nodeId: 'paid-data',
      eventType: 'source.read',
      status: 'completed',
      occurredAt: new Date().toISOString(),
      output: { recordCount: 4 },
      redacted: true,
    });

    const response = testAutomationWorkflowResponseSchema.parse({
      runId: 'run_test_1',
      validation: { ok: true, issues: [], topologicalOrder: ['paid-data'] },
      nodeExecutions: [
        {
          nodeId: 'paid-data',
          nodeType: 'source',
          status: 'completed',
          selectedHandle: 'output',
          errorMessage: null,
          durationMs: 12,
        },
      ],
      evidence: [event],
      checks: [
        {
          id: 'required-evidence',
          name: 'Required evidence',
          status: 'pass',
          detail: '1 evidence event captured.',
        },
      ],
      actionReceipts: [
        {
          nodeId: 'email',
          actionKind: 'action.email',
          effect: 'simulated',
          status: 'completed',
          summary: 'Email validated but not sent.',
        },
      ],
    });

    expect(response.actionReceipts[0]?.effect).toBe('simulated');
    expect(response.evidence[0]?.redacted).toBe(true);
  });
});
