import assert from 'node:assert/strict';
import test from 'node:test';
import type { SoTReport } from '../../src/lib/jaina/schemas';
import {
  createInitialJainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from '../../src/lib/jaina/stream';

const sampleReport: SoTReport = {
  language: 'en',
  executive_summary: 'Creative A improved ROAS after the budget shift.',
  performance_snapshot: [
    {
      title: 'Topline',
      subtitle: null,
      rows: [
        {
          label: 'Spend',
          value: '$12,340',
          comparison: '+8%',
          status: 'up',
          source: null,
          cached: false,
        },
      ],
      notes: null,
    },
  ],
  sections: [
    {
      heading: 'Creative',
      scope: 'Ads',
      summary: 'Short-form video outperformed static.',
      highlights: [
        {
          category: 'CTR',
          text: 'Video CTR +1.4pp',
          impact: 'Higher intent',
          severity: 'positive',
          confidence: 'high',
          evidence: ['meta_ads'],
        },
      ],
      tables: [],
      actions: [
        {
          title: 'Scale video creative',
          rationale: 'Sustains CTR gains',
          expected_impact: 'Lower CPA',
          priority: 'now',
        },
      ],
      confidence: 'high',
      cached_sources: [],
      graphs: [],
    },
  ],
  strategic_recommendations: [
    {
      title: 'Shift budget to winners',
      rationale: 'Concentrate spend on high ROAS',
      expected_impact: 'Maintain efficiency',
      priority: 'next',
    },
  ],
  follow_up_questions: ['Which ad sets need new creative tests?'],
  handoff_trace: [],
  cached_sources: [],
  graphs: [],
};

test('accumulates JSON deltas into a SoTReport on response.done', () => {
  const json = JSON.stringify(sampleReport);
  const first = json.slice(0, 40);
  const second = json.slice(40);

  const events = [
    { type: 'response.created', data: { id: 'resp_1' } },
    { type: 'response.output_json.delta', data: { delta: first } },
    { type: 'response.output_json.delta', data: { delta: second } },
    { type: 'response.done', data: { id: 'resp_1' } },
  ];

  const finalState = events.reduce(reduceJainaStreamEvent, createInitialJainaStreamState());

  assert.equal(finalState.status, 'complete');
  assert.equal((finalState.report as SoTReport)?.executive_summary, sampleReport.executive_summary);
});

test('records progress details and tool results', () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'response.progress',
    data: { stage: 'handoff_start', to: 'Jaina_campaign_specialist' },
  });

  assert.equal(state.progress.length, 1);
  assert.equal(state.progress[0]?.detail, 'Delegating to Jaina_campaign_specialist');
});

test('records tool progress details', () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'response.progress',
    data: { stage: 'tool_start', tool_name: 'get_key_metrics' },
  });

  assert.equal(state.progress.length, 1);
  assert.equal(state.progress[0]?.detail, 'Running tool: get key metrics');
});

test('maps router tool label to Consulting the Council', () => {
  const startState = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'response.progress',
    data: { stage: 'tool_start', tool_name: 'router' },
  });

  const completeState = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'response.progress',
    data: { stage: 'tool_complete', tool_name: 'router' },
  });

  assert.equal(startState.progress[0]?.detail, 'Running tool: Consulting the Council');
  assert.equal(completeState.progress[0]?.detail, 'Finished tool: Consulting the Council');
});

test('sets error state on error event', () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'error',
    data: { message: 'boom' },
  });

  assert.equal(state.status, 'error');
  assert.equal(state.error, 'boom');
});

test('parseJainaStreamEvent handles invalid JSON and schemas gracefully', () => {
  assert.equal(parseJainaStreamEvent('invalid'), null);
  assert.equal(parseJainaStreamEvent(JSON.stringify({ missing: 'type' })), null);

  const valid = JSON.stringify({ type: 'test' });
  assert.equal(parseJainaStreamEvent(valid)?.type, 'test');
});

test('summarizes structured thought payloads into readable text', () => {
  const thoughtPayload = {
    summary: "I'm still encountering a technical hurdle.",
    tables: [{ title: 'Data Connectivity Status' }],
    insights: [
      {
        title: 'Authentication Blockage',
        description: 'Missing context value.',
      },
    ],
    recommendations: [
      {
        title: 'Re-authorize Meta Integration',
        priority: 'high',
      },
    ],
    next_steps: ['Refresh connection', 'Confirm permissions'],
  };

  const text = '```json\n' + JSON.stringify(thoughtPayload, null, 2) + '\n```';
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'thought',
    data: { text },
  });

  const detail = state.progress[0]?.detail ?? '';
  assert.ok(detail.includes(thoughtPayload.summary));
  assert.ok(detail.includes('Insights:'));
  assert.ok(detail.includes('Recommendations:'));
  assert.ok(detail.includes('Next steps:'));
  assert.ok(detail.includes('Tables:'));
});

test('parses adk.event with functionCall', () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'adk.event',
    data: {
      author: 'Jaina_specialist',
      content: {
        parts: [
          {
            functionCall: {
              name: 'test_tool',
              args: { foo: 'bar' },
              id: 'call_123',
            },
          },
        ],
      },
    },
  });

  assert.equal(state.toolCalls.length, 1);
  assert.equal(state.toolCalls[0].name, 'test_tool');
  assert.deepEqual(state.toolCalls[0].args, { foo: 'bar' });

  const progress = state.progress.find((p) => p.stage === 'tool_start');
  assert.ok(progress);
  assert.equal(progress.data.tool_name, 'test_tool');
});

test('parses adk.event with functionResponse', () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'adk.event',
    data: {
      author: 'Jaina_specialist',
      content: {
        parts: [
          {
            functionResponse: {
              name: 'test_tool',
              response: { result: 'success' },
              id: 'call_123',
            },
          },
        ],
      },
    },
  });

  assert.equal(state.toolResults.length, 1);
  assert.equal(state.toolResults[0].id, 'call_123');
  assert.deepEqual(state.toolResults[0].output, { result: 'success' });

  const progress = state.progress.find((p) => p.stage === 'tool_complete');
  assert.ok(progress);
  assert.equal(progress.data.tool_name, 'test_tool');
});

test('parses adk.event with author for handoff detection', () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: 'adk.event',
    data: {
      author: 'Jaina_campaign_specialist',
      content: {
        parts: [{ text: 'Thinking...' }],
      },
    },
  });

  assert.equal(state.progress.length, 1);
  assert.equal((state.progress[0].data as any).author, 'Jaina_campaign_specialist');
});

test('detects handoff when author changes', () => {
  const initialState = createInitialJainaStreamState();
  const state1 = reduceJainaStreamEvent(initialState, {
    type: 'adk.event',
    data: {
      author: 'Agent_A',
      content: { parts: [{ text: 'Hello' }] },
    },
  });

  const state2 = reduceJainaStreamEvent(state1, {
    type: 'adk.event',
    data: {
      author: 'Agent_B',
      content: { parts: [{ text: 'Hi there' }] },
    },
  });

  const handoff = state2.progress.find((p) => p.stage === 'handoff_start');
  assert.ok(handoff, 'Should inject handoff_start event');
  assert.equal(handoff.data.to, 'Agent_B');
  assert.equal(handoff.data.from, 'Agent_A');
});
