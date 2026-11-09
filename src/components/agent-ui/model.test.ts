import { describe, expect, it } from 'bun:test';
import {
  bestAttempt,
  bracketRounds,
  championPath,
  costSteps,
  formatAway,
  formatClock,
  formatTokens,
  formatUsd,
  groupRecap,
  layoutContext,
  niceTicks,
  orderSpans,
  type RecapItem,
  type RunSpan,
  recapBins,
  slowestSpan,
  summarizeRun,
  visibleRows,
} from './model';

const span = (id: string, over: Partial<RunSpan> = {}): RunSpan => ({
  id,
  kind: 'llm',
  name: id,
  startMs: 0,
  endMs: 1000,
  status: 'ok',
  ...over,
});

describe('orderSpans', () => {
  it('walks depth-first with children in start order', () => {
    const rows = orderSpans([
      span('b', { parentId: 'root', startMs: 500 }),
      span('root', { kind: 'agent' }),
      span('a', { parentId: 'root', startMs: 100 }),
      span('a1', { parentId: 'a', startMs: 200 }),
    ]);
    expect(rows.map((r) => [r.span.id, r.depth, r.hasChildren])).toEqual([
      ['root', 0, true],
      ['a', 1, true],
      ['a1', 2, false],
      ['b', 1, false],
    ]);
  });

  it('rolls cost and tokens up each branch', () => {
    const rows = orderSpans([
      span('root', { kind: 'agent' }),
      span('a', { parentId: 'root', costUsd: 0.1, tokens: 100 }),
      span('a1', { parentId: 'a', costUsd: 0.02, tokens: 20 }),
      span('b', { parentId: 'root', costUsd: 0.3 }),
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.span.id, r]));
    expect(byId.root.costUsd).toBeCloseTo(0.42);
    expect(byId.root.tokens).toBe(120);
    expect(byId.a.costUsd).toBeCloseTo(0.12);
    expect(byId.b.tokens).toBe(0);
  });

  it('treats a span with a missing parent as a root and never drops a cycle', () => {
    const rows = orderSpans([
      span('orphan', { parentId: 'gone', startMs: 50 }),
      span('x', { parentId: 'y', startMs: 10 }),
      span('y', { parentId: 'x', startMs: 20 }),
      span('self', { parentId: 'self', startMs: 5 }),
    ]);
    expect(rows.map((r) => r.span.id).sort()).toEqual(['orphan', 'self', 'x', 'y']);
    expect(rows.find((r) => r.span.id === 'orphan')?.depth).toBe(0);
  });
});

describe('visibleRows', () => {
  const rows = orderSpans([
    span('root', { kind: 'agent' }),
    span('a', { parentId: 'root', startMs: 1 }),
    span('a1', { parentId: 'a', startMs: 2 }),
    span('b', { parentId: 'root', startMs: 3 }),
    span('next', { startMs: 4 }),
  ]);
  const ids = (collapsed: string[]) => visibleRows(rows, new Set(collapsed)).map((r) => r.span.id);

  it('hides every descendant of a folded branch and nothing after it', () => {
    expect(ids(['a'])).toEqual(['root', 'a', 'b', 'next']);
    expect(ids(['root'])).toEqual(['root', 'next']);
    expect(ids([])).toEqual(['root', 'a', 'a1', 'b', 'next']);
  });

  it('ignores folding a leaf', () => {
    expect(ids(['a1'])).toEqual(['root', 'a', 'a1', 'b', 'next']);
  });
});

describe('summarizeRun', () => {
  it('adds up the run and counts calls and errors', () => {
    const summary = summarizeRun(
      [
        span('root', { kind: 'agent', startMs: 100, endMs: 9000 }),
        span('l', { startMs: 200, endMs: 3000, costUsd: 0.2, tokens: 1500 }),
        span('t', { kind: 'tool', startMs: 3000, endMs: 4000, status: 'error' }),
        span('t2', { kind: 'tool', startMs: 4000, endMs: undefined, status: 'running' }),
      ],
      12_000,
    );
    expect(summary).toEqual({
      startMs: 100,
      durationMs: 11_900,
      costUsd: 0.2,
      tokens: 1500,
      llmCalls: 1,
      toolCalls: 2,
      errors: 1,
      live: true,
    });
  });

  it('is all zeros for an empty run', () => {
    expect(summarizeRun([], 5000).durationMs).toBe(0);
    expect(summarizeRun([], 5000).live).toBe(false);
  });
});

describe('slowestSpan', () => {
  it('picks the longest finished call, never an agent or a running call', () => {
    expect(
      slowestSpan([
        span('agent', { kind: 'agent', endMs: 99_000 }),
        span('fast', { endMs: 500 }),
        span('slow', { kind: 'tool', startMs: 1000, endMs: 4000 }),
        span('live', { endMs: undefined, status: 'running' }),
      ]),
    ).toBe('slow');
  });

  it('marks nothing when there is no field to be slowest in', () => {
    expect(slowestSpan([span('only')])).toBeUndefined();
  });
});

describe('niceTicks', () => {
  it('steps by 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(45_000)).toEqual([0, 20_000, 40_000]);
    expect(niceTicks(9000)).toEqual([0, 5000]);
    expect(niceTicks(800)).toEqual([0, 200, 400, 600, 800]);
  });

  it('has only the origin for a run with no length', () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(Number.NaN)).toEqual([0]);
  });
});

describe('costSteps', () => {
  const spans = [
    span('agent', { kind: 'agent' }),
    span('cheap', { parentId: 'agent', costUsd: 0.1, tokens: 900 }),
    span('dear', { parentId: 'agent', costUsd: 0.3, tokens: 100 }),
    span('free', { kind: 'tool', parentId: 'agent' }),
  ];

  it('puts the most expensive first and starts each bar where the last ended', () => {
    const { steps, total } = costSteps(spans, 'cost');
    expect(total).toBeCloseTo(0.4);
    expect(steps.map((s) => s.span.id)).toEqual(['dear', 'cheap']);
    expect(steps[0].offset).toBe(0);
    expect(steps[0].share).toBeCloseTo(0.75);
    expect(steps[1].offset).toBeCloseTo(0.75);
    expect(steps[1].share).toBeCloseTo(0.25);
  });

  it('re-ranks by tokens', () => {
    expect(costSteps(spans, 'tokens').steps.map((s) => s.span.id)).toEqual(['cheap', 'dear']);
  });

  it('is empty when nothing cost anything', () => {
    expect(costSteps([span('a')], 'cost')).toEqual({ steps: [], total: 0 });
  });
});

describe('layoutContext', () => {
  it('groups parts by kind in a fixed order and leaves the rest free', () => {
    const layout = layoutContext(
      [
        { id: 'h', kind: 'history', label: 'Chat', tokens: 30 },
        { id: 's', kind: 'system', label: 'System prompt', tokens: 10 },
        { id: 'f2', kind: 'files', label: 'b.ts', tokens: 5 },
        { id: 'f1', kind: 'files', label: 'a.ts', tokens: 15 },
        { id: 'z', kind: 'tools', label: 'Empty', tokens: 0 },
      ],
      100,
    );
    expect(layout.groups.map((g) => [g.kind, g.tokens, g.share])).toEqual([
      ['system', 10, 0.1],
      ['files', 20, 0.2],
      ['history', 30, 0.3],
    ]);
    expect(layout.groups[1].parts.map((p) => p.id)).toEqual(['f1', 'f2']);
    expect(layout).toMatchObject({ usedTokens: 60, freeTokens: 40, freeShare: 0.4, over: false });
  });

  it('scales to what is used once the window overflows', () => {
    const layout = layoutContext([{ id: 'h', kind: 'history', label: 'Chat', tokens: 200 }], 100);
    expect(layout).toMatchObject({ freeTokens: 0, freeShare: 0, over: true });
    expect(layout.groups[0].share).toBe(1);
  });
});

describe('bestAttempt', () => {
  it('is the highest-scoring finished attempt, first one on a tie', () => {
    expect(
      bestAttempt([
        { id: 'a', label: 'A', status: 'done', score: 0.7 },
        { id: 'b', label: 'B', status: 'done', score: 0.9 },
        { id: 'c', label: 'C', status: 'done', score: 0.9 },
        { id: 'd', label: 'D', status: 'running', score: 0.99 },
        { id: 'e', label: 'E', status: 'failed', score: 1 },
      ]),
    ).toBe('b');
  });

  it('is undefined until something has finished with a score', () => {
    expect(bestAttempt([{ id: 'a', label: 'A', status: 'running' }])).toBeUndefined();
    expect(bestAttempt([{ id: 'a', label: 'A', status: 'done' }])).toBeUndefined();
  });
});

describe('bracket', () => {
  it('halves the field each round, rounding byes up', () => {
    expect(bracketRounds(8)).toEqual([4, 2, 1]);
    expect(bracketRounds(5)).toEqual([3, 2, 1]);
    expect(bracketRounds(2)).toEqual([1]);
    expect(bracketRounds(1)).toEqual([]);
  });

  const rounds = [
    [
      { a: 'a', b: 'b', winner: 'a' },
      { a: 'c', b: 'd', winner: 'd' },
    ],
    [{ a: 'a', b: 'd', winner: 'd' }],
  ];

  it('lights the champion path only once the final is decided', () => {
    const decided = championPath(rounds, 2);
    expect(decided.champion).toBe('d');
    expect([...decided.keys]).toEqual(['0:1', '1:0']);
    expect(championPath([rounds[0]], 2)).toEqual({ champion: undefined, keys: new Set() });
  });
});

describe('recap', () => {
  const items: RecapItem[] = [
    { id: '1', at: 1000, tone: 'done', title: 'Paused ad set' },
    { id: '2', at: 5000, tone: 'needs', title: 'Approve budget' },
    { id: '3', at: 9000, tone: 'done', title: 'Raised bid' },
    { id: '4', at: 9500, tone: 'failed', title: 'Sync failed' },
    { id: '5', at: 20_000, tone: 'done', title: 'Outside the window' },
  ];

  it('groups by tone, newest first', () => {
    const groups = groupRecap(items);
    expect(groups.done.map((i) => i.id)).toEqual(['5', '3', '1']);
    expect(groups.needs.map((i) => i.id)).toEqual(['2']);
    expect(groups.failed.map((i) => i.id)).toEqual(['4']);
  });

  it('counts each tone per stretch of the window, ignoring what falls outside', () => {
    const bins = recapBins(items, 0, 10_000, 2);
    expect(bins).toEqual([
      { start: 0, counts: { needs: 0, failed: 0, done: 1 } },
      { start: 5000, counts: { needs: 1, failed: 1, done: 1 } },
    ]);
  });

  it('puts an event at the very end of the window in the last bin', () => {
    expect(
      recapBins([{ id: 'x', at: 10_000, tone: 'done', title: 'x' }], 0, 10_000, 4)[3].counts.done,
    ).toBe(1);
  });
});

describe('formatters', () => {
  it('formatAway reads as the largest two units', () => {
    expect(formatAway(30_000)).toBe('<1m');
    expect(formatAway(45 * 60_000)).toBe('45m');
    expect(formatAway((3 * 60 + 12) * 60_000)).toBe('3h 12m');
    expect(formatAway((52 * 60 + 5) * 60_000)).toBe('2d 4h');
  });

  it('formatClock keeps short spans in ms and long ones in s or m', () => {
    expect(formatClock(820)).toBe('820ms');
    expect(formatClock(6900)).toBe('6.9s');
    expect(formatClock(20_000)).toBe('20s');
    expect(formatClock(90_000)).toBe('1.5m');
  });

  it('formatUsd shows sub-cent costs instead of rounding them to zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0042)).toBe('$0.0042');
    expect(formatUsd(1.234)).toBe('$1.23');
  });

  it('formatTokens is compact', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(85_231)).toBe('85.2K');
  });
});
