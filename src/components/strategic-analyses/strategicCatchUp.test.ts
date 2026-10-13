import { describe, expect, it } from 'bun:test';
import { planCatchUp } from './strategicCatchUp';

const runs = [
  { id: 'run-1', completedAt: '2026-10-01T10:00:00Z' },
  { id: 'run-2', completedAt: '2026-10-05T10:00:00Z' },
  { id: 'run-3', completedAt: '2026-10-11T10:00:00Z' },
];

describe('planCatchUp', () => {
  it('announces nothing on a first mount and only learns the newest completion', () => {
    const plan = planCatchUp(runs, null, new Set());
    expect(plan.announce).toEqual([]);
    expect(plan.lastCompletedAt).toBe('2026-10-11T10:00:00Z');
  });

  it('announces only the runs newer than the last one this browser saw', () => {
    const plan = planCatchUp(runs, '2026-10-05T10:00:00Z', new Set());
    expect(plan.announce.map((run) => run.id)).toEqual(['run-3']);
    expect(plan.lastCompletedAt).toBe('2026-10-11T10:00:00Z');
  });

  it('skips runs already announced live, and runs without a completion time', () => {
    const plan = planCatchUp(
      [...runs, { id: 'run-4', completedAt: null }],
      '2026-10-01T10:00:00Z',
      new Set(['run-2']),
    );
    expect(plan.announce.map((run) => run.id)).toEqual(['run-3']);
  });

  it('keeps the stamp when nothing newer completed', () => {
    const plan = planCatchUp([], '2026-10-05T10:00:00Z', new Set());
    expect(plan).toEqual({ announce: [], lastCompletedAt: '2026-10-05T10:00:00Z' });
    expect(planCatchUp([], null, new Set())).toEqual({ announce: [], lastCompletedAt: null });
  });
});
