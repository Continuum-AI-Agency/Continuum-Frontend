import { describe, expect, it } from 'bun:test';
import {
  createInitialJainaStreamState,
  type ParsedJainaStreamEvent,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from './stream';

const narrationLine = (
  lines: Array<{ field: string; text: string }>,
  extra: Record<string, unknown> = {},
) =>
  JSON.stringify({
    type: 'agent.narration',
    data: {
      agent_id: 'worker-1',
      parent_agent_id: null,
      agent_name: 'ScopeWorker',
      display_name: 'Campaign scope',
      lines,
      ...extra,
    },
  });

const fold = (wire: string[]) =>
  wire
    .map((line) => parseJainaStreamEvent(line))
    .filter((event): event is ParsedJainaStreamEvent => event !== null)
    .reduce(reduceJainaStreamEvent, createInitialJainaStreamState());

describe('reduceJainaStreamEvent — agent.narration', () => {
  it('parses the frame off the wire (it is a known Jaina stream event)', () => {
    const parsed = parseJainaStreamEvent(
      narrationLine([{ field: 'findings', text: 'Spend is up' }]),
    );
    expect(parsed).toMatchObject({ type: 'agent.narration' });
  });

  it('appends each narration line to the progress transcript', () => {
    const state = fold([
      narrationLine([
        { field: 'findings', text: 'Spend up 22% week over week' },
        { field: 'insights', text: 'Retargeting is carrying the account' },
      ]),
    ]);

    const narration = state.progress.filter((entry) => entry.stage === 'agent_narration');
    expect(narration.map((entry) => entry.detail)).toEqual([
      'Spend up 22% week over week',
      'Retargeting is carrying the account',
    ]);
  });

  it('APPENDS across frames rather than replacing — the backend sends increments', () => {
    const state = fold([
      narrationLine([{ field: 'findings', text: 'first' }]),
      narrationLine([{ field: 'findings', text: 'second' }]),
      narrationLine([{ field: 'insights', text: 'third' }]),
    ]);

    expect(state.activeWorkers['worker-1']?.narration).toEqual(['first', 'second', 'third']);
    expect(
      state.progress.filter((entry) => entry.stage === 'agent_narration').map((e) => e.detail),
    ).toEqual(['first', 'second', 'third']);
  });

  it('keeps narration per worker so two workers do not merge', () => {
    const state = fold([
      narrationLine([{ field: 'findings', text: 'from A' }], { agent_id: 'worker-a' }),
      narrationLine([{ field: 'findings', text: 'from B' }], { agent_id: 'worker-b' }),
      narrationLine([{ field: 'findings', text: 'from A again' }], { agent_id: 'worker-a' }),
    ]);

    expect(state.activeWorkers['worker-a']?.narration).toEqual(['from A', 'from A again']);
    expect(state.activeWorkers['worker-b']?.narration).toEqual(['from B']);
  });

  it('ignores an empty batch instead of writing a blank transcript entry', () => {
    const state = fold([narrationLine([])]);
    expect(state.progress.filter((entry) => entry.stage === 'agent_narration')).toEqual([]);
  });

  it('carries the field label so the UI can distinguish a finding from a recommendation', () => {
    const state = fold([narrationLine([{ field: 'recommendations', text: 'Raise the budget' }])]);
    const entry = state.progress.find((p) => p.stage === 'agent_narration');
    expect((entry?.data as { field?: string })?.field).toBe('recommendations');
  });

  it('does not treat narration alone as a renderable answer', async () => {
    const { hasRenderableStreamContent } = await import('./stream');
    const state = fold([narrationLine([{ field: 'findings', text: 'still working' }])]);
    expect(hasRenderableStreamContent(state)).toBe(false);
  });

  it('rejects a malformed narration payload without corrupting state', () => {
    const state = fold([
      JSON.stringify({ type: 'agent.narration', data: { agent_id: 'w', lines: 'not-an-array' } }),
    ]);
    expect(state.progress.filter((entry) => entry.stage === 'agent_narration')).toEqual([]);
  });
});
