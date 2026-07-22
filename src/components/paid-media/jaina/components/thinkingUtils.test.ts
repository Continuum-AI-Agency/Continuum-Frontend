import { describe, expect, it } from 'bun:test';

import { deriveLiveStatusLabel, formatThoughtDuration, humanizeStage } from './thinkingUtils';

function entry(stage: string, data: Record<string, unknown> = {}) {
  return { stage, at: '2026-06-10T00:00:00.000Z', data };
}

function entryAt(at: string, stage = 'thinking') {
  return { stage, at, data: {} };
}

describe('humanizeStage', () => {
  it('turns a snake_case stage into a readable label', () => {
    expect(humanizeStage('report_ready')).toBe('Report ready');
  });

  it('falls back to Working for an empty stage', () => {
    expect(humanizeStage('')).toBe('Working');
  });
});

describe('deriveLiveStatusLabel', () => {
  it('returns null when there is no progress', () => {
    expect(deriveLiveStatusLabel([])).toBeNull();
  });

  it('surfaces the latest meaningful stage label', () => {
    const reasoning = [entry('thinking'), entry('synthesis_start')];
    expect(deriveLiveStatusLabel(reasoning)).toBe('Writing report');
  });

  it('names the tool being pulled from the latest tool_start entry', () => {
    const reasoning = [entry('thinking'), entry('tool_start', { tool_name: 'get_campaigns' })];
    expect(deriveLiveStatusLabel(reasoning)).toBe('Pulling get campaigns');
  });

  it('humanizes an unknown stage rather than dropping it', () => {
    expect(deriveLiveStatusLabel([entry('crunching_numbers')])).toBe('Crunching numbers');
  });

  it('tracks the most recent entry as the run progresses', () => {
    const reasoning = [
      entry('tool_start', { tool_name: 'get_campaigns' }),
      entry('tool_complete', { tool_name: 'get_campaigns' }),
      entry('synthesis_start'),
    ];
    expect(deriveLiveStatusLabel(reasoning)).toBe('Writing report');
  });
});

describe('formatThoughtDuration', () => {
  it('returns null with fewer than two entries', () => {
    expect(formatThoughtDuration([])).toBeNull();
    expect(formatThoughtDuration([entryAt('2026-06-10T00:00:00.000Z')])).toBeNull();
  });

  it('rounds the first-to-last span to whole seconds', () => {
    const reasoning = [
      entryAt('2026-06-10T00:00:00.000Z'),
      entryAt('2026-06-10T00:00:02.400Z'),
      entryAt('2026-06-10T00:00:05.100Z'),
    ];
    expect(formatThoughtDuration(reasoning)).toBe('Thought for 5s');
  });

  it('returns null for sub-second spans so the caller can fall back', () => {
    const reasoning = [entryAt('2026-06-10T00:00:00.000Z'), entryAt('2026-06-10T00:00:00.300Z')];
    expect(formatThoughtDuration(reasoning)).toBeNull();
  });

  it('ignores unparseable timestamps', () => {
    const reasoning = [entryAt('not-a-date'), entryAt('also-bad')];
    expect(formatThoughtDuration(reasoning)).toBeNull();
  });
});
