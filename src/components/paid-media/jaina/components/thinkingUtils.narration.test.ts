import { describe, expect, it } from 'bun:test';
import type { JainaProgressEntry } from '@/lib/jaina/stream';
import { buildThinkingSegments, STAGE_LABELS } from './thinkingUtils';

/**
 * `agent.narration` frames land in `state.progress` with stage `agent_narration`
 * (see reduceJainaStreamEvent). They are the only thing a user sees while structured
 * subagents run — measured as up to 79% of a turn — so they must reach the reasoning
 * trace rather than being filtered out with the machinery stages.
 */
const narration = (text: string, agentId = 'worker-1'): JainaProgressEntry => ({
  stage: 'agent_narration',
  at: '2026-07-29T00:00:00.000Z',
  detail: text,
  data: { agent_id: agentId, display_name: 'Campaign scope', field: 'findings' },
});

const thinking = (text: string): JainaProgressEntry => ({
  stage: 'thinking',
  at: '2026-07-29T00:00:00.000Z',
  detail: text,
  data: {},
});

describe('buildThinkingSegments — agent_narration', () => {
  it('keeps narration in the trace instead of discarding it', () => {
    const segments = buildThinkingSegments([narration('Spend is up 22% week over week')], []);
    expect(segments.length).toBeGreaterThan(0);
  });

  it('renders narration as a thought segment so the expanded view shows the text', () => {
    const segments = buildThinkingSegments(
      [narration('Spend is up 22%'), narration('Retargeting is carrying the account')],
      [],
    );
    const thoughts = segments.filter((segment) => segment.kind === 'thought');
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0].kind === 'thought' ? thoughts[0].entries.map((e) => e.detail) : []).toEqual([
      'Spend is up 22%',
      'Retargeting is carrying the account',
    ]);
  });

  it('groups narration together with ordinary thinking, preserving order', () => {
    const segments = buildThinkingSegments(
      [thinking('Let me look at spend'), narration('Spend is up 22%')],
      [],
    );
    const thought = segments.find((segment) => segment.kind === 'thought');
    expect(thought?.kind === 'thought' ? thought.entries.map((e) => e.detail) : []).toEqual([
      'Let me look at spend',
      'Spend is up 22%',
    ]);
  });

  it('drops a narration entry with no text rather than rendering a blank line', () => {
    const segments = buildThinkingSegments([narration('   ')], []);
    expect(segments.filter((segment) => segment.kind === 'thought')).toHaveLength(0);
  });

  it('has a human-readable stage label', () => {
    expect(STAGE_LABELS.agent_narration).toBeTruthy();
  });
});
