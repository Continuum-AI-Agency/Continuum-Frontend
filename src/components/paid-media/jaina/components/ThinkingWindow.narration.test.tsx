import { describe, expect, it } from 'bun:test';
import type { JainaProgressEntry } from '@/lib/jaina/stream';
import { getLatestStreamingThought } from './ThinkingWindow';

/**
 * The collapsed view shows exactly ONE line — the most recent thing Jaina said. While
 * structured subagents run, the only thing she is saying is `agent_narration`, so the
 * ticker has to consider those entries or the collapsed view sits blank through the
 * longest stretch of the turn.
 */
const narration = (text: string): JainaProgressEntry => ({
  stage: 'agent_narration',
  at: '2026-07-29T00:00:00.000Z',
  detail: text,
  data: { agent_id: 'worker-1', field: 'findings' },
});

const thinking = (text: string): JainaProgressEntry => ({
  stage: 'thinking',
  at: '2026-07-29T00:00:00.000Z',
  detail: text,
  data: {},
});

const toolNoise = (): JainaProgressEntry => ({
  stage: 'tool_start',
  at: '2026-07-29T00:00:00.000Z',
  detail: 'get_key_metrics',
  data: {},
});

describe('getLatestStreamingThought', () => {
  it('returns null when nothing has been said', () => {
    expect(getLatestStreamingThought([])).toBeNull();
  });

  it('surfaces a narration line so the collapsed view is not blank during worker runs', () => {
    expect(getLatestStreamingThought([narration('Spend is up 22%')])).toBe('Spend is up 22%');
  });

  it('shows only the MOST RECENT line', () => {
    expect(
      getLatestStreamingThought([
        narration('first finding'),
        narration('second finding'),
        narration('third finding'),
      ]),
    ).toBe('third finding');
  });

  it('prefers a later narration line over an earlier thought', () => {
    expect(getLatestStreamingThought([thinking('let me check'), narration('spend is up')])).toBe(
      'spend is up',
    );
  });

  it('prefers a later thought over an earlier narration', () => {
    expect(getLatestStreamingThought([narration('spend is up'), thinking('so the story is')])).toBe(
      'so the story is',
    );
  });

  it('ignores tool machinery entries between prose lines', () => {
    expect(getLatestStreamingThought([narration('real finding'), toolNoise()])).toBe(
      'real finding',
    );
  });

  it('skips a blank narration entry and falls back to the last real line', () => {
    expect(getLatestStreamingThought([narration('real finding'), narration('   ')])).toBe(
      'real finding',
    );
  });
});
