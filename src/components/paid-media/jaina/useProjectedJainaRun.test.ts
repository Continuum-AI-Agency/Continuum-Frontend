// Exercises the pure projection state machine that useProjectedJainaRun drives: partial
// streams fold into renderable state, re-advancing an unchanged log folds nothing twice,
// and runs that are terminal (at first sight or mid-projection) are declined so the
// persisted history stays the only renderer of finished turns.

import { describe, expect, test } from 'bun:test';
import type { AgentRunEventDto, AgentRunStatus } from '@continuum/contracts';
import type { AgentRunRecord } from '@/lib/agents/runStore';
import { advanceJainaRunProjection, createJainaRunProjection } from './useProjectedJainaRun';

const event = (seq: number, type: string, data: Record<string, unknown>): AgentRunEventDto => ({
  eventId: `evt-${seq}`,
  seq,
  ts: '2026-07-23T10:00:00.000Z',
  type,
  data,
});

const textDelta = (seq: number, delta: string): AgentRunEventDto =>
  event(seq, 'response.output_text.delta', { delta });

const record = (input: {
  runId?: string;
  status?: AgentRunStatus;
  events?: AgentRunEventDto[];
}): AgentRunRecord => {
  const events = input.events ?? [];
  return {
    run: {
      runId: input.runId ?? 'run-1',
      agent: 'jaina',
      sessionId: 'sess-1',
      status: input.status ?? 'running',
      createdAt: '2026-07-23T10:00:00.000Z',
    },
    events,
    lastSeq: events.length > 0 ? (events[events.length - 1]?.seq ?? -1) : -1,
  };
};

describe('advanceJainaRunProjection', () => {
  test('attaches to a live run and folds a partial stream into renderable state', () => {
    const partial = record({
      events: [
        event(0, 'agent.chat_started', { runId: 'run-1', sessionId: 'sess-1' }),
        textDelta(1, 'Spend is pacing '),
        textDelta(2, '12% ahead.'),
      ],
    });

    const next = advanceJainaRunProjection(createJainaRunProjection(), partial, null);

    expect(next.attachedRunId).toBe('run-1');
    expect(next.projectedSeq).toBe(2);
    expect(next.state?.responseText).toBe('Spend is pacing 12% ahead.');
    expect(next.state?.status).toBe('streaming');
  });

  test('re-advancing an unchanged log returns the same reference (no double fold)', () => {
    const partial = record({ events: [textDelta(0, 'Hello')] });
    const attached = advanceJainaRunProjection(createJainaRunProjection(), partial, null);

    const again = advanceJainaRunProjection(attached, partial, null);

    expect(again).toBe(attached);
    expect(again.state?.responseText).toBe('Hello');
  });

  test('a growing log only appends the new events', () => {
    const first = record({ events: [textDelta(0, 'Hello ')] });
    const attached = advanceJainaRunProjection(createJainaRunProjection(), first, null);

    const grown = record({ events: [textDelta(0, 'Hello '), textDelta(1, 'again')] });
    const next = advanceJainaRunProjection(attached, grown, null);

    expect(next.state?.responseText).toBe('Hello again');
    expect(next.projectedSeq).toBe(1);
  });

  test('declines a run that is terminal at first sight — history refetch owns it', () => {
    const finished = record({ status: 'completed', events: [textDelta(0, 'Done answer')] });

    const next = advanceJainaRunProjection(createJainaRunProjection(), finished, null);

    expect(next.attachedRunId).toBeNull();
    expect(next.state).toBeNull();
    expect(next.declinedRunIds.has('run-1')).toBe(true);

    const laterLook = advanceJainaRunProjection(
      next,
      record({ events: [textDelta(0, 'Done answer')] }),
      null,
    );
    expect(laterLook).toBe(next);
  });

  test('declines when the projected run turns terminal mid-projection', () => {
    const streaming = record({ events: [textDelta(0, 'Partial ')] });
    const attached = advanceJainaRunProjection(createJainaRunProjection(), streaming, null);
    expect(attached.attachedRunId).toBe('run-1');

    const cancelled = record({
      status: 'cancelled',
      events: [textDelta(0, 'Partial ')],
    });
    const next = advanceJainaRunProjection(attached, cancelled, null);

    expect(next.attachedRunId).toBeNull();
    expect(next.state).toBeNull();
    expect(next.declinedRunIds.has('run-1')).toBe(true);
  });

  test('never projects the run the live reader owns', () => {
    const projection = createJainaRunProjection();
    const owned = record({ events: [textDelta(0, 'Live-owned')] });

    const next = advanceJainaRunProjection(projection, owned, 'run-1');

    expect(next).toBe(projection);
  });

  test('unparseable frames advance the cursor without corrupting the fold', () => {
    const noisy = record({
      events: [event(0, 'jaina.bogus_event', { junk: true }), textDelta(1, 'Signal survives')],
    });

    const next = advanceJainaRunProjection(createJainaRunProjection(), noisy, null);

    expect(next.projectedSeq).toBe(1);
    expect(next.state?.responseText).toBe('Signal survives');
  });
});
