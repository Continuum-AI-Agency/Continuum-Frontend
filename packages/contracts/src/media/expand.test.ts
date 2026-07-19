import { describe, expect, it } from 'bun:test';

import {
  mediaExpandJobSchema,
  mediaExpandRequestSchema,
  mediaExpandResponseSchema,
  mediaExpandSkipReasonEnum,
} from './expand';

describe('mediaExpandRequestSchema', () => {
  it('accepts a brandId with 1..50 draftIds', () => {
    const parsed = mediaExpandRequestSchema.parse({
      brandId: 'brand-1',
      draftIds: ['d1', 'd2'],
    });
    expect(parsed.draftIds).toHaveLength(2);
  });

  it('rejects an empty draftIds array', () => {
    expect(mediaExpandRequestSchema.safeParse({ brandId: 'brand-1', draftIds: [] }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (strict wire contract)', () => {
    expect(
      mediaExpandRequestSchema.safeParse({
        brandId: 'brand-1',
        draftIds: ['d1'],
        force: true,
      }).success,
    ).toBe(false);
  });
});

describe('mediaExpandResponseSchema', () => {
  it('accepts enqueued and skipped entries side by side', () => {
    const parsed = mediaExpandResponseSchema.parse({
      jobs: [
        { draftId: 'd1', jobId: 'job-1' },
        { draftId: 'd2', jobId: null, error: 'already_realized' },
        { draftId: 'd3', jobId: null, error: 'enqueue_failed' },
      ],
    });
    expect(parsed.jobs).toHaveLength(3);
    expect(parsed.jobs[1].error).toBe('already_realized');
  });

  it('rejects a skip reason outside the enum', () => {
    expect(
      mediaExpandJobSchema.safeParse({ draftId: 'd1', jobId: null, error: 'nope' }).success,
    ).toBe(false);
  });

  it('names every skip reason the route can emit', () => {
    expect(mediaExpandSkipReasonEnum.options).toEqual([
      'not_found',
      'no_copy_yet',
      'already_realized',
      'user_supplied',
      'enqueue_failed',
    ]);
  });
});
