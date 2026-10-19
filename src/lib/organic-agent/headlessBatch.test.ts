import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { HEADLESS_BATCH_STATUS_ROUTE, HEADLESS_CAST_APPROVE_ROUTE } from '@continuum/contracts';

const requestMock = mock(async (_args: { path: string; method?: string; body?: unknown }) => ({}));
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

const {
  approveHeadlessBatchCast,
  fetchHeadlessBatchStatus,
  headlessBatchQueryKey,
  headlessBatchRefreshDelayMs,
  headlessBatchStatusReader,
  plainBatchReason,
} = await import('./headlessBatch');

afterAll(() => mock.restore());

const BRAND = '11111111-1111-4111-8111-111111111111';
const BATCH = '22222222-2222-4222-8222-222222222222';
const ELEMENT = '55555555-5555-4555-8555-555555555555';

describe('plainBatchReason', () => {
  it('names failures from an allowlist only', () => {
    const failed = (reason: string | null) => plainBatchReason('failed', reason);
    expect(failed('nothing_planned')).toBe('The director found nothing to make from this brief.');
    expect(failed('run_failed:run_blocked:budget')).toBe('The run was blocked before it started.');
    expect(failed('run_failed:render_timeout')).toBe('The run failed before it finished.');
    expect(failed('guided_refused:over_item_cap:9.40')).toBe(
      'It would have cost more than its cap.',
    );
    expect(failed('guided_refused:off_brand')).toBe('The director turned this brief down.');
    // Free text, a sentence included, never reaches the screen.
    expect(failed('Render worker 7 crashed while encoding')).toBe('It could not be made.');
    expect(failed(BATCH)).toBe('It could not be made.');
    expect(failed(null)).toBeNull();
  });

  it('names only the one wait that is not its state label', () => {
    expect(plainBatchReason('queued', `waiting on the first piece's cast ${BATCH}`)).toBe(
      "Starts once the first piece's cast is approved.",
    );
    expect(plainBatchReason('needs_cast_approval', 'waiting on the cast approval')).toBeNull();
    expect(
      plainBatchReason(
        'needs_cast_approval',
        '2 drafted person/place element(s) wait on a brand user',
      ),
    ).toBeNull();
    expect(plainBatchReason('running', 'nothing_planned')).toBeNull();
    expect(plainBatchReason('ready', null)).toBeNull();
  });
});

describe('headlessBatchRefreshDelayMs', () => {
  it('stays at 10-15 s while pieces run or queue', () => {
    expect([0, 1, 2, 9].map((n) => headlessBatchRefreshDelayMs(n, true))).toEqual([
      10_000, 15_000, 15_000, 15_000,
    ]);
  });

  it('grows 1.5x per unchanged refresh up to 60 s once nothing is moving', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => headlessBatchRefreshDelayMs(n, false))).toEqual([
      10_000, 15_000, 22_500, 33_750, 50_625, 60_000, 60_000,
    ]);
  });
});

describe('headless batch requests', () => {
  beforeEach(() => requestMock.mockClear());

  it('reads the status by brand and batch, through the lenient reader', async () => {
    await fetchHeadlessBatchStatus({ brandId: BRAND, batchId: BATCH });
    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      path: `${HEADLESS_BATCH_STATUS_ROUTE}?brandId=${BRAND}&batchId=${BATCH}`,
      schema: headlessBatchStatusReader,
    });
  });

  it('posts the cast approval as the contract body', async () => {
    await approveHeadlessBatchCast({ brandId: BRAND, batchId: BATCH, draftElementIds: [ELEMENT] });
    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      path: HEADLESS_CAST_APPROVE_ROUTE,
      method: 'POST',
      body: { brandId: BRAND, batchId: BATCH, draftElementIds: [ELEMENT] },
    });
  });

  it('keys the query per brand and batch', () => {
    expect(headlessBatchQueryKey(BRAND, BATCH)).toEqual([
      'organic',
      'headless-batch',
      BRAND,
      BATCH,
    ]);
  });
});

describe('headlessBatchStatusReader', () => {
  // What a Backend ahead of this build might send: a new field at every level and a new state.
  const ahead = {
    batchId: BATCH,
    brandId: BRAND,
    createdAt: '2026-10-18T10:00:00.000Z',
    capUsd: 9,
    expectedUsd: 3.5,
    maxUsd: 15,
    holdUsd: 9,
    priority: 'high',
    items: [
      {
        index: 0,
        format: 'story',
        draftId: '33333333-3333-4333-8333-333333333333',
        jobId: null,
        state: 'upscaling',
        reason: null,
        holdUsd: 9,
        redirected: false,
        cover: {
          ref: { type: 'headless', assetId: ELEMENT, crop: 'center' },
          kind: 'video',
          w: 1080,
          h: 1920,
        },
        outputCount: 1,
        etaSec: 40,
      },
    ],
    counts: { queued: 0, running: 0, needs_cast_approval: 0, ready: 0, failed: 0, upscaling: 1 },
    cast: {
      needed: false,
      approved: true,
      drafts: [{ elementId: ELEMENT, revision: 1, kind: 'character', summary: 'x', seed: 7 }],
      packUsd: 0,
    },
    done: false,
  };

  it('reads past unknown keys at every level and keeps an unknown format and state as they came', () => {
    const read = headlessBatchStatusReader.parse(ahead);
    expect(read.items[0]?.format).toBe('story');
    expect(read.items[0]?.state).toBe('upscaling');
    // A cover it cannot read is a placeholder, not a lost batch.
    expect(read.items[0]?.cover).toBeNull();
    expect(read.cast.drafts).toEqual([
      { elementId: ELEMENT, revision: 1, kind: 'character', summary: 'x' },
    ]);
    expect(Object.keys(read.counts).sort()).toEqual([
      'failed',
      'needs_cast_approval',
      'queued',
      'ready',
      'running',
    ]);
  });

  it('still refuses a status without what the card needs', () => {
    expect(headlessBatchStatusReader.safeParse({ ...ahead, batchId: undefined }).success).toBe(
      false,
    );
    expect(headlessBatchStatusReader.safeParse({ ...ahead, items: [] }).success).toBe(false);
  });
});
