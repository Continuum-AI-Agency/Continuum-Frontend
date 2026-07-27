// Proves the object path (`toParsedJainaStreamEvent`, fed by durable AgentRunEventDto
// objects) and the NDJSON line path (`parseJainaStreamEvent`) produce identical parsed
// events — and therefore fold identically through `reduceJainaStreamEvent`.

import { describe, expect, test } from 'bun:test';
import {
  createInitialJainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
  toParsedJainaStreamEvent,
} from './stream';

type Frame = { type: string; data: Record<string, unknown>; seq?: number } & Record<
  string,
  unknown
>;

const envelope = (seq: number) => ({
  eventId: `evt-${seq}`,
  seq,
  ts: '2026-07-23T10:00:00.000Z',
});

const representativeFrames: Frame[] = [
  {
    ...envelope(1),
    type: 'response.created',
    data: { id: 'resp-1', object: 'realtime.response', status: 'in_progress' },
  },
  {
    ...envelope(2),
    type: 'response.run.created',
    data: { run_id: 'run-1', session_id: 'sess-1' },
  },
  { ...envelope(3), type: 'response.output_text.delta', data: { delta: 'Hello ' } },
  {
    ...envelope(4),
    type: 'response.output_text.delta',
    data: { item_id: 'item-1', delta: 'world' },
  },
  {
    ...envelope(5),
    type: 'response.progress',
    data: { stage: 'synthesis_start', specialist_count: 3 },
  },
  {
    ...envelope(6),
    type: 'tool.call',
    data: { id: 'call-1', name: 'fetch_campaigns', args: { window: '7d' }, metadata: {} },
  },
  {
    ...envelope(7),
    type: 'tool.result',
    data: {
      id: 'call-1',
      name: 'fetch_campaigns',
      ok: true,
      cached: false,
      output: { rows: 2 },
    },
  },
  {
    ...envelope(8),
    type: 'response.done',
    data: { id: 'resp-1', object: 'realtime.response', status: 'completed' },
  },
  {
    ...envelope(9),
    type: 'error',
    data: { type: 'server_error', code: 'boom', message: 'Stream exploded', param: null },
  },
];

describe('toParsedJainaStreamEvent', () => {
  test('parses every representative frame identically to the NDJSON line path', () => {
    for (const frame of representativeFrames) {
      const fromObject = toParsedJainaStreamEvent(frame);
      const fromLine = parseJainaStreamEvent(JSON.stringify(frame));
      expect(fromObject).not.toBeNull();
      expect(fromObject).toEqual(fromLine);
    }
  });

  test('rejects an unknown frame type on both paths', () => {
    const bogus: Frame = { ...envelope(99), type: 'jaina.bogus_event', data: { anything: true } };
    expect(toParsedJainaStreamEvent(bogus)).toBeNull();
    expect(parseJainaStreamEvent(JSON.stringify(bogus))).toBeNull();
  });

  test('object-path events fold through reduceJainaStreamEvent like the live stream', () => {
    let state = createInitialJainaStreamState();
    for (const frame of representativeFrames.slice(0, 8)) {
      const parsed = toParsedJainaStreamEvent(frame);
      if (!parsed) continue;
      state = reduceJainaStreamEvent(state, parsed);
    }

    expect(state.runId).toBe('run-1');
    expect(state.responseText).toBe('Hello world');
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0]?.name).toBe('fetch_campaigns');
    expect(state.toolResults).toHaveLength(1);
    expect(state.toolResults[0]?.ok).toBe(true);
    expect(state.progress.some((entry) => entry.stage === 'synthesis_start')).toBe(true);
    expect(state.status).toBe('complete');
  });

  test('an error frame folds to an error state on the object path', () => {
    const errorFrame = representativeFrames[8] as Frame;
    const parsed = toParsedJainaStreamEvent(errorFrame);
    expect(parsed).not.toBeNull();
    const state = reduceJainaStreamEvent(
      createInitialJainaStreamState(),
      parsed as NonNullable<typeof parsed>,
    );
    expect(state.status).toBe('error');
    expect(state.error).toBe('Stream exploded');
  });
});
