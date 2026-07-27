import { describe, expect, test } from 'bun:test';
import {
  AUTOMATION_WORKFLOW_SCHEMA_VERSION,
  automationAgentArtifactSchema,
  automationOutputContractRefSchema,
  automationStructuredArtifactSchema,
  automationTriggerBindingSchema,
  automationWorkflowDefinitionSchema,
  createLegacyAutomationWorkflow,
  validateAutomationCustomOutputSchema,
} from '.';

const schedule = {
  kind: 'daily' as const,
  time: '09:00',
  timezone: 'America/Phoenix',
};

describe('automation workflow v3 contracts', () => {
  test('normalizes existing workflow definitions without losing compatibility', () => {
    const existing = createLegacyAutomationWorkflow({
      agent: 'jaina',
      prompt: 'Summarize performance.',
      schedule,
      recipients: { memberUserIds: [], externalEmails: ['owner@example.com'] },
    });

    const parsed = automationWorkflowDefinitionSchema.parse({
      ...existing,
      schemaVersion: 2,
    });

    expect(parsed.schemaVersion).toBe(AUTOMATION_WORKFLOW_SCHEMA_VERSION);
    expect(parsed.nodes.some((node) => node.type === 'report')).toBe(true);
  });

  test('parses a visible formatter with a native report contract', () => {
    const parsed = automationWorkflowDefinitionSchema.parse({
      schemaVersion: 3,
      execution: { maxRunSeconds: 900, maxParallelNodes: 4 },
      nodes: [
        {
          id: 'manual',
          type: 'trigger.manual',
          label: 'Run manually',
          position: { x: 0, y: 0 },
          disabled: false,
          continueOnError: false,
          config: {},
        },
        {
          id: 'formatter',
          type: 'output.formatter',
          label: 'Format report',
          position: { x: 320, y: 0 },
          disabled: false,
          continueOnError: false,
          config: {
            contract: {
              kind: 'native',
              contractId: 'report.document',
              version: 1,
            },
            instructions: 'Create a decision-ready report.',
            timeoutSeconds: 180,
            maxAttempts: 2,
          },
        },
        {
          id: 'report',
          type: 'report',
          label: 'Render report',
          position: { x: 640, y: 0 },
          disabled: false,
          continueOnError: false,
          config: {
            title: 'Performance report',
            objective: 'Explain what changed.',
            audience: 'Marketing leadership',
            templateId: 'continuum-report',
            sections: [
              {
                id: 'summary',
                heading: 'Summary',
                guidance: '',
                required: true,
              },
            ],
            frontMatter: {},
          },
        },
      ],
      edges: [
        {
          id: 'manual-formatter',
          source: 'manual',
          sourceHandle: 'output',
          target: 'formatter',
          targetHandle: 'input',
        },
        {
          id: 'formatter-report',
          source: 'formatter',
          sourceHandle: 'output',
          target: 'report',
          targetHandle: 'input',
        },
      ],
    });

    expect(parsed.nodes[1]?.type).toBe('output.formatter');
  });

  test('keeps specialist contributions labeled through the formatter boundary', () => {
    const artifact = automationAgentArtifactSchema.parse({
      artifactId: 'artifact_jaina',
      nodeId: 'jaina',
      agent: 'jaina',
      contractId: 'agent.research',
      contractVersion: 1,
      value: 'Paid spend improved while acquisition cost fell.',
      evidenceRefs: ['evidence:4'],
      toolReceipts: ['tool:get_meta_overview:1'],
      completedAt: '2026-07-26T12:00:00.000Z',
    });
    const formatted = automationStructuredArtifactSchema.parse({
      artifactId: 'artifact_report',
      nodeId: 'formatter',
      contractId: 'report.document',
      contractVersion: 1,
      value: {
        title: 'Weekly performance',
        summary: 'Efficiency improved.',
        sections: [{ id: 'summary', heading: 'Summary', body: 'Efficiency improved.' }],
        frontMatter: {},
        markdown: '# Weekly performance',
      },
      sourceArtifactIds: [artifact.artifactId],
      completedAt: '2026-07-26T12:01:00.000Z',
    });

    expect(formatted.sourceArtifactIds).toEqual(['artifact_jaina']);
  });

  test('supports independent schedule, webhook, event, and metric trigger bindings', () => {
    const bindings = [
      {
        id: 'binding_schedule',
        automationId: 'automation_1',
        workflowVersionId: 'version_1',
        nodeId: 'schedule',
        type: 'schedule',
        enabled: true,
        config: { schedule },
      },
      {
        id: 'binding_webhook',
        automationId: 'automation_1',
        workflowVersionId: 'version_1',
        nodeId: 'hook',
        type: 'webhook',
        enabled: true,
        config: { endpointId: 'endpoint_1' },
      },
      {
        id: 'binding_event',
        automationId: 'automation_1',
        workflowVersionId: 'version_1',
        nodeId: 'event',
        type: 'event',
        enabled: true,
        config: {
          eventType: 'library.asset.approved',
          filters: {},
        },
      },
      {
        id: 'binding_metric',
        automationId: 'automation_1',
        workflowVersionId: 'version_1',
        nodeId: 'metric',
        type: 'metric',
        enabled: true,
        config: {
          metric: 'paid.roas',
          operator: 'gte',
          value: 3,
          window: '24h',
          cooldownMinutes: 60,
        },
      },
    ].map((binding) => automationTriggerBindingSchema.parse(binding));

    expect(bindings.map((binding) => binding.type)).toEqual([
      'schedule',
      'webhook',
      'event',
      'metric',
    ]);
  });

  test('accepts constrained custom schemas and rejects open or recursive schemas', () => {
    const valid = {
      type: 'object',
      additionalProperties: false,
      required: ['headline', 'items'],
      properties: {
        headline: { type: 'string', maxLength: 200 },
        items: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'value'],
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      },
    };

    expect(validateAutomationCustomOutputSchema(valid)).toEqual({
      ok: true,
      issues: [],
    });
    expect(
      automationOutputContractRefSchema.parse({
        kind: 'custom',
        contractId: 'custom.executive_digest',
        version: 1,
        name: 'Executive digest',
        schema: valid,
      }).kind,
    ).toBe('custom');

    expect(
      validateAutomationCustomOutputSchema({
        type: 'object',
        additionalProperties: true,
        properties: { child: { $ref: '#' } },
      }).ok,
    ).toBe(false);
    expect(
      validateAutomationCustomOutputSchema({
        type: 'string',
        enum: 'not-an-array',
      }).ok,
    ).toBe(false);
  });
});
