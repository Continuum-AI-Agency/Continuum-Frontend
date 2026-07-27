import { describe, expect, it } from 'bun:test';
import { agentDelegatedFrameSchema, aiStudioComposerFrameSchema } from '../index';
import { organicStreamFrameSchema } from '../streaming/organic';
import {
  AGENT_DELEGATED,
  agentConversationPath,
  CROSS_AGENT_ANSWER_TEXT_MAX_CHARS,
  CROSS_AGENT_MAX_HOPS,
  crossAgentCallRequestSchema,
  crossAgentCallResultSchema,
  crossAgentProvenanceSchema,
  crossAgentSessionId,
} from './cross-agent';
import { agentRunDtoSchema } from './runs';

describe('crossAgentProvenanceSchema', () => {
  it('round-trips an agent-initiated provenance with a chain', () => {
    const provenance = {
      initiator: 'agent',
      initiatorAgent: 'organic',
      callId: 'call-1',
      callerRunId: 'run_caller',
      callerSessionId: 'sess_caller',
      chain: [{ agent: 'organic', runId: 'run_caller' }],
    };
    const parsed = crossAgentProvenanceSchema.parse(provenance);
    expect(parsed).toEqual(provenance as typeof parsed);
  });

  it('defaults the chain to empty and accepts external initiatorAgent ids', () => {
    const parsed = crossAgentProvenanceSchema.parse({
      initiator: 'agent',
      initiatorAgent: 'mcp:claude',
    });
    expect(parsed.chain).toEqual([]);
  });

  it('rejects unknown initiators — the enum is user|agent only', () => {
    expect(
      crossAgentProvenanceSchema.safeParse({ initiator: 'automation', chain: [] }).success,
    ).toBe(false);
  });

  it('rejects chain entries whose agent is not a known AgentKind', () => {
    expect(
      crossAgentProvenanceSchema.safeParse({
        initiator: 'agent',
        chain: [{ agent: 'mystery', runId: 'r1' }],
      }).success,
    ).toBe(false);
  });
});

describe('crossAgentCallRequestSchema', () => {
  const base = {
    target: 'jaina',
    query: 'How did paid perform last week?',
    brandId: 'brand-1',
    provenance: { initiator: 'agent', initiatorAgent: 'organic', chain: [] },
  };

  it('round-trips a minimal request', () => {
    const parsed = crossAgentCallRequestSchema.parse(base);
    expect(parsed.target).toBe('jaina');
    expect(parsed.provenance.initiator).toBe('agent');
  });

  it('accepts canvas targeting and caps timeoutMs at 300s', () => {
    expect(
      crossAgentCallRequestSchema.parse({
        ...base,
        target: 'canvas',
        canvas: { roomId: 'room-1' },
        timeoutMs: 300_000,
      }).timeoutMs,
    ).toBe(300_000);
    expect(crossAgentCallRequestSchema.safeParse({ ...base, timeoutMs: 300_001 }).success).toBe(
      false,
    );
  });
});

describe('crossAgentCallResultSchema', () => {
  it('round-trips a detached (running) result with a deep link', () => {
    const result = {
      callId: 'call-1',
      calleeAgent: 'organic',
      calleeRunId: 'run_x',
      calleeSessionId: 'xagent_jaina_brand-1',
      status: 'running',
      deepLink: '/organic?tab=agent&sessionId=xagent_jaina_brand-1',
    };
    expect(crossAgentCallResultSchema.parse(result)).toEqual(result as never);
  });

  it('enforces the answer-text cap', () => {
    const over = 'x'.repeat(CROSS_AGENT_ANSWER_TEXT_MAX_CHARS + 1);
    expect(
      crossAgentCallResultSchema.safeParse({
        callId: 'c',
        calleeAgent: 'jaina',
        status: 'completed',
        answerText: over,
      }).success,
    ).toBe(false);
  });

  it('carries a structured refusal', () => {
    const parsed = crossAgentCallResultSchema.parse({
      callId: 'c',
      calleeAgent: 'organic',
      status: 'refused',
      refusal: { reason: 'max_hops', message: `Delegation depth ${CROSS_AGENT_MAX_HOPS} reached.` },
    });
    expect(parsed.refusal?.reason).toBe('max_hops');
  });
});

describe('agent.delegated frame', () => {
  const frame = {
    type: AGENT_DELEGATED,
    data: {
      callId: 'call-1',
      callerAgent: 'organic',
      calleeAgent: 'jaina',
      query: 'q',
      status: 'running',
      calleeRunId: 'run_1',
      calleeSessionId: 'xagent_organic_b1',
    },
  };

  it('parses standalone', () => {
    expect(agentDelegatedFrameSchema.parse(frame).type).toBe('agent.delegated');
  });

  it('is a member of the organic stream union', () => {
    const parsed = organicStreamFrameSchema.parse(frame);
    expect(parsed.type).toBe('agent.delegated');
  });

  it('is a member of the composer stream union', () => {
    const parsed = aiStudioComposerFrameSchema.parse(frame);
    expect(parsed.type).toBe('agent.delegated');
  });
});

describe('agentConversationPath', () => {
  it('builds the organic deep link', () => {
    expect(agentConversationPath('organic', 'sess 1')).toBe(
      '/organic?tab=agent&sessionId=sess%201',
    );
  });

  it('builds the jaina deep link with an optional runId', () => {
    expect(agentConversationPath('jaina', 's1', 'r1')).toBe(
      '/scale?tab=jaina&sessionId=s1&runId=r1',
    );
  });

  it('builds room links for canvas and hyperframes', () => {
    expect(agentConversationPath('canvas', 'room-1')).toBe('/ai-studio?roomId=room-1');
    expect(agentConversationPath('hyperframes', 'room-2')).toBe('/ai-studio?roomId=room-2');
  });
});

describe('crossAgentSessionId', () => {
  it('is deterministic per (caller agent, brand)', () => {
    expect(crossAgentSessionId('organic', 'b1')).toBe('xagent_organic_b1');
    expect(crossAgentSessionId('organic', 'b1')).toBe(crossAgentSessionId('organic', 'b1'));
  });
});

describe('agentRunDtoSchema initiator', () => {
  it('accepts optional initiator/initiatorAgent', () => {
    const dto = agentRunDtoSchema.parse({
      runId: 'r1',
      agent: 'jaina',
      sessionId: 's1',
      status: 'running',
      createdAt: new Date().toISOString(),
      initiator: 'agent',
      initiatorAgent: 'organic',
    });
    expect(dto.initiator).toBe('agent');
  });

  it('still parses runs without initiator fields (back-compat)', () => {
    expect(
      agentRunDtoSchema.parse({
        runId: 'r1',
        agent: 'organic',
        sessionId: 's1',
        status: 'completed',
        createdAt: new Date().toISOString(),
      }).initiator,
    ).toBeUndefined();
  });
});
