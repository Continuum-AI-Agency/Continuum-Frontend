import { describe, expect, it } from 'bun:test';
import {
  createInitialJainaStreamState,
  type JainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from './stream';

describe('Jaina Integration Flow', () => {
  it('processes a full lifecycle of stream events', () => {
    let state: JainaStreamState = createInitialJainaStreamState();

    const events = [
      {
        type: 'response.created',
        data: {
          id: 'resp_1',
          object: 'realtime.response',
          status: 'in_progress',
          status_details: null,
          output: [],
        },
      },
      { type: 'response.progress', data: { stage: 'prefetch_start', target: 'campaigns' } },
      {
        type: 'tool.batch',
        data: {
          calls: [
            {
              id: 'tool_1',
              name: 'fetch_spend',
              args: {},
              metadata: {},
              correlation_id: 'c1',
              parent_correlation_id: null,
            },
          ],
          results: [
            {
              id: 'tool_1',
              name: 'fetch_spend',
              ok: true,
              cached: false,
              output: { spend: 1000 },
              correlation_id: 'c1',
              parent_correlation_id: null,
            },
          ],
        },
      },
      {
        type: 'handoff.start',
        data: {
          correlation_id: 'h1',
          from_scope: 'router',
          to_scope: 'analyst',
          objective: 'Analyze',
          entity_id: null,
        },
      },
      {
        type: 'response.checkpoint_report',
        data: {
          item_id: 'i1',
          part_id: 'p1',
          report: {
            language: 'en',
            executive_summary: 'Done.',
            performance_snapshot: [{ metric: 'Spend', value: 1000, status: 'neutral' }],
            sections: [],
            strategic_recommendations: [],
            follow_up_questions: [],
            handoff_trace: [
              {
                correlation_id: 'h1',
                parent_correlation_id: null,
                from_scope: 'router',
                to_scope: 'analyst',
                objective: 'Analyze',
                entity_id: null,
                status: 'completed',
                started_at: '2026-02-20T21:00:00Z',
                finished_at: '2026-02-20T21:00:01Z',
                duration_ms: 1000,
                error: null,
              },
            ],
            cached_sources: [],
            graphs: [],
          },
        },
      },
      {
        type: 'response.done',
        data: {
          id: 'resp_1',
          object: 'realtime.response',
          status: 'completed',
          status_details: null,
          output: [],
        },
      },
    ];

    for (const rawEvent of events) {
      const line = JSON.stringify(rawEvent);
      const event = parseJainaStreamEvent(line);
      expect(event).not.toBeNull();
      if (event) {
        state = reduceJainaStreamEvent(state, event);
      }
    }

    expect(state.status).toBe('complete');
    expect(state.toolCalls.length).toBe(1);
    expect(state.progress.length).toBeGreaterThan(3);

    const report = state.report;
    if (report && !('type' in report)) {
      expect(report.executive_summary).toBe('Done.');
      expect(report.performance_snapshot[0].metric).toBe('Spend');
      expect(report.handoff_trace.length).toBe(1);
      expect(report.handoff_trace[0].correlation_id).toBe('h1');
    } else {
      throw new Error('Report should be a FrontendCheckpointReport');
    }
  });

  it('handles stream errors correctly', () => {
    let state: JainaStreamState = createInitialJainaStreamState();

    const errorEvent = {
      type: 'error',
      data: {
        type: 'api_error',
        code: 'rate_limit',
        message: 'Too many requests',
        param: null,
      },
    };

    const event = parseJainaStreamEvent(JSON.stringify(errorEvent));
    expect(event).not.toBeNull();
    if (event) {
      state = reduceJainaStreamEvent(state, event);
    }

    expect(state.status).toBe('error');
    expect(state.error).toBe('Too many requests');
  });
});
