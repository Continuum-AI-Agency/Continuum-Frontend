import { describe, expect, it } from 'bun:test';

import { parseOrganicStreamEvent } from './streamEventParser';

describe('parseOrganicStreamEvent — pipeline frames', () => {
  it('parses pipeline.stage', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'pipeline.stage',
      data: {
        jobId: 'job-1',
        brandId: 'brand-1',
        planId: 'plan-1',
        planItemId: 'item-1',
        stage: 'draft',
        agentName: 'creative',
        pct: 45,
        status: 'active',
      },
    });
    expect(parsed.kind).toBe('pipelineStage');
    if (parsed.kind === 'pipelineStage') {
      expect(parsed.event.stage).toBe('draft');
      expect(parsed.event.pct).toBe(45);
      expect(parsed.event.planItemId).toBe('item-1');
    }
  });

  it('rejects pipeline.stage with an unknown stage', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'pipeline.stage',
      data: { jobId: 'j', brandId: 'b', stage: 'bogus' },
    });
    expect(parsed.kind).toBe('invalid');
  });

  it('parses a terminal ui.pipeline_card with preview + quality', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'ui.pipeline_card',
      data: {
        jobId: 'job-1',
        brandId: 'brand-1',
        planId: 'plan-1',
        status: 'completed',
        currentStage: 'merge',
        preview: { caption: 'hi', imageUrl: null, format: 'carousel' },
        quality: { passed: true, overallScore: 88, brandFitScore: 90 },
        draftId: 'draft-1',
      },
    });
    expect(parsed.kind).toBe('pipelineCard');
    if (parsed.kind === 'pipelineCard') {
      expect(parsed.card.status).toBe('completed');
      expect(parsed.card.preview?.caption).toBe('hi');
      expect(parsed.card.quality?.overallScore).toBe(88);
      expect(parsed.card.draftId).toBe('draft-1');
    }
  });

  it('parses ui.plan_status (previously dropped)', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'ui.plan_status',
      data: { planId: 'plan-1', itemId: 'item-1', status: 'executing' },
    });
    expect(parsed.kind).toBe('planStatus');
    if (parsed.kind === 'planStatus') {
      expect(parsed.event.itemId).toBe('item-1');
      expect(parsed.event.status).toBe('executing');
    }
  });

  it('parses agent.run_started from the nested data envelope', () => {
    // Regression: the Backend emits runId/jobId under `data` (matching the
    // contracts agentRunStartedSchema), but the parser previously read the top
    // level, so every frame was dropped as "invalid" and job tracking broke.
    const parsed = parseOrganicStreamEvent({
      type: 'agent.run_started',
      data: {
        runId: 'run-1',
        jobId: 'job-1',
        platform: 'instagram',
        planItemId: 'item-1',
        scheduledAt: '2025-06-10T18:00:00Z',
        trendId: null,
      },
    });
    expect(parsed.kind).toBe('runStarted');
    if (parsed.kind === 'runStarted') {
      expect(parsed.runId).toBe('run-1');
      expect(parsed.jobId).toBe('job-1');
    }
  });

  it('rejects agent.run_started without a runId', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'agent.run_started',
      data: { jobId: 'job-1' },
    });
    expect(parsed.kind).toBe('invalid');
  });

  it('parses tool.approval_required (previously dropped)', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'tool.approval_required',
      data: {
        approvalId: 'a1',
        toolCallId: 'tc1',
        toolName: 'publishDraft',
        input: { draftId: 'd1' },
      },
    });
    expect(parsed.kind).toBe('toolApproval');
    if (parsed.kind === 'toolApproval') {
      expect(parsed.approval.approvalId).toBe('a1');
      expect(parsed.approval.toolName).toBe('publishDraft');
    }
  });
});
