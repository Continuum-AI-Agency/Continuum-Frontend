import { describe, expect, it } from 'bun:test';
import {
  chartBlockV2Schema,
  dataTableBlockV2Schema,
  feedbackApprovalCommandSchema,
  frontendCheckpointReportSchema,
  handoffTraceEntrySchema,
  jainaChatRequestSchema,
  jainaChatStopRequestSchema,
  jainaChatStopResponseSchema,
  parsePlanDecisionPayload,
  parsePlanRequestedPayload,
  planApprovalCommandSchema,
  planDecisionCommandSchema,
  reportPayloadSchema,
  responseObjectivesSchema,
  responseObjectiveUpdatedSchema,
  responsePlanDecisionSchema,
  responsePlanRequestedSchema,
  responseReportArtifactJobStartedSchema,
} from './schemas';

describe('jainaChatRequestSchema', () => {
  it('accepts required request fields', () => {
    const result = jainaChatRequestSchema.safeParse({
      query: 'Analyze my campaigns',
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts optional canvas flags', () => {
    const result = jainaChatRequestSchema.safeParse({
      query: 'Analyze my campaigns',
      canvas: true,
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
        canvas: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts optional clarification id', () => {
    const result = jainaChatRequestSchema.safeParse({
      query: 'Campaign-level view',
      clarification: {
        id: 'clar_001',
      },
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
        sessionId: 'session_abc',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts include_thoughts in stream request contract', () => {
    const result = jainaChatRequestSchema.safeParse({
      query: 'Summarize spend shifts',
      include_thoughts: false,
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts force_report_artifact as private request metadata', () => {
    const result = jainaChatRequestSchema.safeParse({
      query: "Analyze last week's campaign performance",
      include_thoughts: true,
      force_report_artifact: true,
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
        sessionId: 'session_abc',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts typed app references in context and message metadata', () => {
    const reference = {
      id: '120000222',
      type: 'adset',
      label: 'Prospecting Women',
      source: 'jaina',
      metadata: {
        adsetId: '120000222',
        campaignId: '238000111',
        campaignName: 'Spring Sale',
        adAccountId: 'act_123',
      },
    };

    const result = jainaChatRequestSchema.safeParse({
      query: 'Compare @Prospecting Women against the account average',
      message_metadata: {
        references: [reference],
      },
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
        sessionId: 'session_abc',
        references: [reference],
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts durable Library attachments and media_asset references', () => {
    const reference = {
      id: 'asset-1',
      type: 'media_asset',
      label: 'Hero packshot',
      source: 'jaina',
      metadata: { mediaType: 'image/png' },
    };
    const result = jainaChatRequestSchema.safeParse({
      query: 'Analyze the attached media in the context of my paid media.',
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
        references: [reference],
        images: [
          {
            assetId: 'asset-1',
            versionId: 'version-1',
            url: 'https://signed.example/hero.png',
            name: 'hero.png',
            mediaType: 'image/png',
            storagePath: 'brand_456/assets/asset-1/hero.png',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('responseReportArtifactJobStartedSchema', () => {
  it('accepts the forced report artifact job event', () => {
    const result = responseReportArtifactJobStartedSchema.safeParse({
      type: 'response.report_artifact_job.started',
      data: {
        item_id: 'item_123',
        part_id: 'part_123',
        job_id: 'rjob_12345',
        status: 'pending',
        report_model: 'gemini-3.1-pro-preview',
        status_endpoint: '/api/agents/jaina/report-artifacts/jobs/rjob_12345',
        file_url_endpoint: '/api/agents/jaina/report-artifacts/jobs/rjob_12345/file-url',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data?.job_id).toBe('rjob_12345');
    }
  });
});

describe('frontendCheckpointReportSchema Resilience', () => {
  it('should parse a minimal report with only executive_summary', () => {
    const minimal = { executive_summary: 'Test summary' };
    const result = frontendCheckpointReportSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe('en');
      expect(result.data.blocks).toEqual([]);
      expect(result.data.sections).toEqual([]);
      expect(result.data.strategic_recommendations).toEqual([]);
    }
  });

  it('should parse a report with only executive_summary', () => {
    const minimal = { executive_summary: 'Test summary' };
    const result = frontendCheckpointReportSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.executive_summary).toBe('Test summary');
    }
  });

  it('should provide defaults for missing arrays', () => {
    const empty = {};
    const result = frontendCheckpointReportSchema.safeParse(empty);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections).toBeDefined();
      expect(Array.isArray(result.data.sections)).toBe(true);
      expect(result.data.sections.length).toBe(0);
      expect(result.data.blocks).toEqual([]);
      expect(result.data.performance_snapshot).toEqual([]);
      expect(result.data.execution_objectives).toEqual([]);
    }
  });
});

describe('reportPayloadSchema checkpoint wrappers', () => {
  it('parses checkpoint_report wrapper payloads with block-based sections', () => {
    const result = reportPayloadSchema.safeParse({
      checkpoint_report: {
        report_metadata: {
          title: 'Weekly Campaign Performance & Budget Analysis',
          date_range: 'Last 7 Days',
        },
        blocks: [
          {
            scope: 'account',
            title: 'Account Performance Summary',
            summary: 'ROAS is stable at high spend levels.',
            data: {
              headers: ['Metric', 'Value'],
              rows: [['Total Spend', '$151,593.91']],
            },
          },
          {
            scope: 'analysis',
            title: 'Key Insights & Recommendations',
            summary: 'Strategic shifts are required.',
            insight_recommendation: {
              items: [
                {
                  item_type: 'action',
                  title: 'Pause Non-Performing IOS Campaigns',
                  summary: 'IOS self-service has no purchases.',
                  rationale: 'Budget is being wasted.',
                },
              ],
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    if ('type' in result.data) {
      throw new Error('Expected structured report payload');
    }
    expect(result.data.report_title).toBe('Weekly Campaign Performance & Budget Analysis');
    expect(result.data.sections.length).toBeGreaterThan(0);
    expect(result.data.sections[0]?.heading).toBe('Account Performance Summary');
    expect(result.data.strategic_recommendations.length).toBeGreaterThan(0);
  });
});

describe('jainaChatStopRequestSchema', () => {
  it('accepts brand-scoped stop payload', () => {
    const result = jainaChatStopRequestSchema.safeParse({
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts ad-account stop payload', () => {
    const result = jainaChatStopRequestSchema.safeParse({
      ad_account_id: 'act_123',
    });

    expect(result.success).toBe(true);
  });

  it('rejects payloads that do not match either contract shape', () => {
    const result = jainaChatStopRequestSchema.safeParse({
      context: {
        adAccountId: 'act_123',
      },
    });

    expect(result.success).toBe(false);
  });
});

describe('jainaChatStopResponseSchema', () => {
  it('accepts valid stop response', () => {
    const result = jainaChatStopResponseSchema.safeParse({
      status: 'stopped',
      stopped_runs: 2,
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid status values', () => {
    const result = jainaChatStopResponseSchema.safeParse({
      status: 'done',
      stopped_runs: 1,
    });

    expect(result.success).toBe(false);
  });
});

describe('plan approval contracts', () => {
  it('accepts response.plan.requested payload', () => {
    const result = responsePlanRequestedSchema.safeParse({
      plan_id: 'plan_7f3b1c',
      tool_name: 'generate_performance_report',
      status: 'awaiting_approval',
      summary: 'Assemble full report',
      args: {
        reason: 'Requested report artifact',
        plan: true,
        scopes: ['account', 'creative'],
      },
      created_at: '2026-02-20T21:14:33.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('normalizes response.plan.requested camelCase payload', () => {
    const result = parsePlanRequestedPayload({
      planId: 'hitl_call_1',
      toolName: 'generate_performance_report',
      summary: 'Assemble a full report',
      args: {
        reason: 'User requested report',
        plan: true,
      },
      createdAt: '2026-02-20T21:14:33.000Z',
    });

    expect(result).not.toBeNull();
    expect(result?.plan_id).toBe('hitl_call_1');
  });

  it('accepts plan.decision command payload', () => {
    const result = planDecisionCommandSchema.safeParse({
      type: 'plan.decision',
      data: {
        decision: 'approve',
        planId: 'hitl_call_1',
        reason: 'Looks good',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts feedback approval compatibility payload', () => {
    const result = feedbackApprovalCommandSchema.safeParse({
      type: 'feedback',
      data: {
        approved: true,
        planId: 'hitl_call_1',
        reason: 'Proceed',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts plan.approval command payload', () => {
    const result = planApprovalCommandSchema.safeParse({
      type: 'plan.approval',
      data: {
        plan_id: 'plan_7f3b1c',
        approved: true,
        note: 'Proceed',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts response.plan.decision payload', () => {
    const result = responsePlanDecisionSchema.safeParse({
      plan_id: 'plan_7f3b1c',
      approved: false,
      status: 'rejected',
      note: 'Skip full report',
    });

    expect(result.success).toBe(true);
  });

  it('normalizes response.plan.decision variants', () => {
    const approve = parsePlanDecisionPayload({
      decision: 'approve',
      planId: 'hitl_call_1',
      reason: 'Looks good',
    });
    const deny = parsePlanDecisionPayload({
      approved: false,
      planId: 'hitl_call_1',
      reason: 'Need tighter scope',
    });

    expect(approve).not.toBeNull();
    expect(approve?.status).toBe('approved');
    expect(deny).not.toBeNull();
    expect(deny?.status).toBe('rejected');
  });
  it('normalizes response.plan.decision variants', () => {
    const approve = parsePlanDecisionPayload({
      decision: 'approve',
      planId: 'hitl_call_1',
      reason: 'Looks good',
    });
    const deny = parsePlanDecisionPayload({
      approved: false,
      planId: 'hitl_call_1',
      reason: 'Need tighter scope',
    });

    expect(approve).not.toBeNull();
    expect(approve?.status).toBe('approved');
    expect(deny).not.toBeNull();
    expect(deny?.status).toBe('rejected');
  });
});

describe('objective checklist stream contracts', () => {
  it('accepts response.objectives payloads', () => {
    const result = responseObjectivesSchema.safeParse({
      type: 'response.objectives',
      data: {
        objectives: [
          {
            id: 'objective_scope_campaigns',
            title: 'Scope campaigns',
            status: 'in_progress',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts unwrapped response.objectives arrays', () => {
    const result = responseObjectivesSchema.safeParse({
      type: 'response.objectives',
      data: [
        {
          id: 'objective_scope_campaigns',
          title: 'Scope campaigns',
          status: 'pending',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts response.objective.updated payloads', () => {
    const result = responseObjectiveUpdatedSchema.safeParse({
      type: 'response.objective.updated',
      data: {
        objective_id: 'objective_scope_campaigns',
        status: 'completed',
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('handoffTraceEntrySchema', () => {
  it('accepts valid handoff trace entry', () => {
    const entry = {
      correlation_id: 'corr_123',
      parent_correlation_id: null,
      from_scope: 'router',
      to_scope: 'analyst',
      objective: 'Deep dive into spend',
      entity_id: 'act_123',
      status: 'completed',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 1250,
      error: null,
    };
    const result = handoffTraceEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const entry = {
      correlation_id: 'corr_123',
      status: 'pending_approval', // not in enum
    };
    const result = handoffTraceEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});

describe('hasReportContent helper', () => {
  const { hasReportContent } = require('./schemas');

  it('returns true for direct_answer', () => {
    expect(hasReportContent({ type: 'direct_answer', content: 'hello' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(hasReportContent(null)).toBe(false);
  });

  it('returns true if executive_summary is present', () => {
    expect(
      hasReportContent({
        executive_summary: 'Summary',
        performance_snapshot: [],
        sections: [],
        strategic_recommendations: [],
        graphs: [],
      }),
    ).toBe(true);
  });

  it('returns false for empty report object', () => {
    expect(
      hasReportContent({
        executive_summary: '',
        performance_snapshot: [],
        sections: [],
        strategic_recommendations: [],
        graphs: [],
      }),
    ).toBe(false);
  });

  it('returns true if performance_snapshot has items', () => {
    expect(
      hasReportContent({
        executive_summary: '',
        performance_snapshot: [{ metric: 'M', value: 1 }],
        sections: [],
        strategic_recommendations: [],
        graphs: [],
      }),
    ).toBe(true);
  });

  it('returns true if blocks has items', () => {
    expect(
      hasReportContent({
        executive_summary: '',
        performance_snapshot: [],
        blocks: [
          {
            block_id: 'b1',
            category: 'graph',
            scope: 'account',
            title: 'Trend',
            summary: 'Trend summary',
            cached_sources: [],
            graphs: [{ title: 'ROAS', type: 'line', data: [{ label: 'Mon', value: 1.2 }] }],
          },
        ],
        sections: [],
        strategic_recommendations: [],
        graphs: [],
      }),
    ).toBe(true);
  });
});

describe('tableColumnV2Schema creative format', () => {
  it('parses a data_table whose column uses format "creative" (no degrade)', () => {
    const parsed = dataTableBlockV2Schema.safeParse({
      block_id: 'tbl_1',
      category: 'data_table',
      scope: 'account',
      title: 'Top creatives',
      priority: 'primary',
      columns: [
        { key: 'creative', label: 'Creative', format: 'creative', align: 'left' },
        { key: 'spend', label: 'Spend', format: 'currency', align: 'right' },
      ],
      rows: [{ creative: 'Ad 1', spend: 100 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.columns[0].format).toBe('creative');
    }
  });

  it('scopes "creative" to table columns — chart value_format still rejects it', () => {
    const chart = (valueFormat: string) => ({
      block_id: 'c1',
      category: 'chart',
      scope: 'account',
      title: 'Spend',
      priority: 'primary',
      chart_type: 'line',
      data: [{ date: 'Mon', spend: 1 }],
      chart_config: { spend: { label: 'Spend', color: '#000' } },
      category_key: 'date',
      value_format: valueFormat,
    });
    expect(chartBlockV2Schema.safeParse(chart('currency')).success).toBe(true);
    expect(chartBlockV2Schema.safeParse(chart('creative')).success).toBe(false);
  });
});
