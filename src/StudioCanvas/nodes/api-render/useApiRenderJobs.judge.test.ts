import { describe, expect, test } from 'bun:test';
import type { ApiRenderJob } from '@continuum/contracts';
import { __test__ } from './useApiRenderJobs';

/**
 * Polling has to outlive `finished` when — and only when — a verdict is still coming.
 *
 * The judge runs server-side after the job is marked finished, so a poll that stopped at
 * `finished` left the card saying "Checking the frame…" until a human pressed refresh. That is
 * the interaction the automatic check exists to remove. The other direction matters just as
 * much: a clean render must not poll forever waiting for a verdict nothing will ever write.
 */

const job = (over: Partial<ApiRenderJob>): ApiRenderJob =>
  ({
    id: 'j',
    status: 'finished',
    fit: null,
    judge: null,
    ...over,
  }) as ApiRenderJob;

const escalated = { comp: null, slots: [], escalate: true, why: 'unmeasurable' };
const clean = { comp: null, slots: [], escalate: false, why: 'every slot lands inside' };

describe('when the node keeps polling', () => {
  test('through the render itself', () => {
    for (const status of ['submitting', 'queued', 'rendering'] as const) {
      expect(__test__.isInFlight(job({ status }))).toBe(true);
    }
  });

  test('past finished while an escalated frame still owes a verdict', () => {
    expect(__test__.isInFlight(job({ fit: escalated, judge: null }))).toBe(true);
  });
});

describe('when it stops', () => {
  test('as soon as the verdict lands — whatever the verdict says', () => {
    for (const state of ['pass', 'fail', 'unknown'] as const) {
      const judged = job({ fit: escalated, judge: { state } as ApiRenderJob['judge'] });
      expect(__test__.isInFlight(judged)).toBe(false);
    }
  });

  test('immediately for a frame that measured cleanly — it is never judged', () => {
    expect(__test__.isInFlight(job({ fit: clean, judge: null }))).toBe(false);
  });

  test('for a job from before the check existed, which has no fit at all', () => {
    expect(__test__.isInFlight(job({ fit: null, judge: null }))).toBe(false);
  });

  test('for a failed render — there is no frame to judge', () => {
    expect(__test__.isInFlight(job({ status: 'failed', fit: escalated }))).toBe(false);
  });
});
