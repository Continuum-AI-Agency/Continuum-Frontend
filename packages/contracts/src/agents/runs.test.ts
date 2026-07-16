import { describe, expect, it } from 'bun:test';
import {
  AGENT_RUN_QUEUED,
  AGENT_CHAT_STARTED,
  type AgentRunEventDto,
  agentRunDtoSchema,
  agentRunEventDtoSchema,
  agentRunQueuedFrameSchema,
  agentChatStartedFrameSchema,
  isTerminalAgentRunStatus,
  mergeAgentRunEvents,
  normalizeAgentRunStatus,
  runStatusFromFrameType,
} from './runs';

const event = (seq: number, type = 'response.output_text.delta'): AgentRunEventDto => ({
  eventId: `evt_${seq}`,
  seq,
  ts: '2026-07-12T00:00:00.000Z',
  type,
  data: {},
});

describe('normalizeAgentRunStatus', () => {
  // Jaina's run table predates this contract and stores `pending` for what Organic
  // calls `queued`. Without this mapping the two agents report different statuses
  // for the same lifecycle state and one FE store cannot hold both.
  it("maps Jaina's legacy pending onto queued", () => {
    expect(normalizeAgentRunStatus('pending')).toBe('queued');
  });

  it('passes the canonical statuses through untouched', () => {
    for (const status of ['queued', 'running', 'completed', 'failed', 'cancelled'] as const) {
      expect(normalizeAgentRunStatus(status)).toBe(status);
    }
  });

  it('degrades an unknown status to queued rather than dropping the run', () => {
    expect(normalizeAgentRunStatus('reticulating')).toBe('queued');
    expect(normalizeAgentRunStatus(undefined)).toBe('queued');
  });
});

describe('isTerminalAgentRunStatus', () => {
  it('stops tailing only once the run can emit nothing further', () => {
    expect(isTerminalAgentRunStatus('completed')).toBe(true);
    expect(isTerminalAgentRunStatus('failed')).toBe(true);
    expect(isTerminalAgentRunStatus('cancelled')).toBe(true);
    expect(isTerminalAgentRunStatus('queued')).toBe(false);
    expect(isTerminalAgentRunStatus('running')).toBe(false);
  });
});

describe('agentRunEventDtoSchema', () => {
  it('is the shared stream envelope plus the frame', () => {
    const parsed = agentRunEventDtoSchema.safeParse({
      eventId: 'evt_1',
      seq: 4,
      ts: '2026-07-12T00:00:00.000Z',
      type: 'ui.plan_card',
      data: { planId: 'plan_1' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an event with no seq — seq is the resume cursor, not optional', () => {
    const parsed = agentRunEventDtoSchema.safeParse({
      eventId: 'evt_1',
      ts: '2026-07-12T00:00:00.000Z',
      type: 'ui.plan_card',
      data: {},
    });
    expect(parsed.success).toBe(false);
  });
});

describe('mergeAgentRunEvents', () => {
  // The live NDJSON stream and the durable replay are two producers into one log and
  // they overlap by design (a re-attach re-reads the boundary frame). Dedupe by seq is
  // what makes running both at once safe.
  it('drops a frame the log already has, so an overlapping replay cannot double-render', () => {
    const current = [event(1), event(2)];
    expect(mergeAgentRunEvents(current, [event(2), event(3)]).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('orders by seq when a replay lands out of order behind the live stream', () => {
    expect(mergeAgentRunEvents([event(5)], [event(2), event(4)]).map((e) => e.seq)).toEqual([
      2, 4, 5,
    ]);
  });

  it('returns the same array when nothing is new, so React can skip the render', () => {
    const current = [event(1)];
    expect(mergeAgentRunEvents(current, [])).toBe(current);
    expect(mergeAgentRunEvents(current, [event(1)])).toBe(current);
  });
});

describe('run lifecycle frames', () => {
  it('agent.chat_started carries what a client needs to re-attach', () => {
    const parsed = agentChatStartedFrameSchema.safeParse({
      type: AGENT_CHAT_STARTED,
      data: { runId: 'run_1', sessionId: 'sess_1', agent: 'organic' },
    });
    expect(parsed.success).toBe(true);
  });

  it('agent.run_queued names the session the run is fenced behind', () => {
    const parsed = agentRunQueuedFrameSchema.safeParse({
      type: AGENT_RUN_QUEUED,
      data: { runId: 'run_2', sessionId: 'sess_1', agent: 'jaina', aheadOf: 1 },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('agentRunDtoSchema', () => {
  it('accepts a run from either agent', () => {
    for (const agent of ['organic', 'jaina'] as const) {
      const parsed = agentRunDtoSchema.safeParse({
        runId: 'run_1',
        agent,
        sessionId: 'sess_1',
        brandId: 'brand_1',
        status: 'running',
        createdAt: '2026-07-12T00:00:00.000Z',
        lastSeq: 12,
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe('runStatusFromFrameType', () => {
  // A detached client is subscribed to the LOG, not to a status endpoint — so the run's
  // ending has to be readable from the frames themselves, or it never learns the run finished.
  it('reads the run outcome off its terminal frame', () => {
    expect(runStatusFromFrameType('response.done')).toBe('completed');
    expect(runStatusFromFrameType('response.error')).toBe('failed');
    expect(runStatusFromFrameType('response.cancelled')).toBe('cancelled');
  });

  it("understands Jaina's bare error frame", () => {
    expect(runStatusFromFrameType('error')).toBe('failed');
  });

  it('says nothing about a frame that does not end the run', () => {
    expect(runStatusFromFrameType('response.output_text.delta')).toBeNull();
    expect(runStatusFromFrameType('ui.plan_card')).toBeNull();
  });
});
