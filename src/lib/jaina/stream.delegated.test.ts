import { describe, expect, it } from 'bun:test';
import {
  createInitialJainaStreamState,
  type ParsedJainaStreamEvent,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from './stream';

const delegationLine = (status: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'agent.delegated',
    data: {
      callId: 'call-1',
      callerAgent: 'jaina',
      calleeAgent: 'organic',
      query: 'What is working organically this week?',
      status,
      ...extra,
    },
  });

const fold = (lines: string[]) =>
  lines
    .map((line) => parseJainaStreamEvent(line))
    .filter((event): event is ParsedJainaStreamEvent => event !== null)
    .reduce(reduceJainaStreamEvent, createInitialJainaStreamState());

describe('reduceJainaStreamEvent — agent.delegated', () => {
  it('parses the frame off the wire (it is a known Jaina stream event)', () => {
    expect(parseJainaStreamEvent(delegationLine('running'))).toMatchObject({
      type: 'agent.delegated',
    });
  });

  it('records the delegation on the turn state', () => {
    const state = fold([delegationLine('running')]);
    expect(state.delegations).toHaveLength(1);
    expect(state.delegations[0]).toMatchObject({ callId: 'call-1', calleeAgent: 'organic' });
  });

  it('folds running → completed into ONE entry by callId', () => {
    const state = fold([
      delegationLine('running'),
      delegationLine('completed', { calleeSessionId: 'sess_callee', calleeRunId: 'run_callee' }),
    ]);
    expect(state.delegations).toHaveLength(1);
    expect(state.delegations[0]).toMatchObject({
      status: 'completed',
      calleeSessionId: 'sess_callee',
    });
  });

  it('keeps distinct calls apart', () => {
    const second = JSON.stringify({
      type: 'agent.delegated',
      data: {
        callId: 'call-2',
        callerAgent: 'jaina',
        calleeAgent: 'canvas',
        query: 'Build me a workflow',
        status: 'running',
      },
    });
    expect(fold([delegationLine('running'), second]).delegations).toHaveLength(2);
  });

  it('ignores a malformed delegation payload rather than corrupting the turn', () => {
    const malformed = JSON.stringify({
      type: 'agent.delegated',
      data: { callId: 'call-3', calleeAgent: 'nobody' },
    });
    const state = fold([malformed]);
    expect(state.delegations).toEqual([]);
  });

  it('starts with no delegations', () => {
    expect(createInitialJainaStreamState().delegations).toEqual([]);
  });
});
