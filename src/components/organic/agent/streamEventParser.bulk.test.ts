import { describe, expect, it } from 'bun:test';

import { parseOrganicStreamEvent } from './streamEventParser';

const bulkPlan = {
  planId: 'bulkplan_1',
  kind: 'bulk',
  title: 'June launch',
  summary: '80 pieces, IG.',
  strategyBrief: {
    summary: 'Educate, prove, convert.',
    pillars: [{ name: 'Education' }],
    mix: [{ format: 'post', weight: 1 }],
    platformSplit: [{ platform: 'instagram', weight: 1 }],
    cadencePerDayPerPlatform: 2,
    horizonWeeks: 4,
  },
  schedule: { horizonWeeks: 4, postsPerDayPerPlatform: 2, startDate: '2026-06-01' },
  placements: [
    {
      specId: 's1',
      platform: 'instagram',
      format: 'reel',
      pillar: 'Education',
      angle: 'a',
      hook: 'h',
      objective: 'save',
      trendId: null,
      dayId: '2026-06-01',
      scheduledAt: '2026-06-01T11:00:00.000Z',
      shots: [{ role: 'hook', durationSec: 4, prompt: 'p' }],
    },
  ],
};

describe('parseOrganicStreamEvent — bulk frames', () => {
  it('parses a bulk ui.plan_card variant (kind=bulk)', () => {
    const parsed = parseOrganicStreamEvent({ type: 'ui.plan_card', data: bulkPlan });
    expect(parsed.kind).toBe('uiCard');
    if (parsed.kind === 'uiCard') {
      expect(parsed.card.type).toBe('bulk_plan_card');
      if (parsed.card.type === 'bulk_plan_card') {
        expect(parsed.card.data.placements).toHaveLength(1);
        expect(parsed.card.data.placements[0].shots).toHaveLength(1);
      }
    }
  });

  it('still parses a single (non-bulk) ui.plan_card as plan_card', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'ui.plan_card',
      data: {
        planId: 'p1',
        sessionId: 'sess-1',
        brandId: 'brand-1',
        userId: 'user-1',
        weekStart: '2026-06-01',
        title: 't',
        summary: 's',
        items: [
          {
            itemId: 'item-1',
            kind: 'create_post',
            platform: 'instagram',
            scheduledAt: '2026-06-01T12:00:00.000Z',
            format: 'post',
            trendId: null,
            trendTitle: null,
            angle: 'a',
            objective: 'save',
            audienceSegment: 'students',
            rationale: 'r',
            guidancePrompt: null,
            draftId: null,
          },
        ],
        estimatedDurationSeconds: 60,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    });
    expect(parsed.kind).toBe('uiCard');
    if (parsed.kind === 'uiCard') expect(parsed.card.type).toBe('plan_card');
  });

  it('parses ui.bulk_run', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'ui.bulk_run',
      data: { runId: 'run_bulkplan_1', planId: 'bulkplan_1', brandId: 'brand-1', total: 80 },
    });
    expect(parsed.kind).toBe('bulkRun');
    if (parsed.kind === 'bulkRun') {
      expect(parsed.run.runId).toBe('run_bulkplan_1');
      expect(parsed.run.total).toBe(80);
    }
  });

  it('rejects an invalid bulk plan card', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'ui.plan_card',
      data: { kind: 'bulk', planId: 'x' },
    });
    expect(parsed.kind).toBe('invalid');
  });
});
