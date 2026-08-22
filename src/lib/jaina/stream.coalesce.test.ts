import { describe, expect, it } from 'bun:test';

import {
  coalesceJainaStreamEvents,
  createInitialJainaStreamState,
  type ParsedJainaStreamEvent,
  reduceJainaStreamEvent,
} from './stream';

function delta(
  type: 'response.output_json.delta' | 'response.output_text.delta' | 'response.plan.delta',
  text: string,
  extra: { item_id?: string; part_id?: string } = {},
): ParsedJainaStreamEvent {
  return { type, data: { ...extra, delta: text } } as ParsedJainaStreamEvent;
}

function tokenize(source: string, size = 5): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < source.length; offset += size) {
    chunks.push(source.slice(offset, offset + size));
  }
  return chunks;
}

function fold(events: readonly ParsedJainaStreamEvent[]) {
  return events.reduce(reduceJainaStreamEvent, createInitialJainaStreamState());
}

/** The whole optimization rests on this: coalescing must be exact, not approximate. */
function expectSameFold(events: readonly ParsedJainaStreamEvent[]) {
  const raw = fold(events);
  const coalesced = fold(coalesceJainaStreamEvents(events));

  expect(coalesced.reportJson).toBe(raw.reportJson);
  expect(coalesced.responseText).toBe(raw.responseText);
  expect(coalesced.planJson).toBe(raw.planJson);
  expect(coalesced.outputItemId).toBe(raw.outputItemId);
  expect(coalesced.report).toEqual(raw.report);
}

const REPORT = JSON.stringify({
  executive_summary: 'Spend concentrated in three campaign families over the last 7 days.',
  main_performance_snapshot: [
    { metric: 'Total Spend', value: 102985.51, change: 12.4, is_positive: true },
  ],
  campaign_table: [
    {
      campaign_name: 'ANDROID | FEED - App AdvantagePlus - Influencer',
      status: 'ACTIVE',
      spend: 41551.73,
      purchases: 56,
      cpa: 741.99,
      roas: 1.66,
      revenue: 69017.95,
    },
  ],
});

describe('coalesceJainaStreamEvents', () => {
  it('folds a tokenized report to the same state as the unmerged stream', () => {
    const events = tokenize(REPORT).map((chunk) =>
      delta('response.output_json.delta', chunk, { item_id: 'item_1', part_id: 'part_1' }),
    );

    expect(coalesceJainaStreamEvents(events).length).toBe(1);
    expectSameFold(events);
  });

  it('keeps prose out of reportJson when a turn switches from prose to a report', () => {
    const events = [
      ...tokenize('Here is what I found across the account. ').map((chunk) =>
        delta('response.output_text.delta', chunk, { item_id: 'item_1', part_id: 'part_1' }),
      ),
      ...tokenize(REPORT).map((chunk) =>
        delta('response.output_text.delta', chunk, { item_id: 'item_1', part_id: 'part_1' }),
      ),
    ];

    const raw = fold(events);
    expect(raw.responseText).toContain('Here is what I found');
    expectSameFold(events);
  });

  it('does not merge across item, part, or event-type boundaries', () => {
    const events = [
      delta('response.output_json.delta', '{"a":', { item_id: 'item_1' }),
      delta('response.output_json.delta', '1}', { item_id: 'item_2' }),
      delta('response.output_json.delta', '{"b":2}', { part_id: 'part_9' }),
      delta('response.output_text.delta', 'tail'),
    ];

    expect(coalesceJainaStreamEvents(events).length).toBe(4);
    expectSameFold(events);
  });

  it('leaves plan deltas alone, since their parsers read the individual chunk', () => {
    const events = tokenize('## Plan\n- step one\n- step two\n').map((chunk) =>
      delta('response.plan.delta', chunk),
    );

    expect(coalesceJainaStreamEvents(events).length).toBe(events.length);
    expectSameFold(events);
  });

  it('preserves order and passes non-delta frames through untouched', () => {
    const heartbeat = { type: 'response.heartbeat', data: { ts: 0 } } as ParsedJainaStreamEvent;
    const events = [
      delta('response.output_json.delta', '{"a"', { item_id: 'item_1' }),
      delta('response.output_json.delta', ':1', { item_id: 'item_1' }),
      heartbeat,
      delta('response.output_json.delta', '}', { item_id: 'item_1' }),
    ];

    const coalesced = coalesceJainaStreamEvents(events);
    expect(coalesced.map((event) => event.type)).toEqual([
      'response.output_json.delta',
      'response.heartbeat',
      'response.output_json.delta',
    ]);
    expectSameFold(events);
  });

  it('returns an empty list unchanged', () => {
    expect(coalesceJainaStreamEvents([])).toEqual([]);
  });
});
