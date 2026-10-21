import { describe, expect, it } from 'bun:test';
import { bulkPlacementSpecSchema } from '../streaming/bulk';
import { organicStreamFrameSchema } from '../streaming/organic';
import {
  HEADLESS_BATCH_MAX_ITEMS,
  headlessBatchCreateInputSchema,
  isHeadlessBatchRedirectReason,
  quoteHeadlessBatch,
} from './headless-batch';
import { persistedCardKey } from './persistedFrames';

const BRAND = '11111111-1111-4111-8111-111111111111';
const BATCH = '22222222-2222-5222-8222-222222222222';
const DRAFT = '33333333-3333-4333-8333-333333333333';

const pieces = (reels: number, stillSets: number) => [
  ...Array.from({ length: reels }, () => ({ format: 'reel' as const })),
  ...Array.from({ length: stillSets }, () => ({ format: 'still_set' as const })),
];

describe('quoteHeadlessBatch', () => {
  it('12 reels + 8 still sets fit the $150 window: $148 of pieces + $1 of copy, default max 1.6x', () => {
    const quote = quoteHeadlessBatch(pieces(12, 8), {
      castApprovalNeeded: false,
      windowRemainingUsd: 150,
    });
    expect(quote).toMatchObject({
      items: 20,
      reels: 12,
      stillSets: 8,
      capUsd: 148,
      copyUsd: 1,
      castPackUsd: 0,
      boundUsd: 149,
    });
    expect(quote.expectedUsd).toBe(50.2);
    expect(quote.maxUsd).toBe(237);
    expect(quote.refusal).toBeNull();
  });

  it('refuses over maxUsd, naming both dollars', () => {
    const quote = quoteHeadlessBatch(pieces(12, 8), {
      maxUsd: 100,
      castApprovalNeeded: false,
      windowRemainingUsd: 150,
    });
    expect(quote.refusal).toContain('$149.00');
    expect(quote.refusal).toContain('$100.00 maxUsd');
  });

  it('a given caption and a named draft carry no copy cost', () => {
    const slot = { scheduledAt: '2036-01-05T15:00:00.000Z', platform: 'instagram' as const };
    const quote = quoteHeadlessBatch(
      [
        { format: 'reel', slot, caption: 'Ours.' },
        { format: 'reel', slot: { draftId: DRAFT } },
        { format: 'still_set', slot },
      ],
      { castApprovalNeeded: false, windowRemainingUsd: 150 },
    );
    expect(quote).toMatchObject({ capUsd: 23, copyUsd: 0.05, boundUsd: 23.05 });
  });

  it('refuses over the window, and up to 8 character packs count toward the bound', () => {
    const quote = quoteHeadlessBatch(pieces(12, 8), {
      castApprovalNeeded: true,
      windowRemainingUsd: 149,
    });
    expect(quote).toMatchObject({ castPackUsd: 16, boundUsd: 165 });
    expect(quote.refusal).toContain('$165.00');
    expect(quote.refusal).toContain('only $149.00');
    expect(quote.refusal).toContain('$16.00 of character packs ($2.00 each, up to 8)');
  });

  it('a tour reel holds the long cap; a short concept and a still set keep theirs', () => {
    const quote = quoteHeadlessBatch(
      [
        { format: 'reel', blocks: { concept: 'tour' } },
        { format: 'reel', blocks: { concept: 'offer-direct' } },
        { format: 'still_set', blocks: { concept: 'tour' } },
      ],
      { maxUsd: 20, castApprovalNeeded: false, windowRemainingUsd: 150 },
    );
    expect(quote).toMatchObject({ reels: 2, capUsd: 32, expectedUsd: 11.53 });
    expect(quote.refusal).toContain(
      '1 reel at up to $9.00, 1 long reel at up to $18.00 and 1 still set',
    );
  });

  it('an unread window (null) refuses only on maxUsd', () => {
    expect(
      quoteHeadlessBatch(pieces(20, 30), { castApprovalNeeded: false, windowRemainingUsd: null })
        .refusal,
    ).toBeNull();
  });
});

describe('the create input', () => {
  it('takes ids only and caps the batch at 60', () => {
    const item = { format: 'reel', slot: { draftId: DRAFT }, blocks: { effectId: 'film-grain' } };
    expect(headlessBatchCreateInputSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(
      headlessBatchCreateInputSchema.safeParse({
        items: Array.from({ length: HEADLESS_BATCH_MAX_ITEMS + 1 }, () => item),
      }).success,
    ).toBe(false);
    expect(
      headlessBatchCreateInputSchema.safeParse({ items: [{ ...item, request_json: '{}' }] })
        .success,
    ).toBe(false);
    // A named draft keeps its own copy: a caption is for a new placeholder only.
    expect(
      headlessBatchCreateInputSchema.safeParse({ items: [{ ...item, caption: 'x' }] }).success,
    ).toBe(false);
  });

  it('a bulk placement carries its headless assignment', () => {
    const spec = {
      specId: 's1',
      trendId: null,
      platform: 'instagram',
      format: 'reel',
      pillar: 'p',
      angle: 'a',
      hook: 'h',
      objective: 'save',
      headless: { format: 'reel', blocks: { concept: 'pov' } },
    };
    expect(bulkPlacementSpecSchema.safeParse(spec).success).toBe(true);
  });
});

describe('the ui.headless_batch frame', () => {
  const status = {
    batchId: BATCH,
    brandId: BRAND,
    createdAt: '2026-10-18T00:00:00.000Z',
    capUsd: 9,
    expectedUsd: 3.5,
    maxUsd: 15,
    holdUsd: 9,
    items: [
      {
        index: 0,
        format: 'reel',
        draftId: DRAFT,
        jobId: null,
        state: 'needs_cast_approval',
        reason: 'waiting on the cast',
        holdUsd: 9,
        redirected: false,
        cover: null,
        outputCount: 0,
      },
    ],
    counts: { queued: 0, running: 0, needs_cast_approval: 1, ready: 0, failed: 0 },
    cast: { needed: true, drafts: [], approved: false },
    done: false,
  };

  it('is a member of the organic stream union and is persisted keyed by batch', () => {
    expect(
      organicStreamFrameSchema.safeParse({ type: 'ui.headless_batch', data: status }).success,
    ).toBe(true);
    expect(persistedCardKey('ui.headless_batch', status)).toBe(`headless_batch:${BATCH}`);
  });

  it('re-directs only the refusal classes', () => {
    expect(isHeadlessBatchRedirectReason('guided_refused:over_item_cap: x')).toBe(true);
    expect(isHeadlessBatchRedirectReason('nothing_planned: x')).toBe(true);
    expect(isHeadlessBatchRedirectReason('run_failed:provider_timeout')).toBe(false);
    expect(isHeadlessBatchRedirectReason(null)).toBe(false);
  });
});
