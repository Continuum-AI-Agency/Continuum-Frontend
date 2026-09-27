import { afterEach, describe, expect, it } from 'bun:test';
import type { ListReviewEventsResponse, MediaAsset } from '@continuum/contracts';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { ReviewStatusControl } from './ReviewStatusControl';

// Reads that land out of order: the read started when v1 came on stage is still in
// flight when the asset refreshes (as it does after every change) and a second read
// answers first with v1's decision. When the first, older read finally lands, the
// pill must keep the decision rather than put the stale state back.
const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const V2 = '44444444-4444-4444-8444-444444444444';

const history = (v1Status: 'approved' | null): ListReviewEventsResponse => ({
  events: [],
  versions: [
    { versionId: V2, versionNumber: 2, isHead: true, reviewStatus: 'draft', reviewStateId: null },
    { versionId: V1, versionNumber: 1, isHead: false, reviewStatus: v1Status, reviewStateId: null },
  ],
});

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

describe('ReviewStatusControl on an older version, reads out of order', () => {
  it('keeps the newer answer when an older read lands last', async () => {
    let releaseFirst: (response: Response) => void = () => {};
    let reads = 0;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/library/review/labels')) {
        return Promise.resolve(Response.json({ labels: [], customStates: [] }));
      }
      reads += 1;
      if (reads === 1) {
        return new Promise<Response>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return Promise.resolve(Response.json(history('approved')));
    }) as typeof fetch;

    const asset = { id: ASSET, brandId: BRAND, reviewStatus: 'draft' } as unknown as MediaAsset;
    const { container, rerender } = render(
      <ReviewStatusControl brandId={BRAND} asset={asset} version={{ id: V1, versionNumber: 1 }} />,
    );
    const pill = () => container.querySelector('[data-review-status]') as HTMLElement;
    // The modal hands a fresh asset object after a change: a second read starts.
    rerender(
      <ReviewStatusControl
        brandId={BRAND}
        asset={{ ...asset }}
        version={{ id: V1, versionNumber: 1 }}
      />,
    );
    await waitFor(() => expect(pill().getAttribute('data-review-status')).toBe('approved'));

    await act(async () => releaseFirst(Response.json(history(null))));
    expect(pill().getAttribute('data-review-status')).toBe('approved');
    expect(pill().textContent).toContain('v1 · Approved');
  });
});
