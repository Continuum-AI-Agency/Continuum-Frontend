import { describe, expect, it } from 'bun:test';
import { PERSISTED_CARD_FRAME_TYPES, persistedCardKey } from '@continuum/contracts';
import { agentDelegatedHref, agentDelegatedLabel } from '@/components/agents/AgentDelegatedCard';
import { parseOrganicStreamEvent } from './streamEventParser';

const frame = (data: Record<string, unknown>) => ({ type: 'agent.delegated', data });

describe('parseOrganicStreamEvent — agent.delegated', () => {
  it('produces an agent_delegated card from a running delegation', () => {
    const parsed = parseOrganicStreamEvent(
      frame({
        callId: 'call-1',
        callerAgent: 'organic',
        calleeAgent: 'jaina',
        query: 'How did paid perform last week?',
        status: 'running',
        calleeRunId: 'run_callee',
        calleeSessionId: 'xagent_organic_brand-1',
      }),
    );

    expect(parsed.kind).toBe('uiCard');
    if (parsed.kind !== 'uiCard') return;
    expect(parsed.card.type).toBe('agent_delegated');
    if (parsed.card.type !== 'agent_delegated') return;
    expect(parsed.card.data).toMatchObject({
      callId: 'call-1',
      calleeAgent: 'jaina',
      status: 'running',
    });
  });

  it('carries the terminal status through so the card can fold running → completed', () => {
    const parsed = parseOrganicStreamEvent(
      frame({
        callId: 'call-1',
        callerAgent: 'organic',
        calleeAgent: 'jaina',
        query: 'q',
        status: 'completed',
      }),
    );
    expect(parsed.kind === 'uiCard' && parsed.card.type === 'agent_delegated').toBe(true);
  });

  it('rejects a malformed delegation frame instead of rendering a blank card', () => {
    const parsed = parseOrganicStreamEvent(frame({ callId: 'call-1', calleeAgent: 'nobody' }));
    expect(parsed.kind).toBe('invalid');
  });
});

describe('agent.delegated persistence identity', () => {
  it('is on the persisted card allowlist so the card survives reload', () => {
    expect(PERSISTED_CARD_FRAME_TYPES).toContain('agent.delegated');
  });

  it('collapses the running and terminal frames of one call to a single card', () => {
    expect(persistedCardKey('agent.delegated', { callId: 'call-1', status: 'running' })).toBe(
      persistedCardKey('agent.delegated', { callId: 'call-1', status: 'completed' }),
    );
  });
});

describe('AgentDelegatedCard helpers', () => {
  const base = {
    callId: 'call-1',
    callerAgent: 'organic' as const,
    calleeAgent: 'jaina' as const,
    query: 'How did paid perform?',
    status: 'completed' as const,
  };

  it('labels the callee agent', () => {
    expect(agentDelegatedLabel(base)).toBe('Asked Jaina');
  });

  it('prefers the frame deep link', () => {
    expect(agentDelegatedHref({ ...base, deepLink: '/scale?tab=jaina&sessionId=s1' })).toBe(
      '/scale?tab=jaina&sessionId=s1',
    );
  });

  it('derives the link from the callee session when no deep link was sent', () => {
    expect(agentDelegatedHref({ ...base, calleeSessionId: 's1', calleeRunId: 'r1' })).toBe(
      '/scale?tab=jaina&sessionId=s1&runId=r1',
    );
  });

  it('has no link before the callee session is known', () => {
    expect(agentDelegatedHref(base)).toBeNull();
  });
});
