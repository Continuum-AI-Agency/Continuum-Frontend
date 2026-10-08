import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ReviewQueueItem } from '@continuum/contracts';

const requestMock = mock(() => Promise.resolve({}));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import { restoreItem } from '@/hooks/useReviewQueue';
import { decideReviewItem } from './reviewQueue';
import { decideBrandStyle } from './styles';

const BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';

const item = (draftId: string): ReviewQueueItem => ({
  draftId,
  brandId: BRAND,
  platform: 'instagram',
  scheduledAt: null,
  caption: null,
  media: { kind: 'video', url: 'https://example.test/a.mp4', posterUrl: null },
  creative: { concept: 'offer-direct' },
  createdAt: '2026-09-29T00:00:00Z',
});

describe('review queue client', () => {
  beforeEach(() => requestMock.mockReset());

  it('posts the decision to the draft with the brand in the query, never in the strict body', async () => {
    await decideReviewItem(BRAND, 'draft/1', { decision: 'revise', effectId: 'vhs' });
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/api/organic/agent/review-queue/draft%2F1/decision?brandId=${BRAND}`,
        method: 'POST',
        body: { decision: 'revise', effectId: 'vhs' },
      }),
    );
  });

  it('refuses a revision that names neither a change nor an effect before any request', () => {
    expect(() => decideReviewItem(BRAND, 'd', { decision: 'revise' })).toThrow();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('decides a brand style through its own route', async () => {
    await decideBrandStyle(BRAND, 'style-1', 'retire');
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/api/headless/styles/style-1/decision?brandId=${BRAND}`,
        body: { decision: 'retire' },
      }),
    );
  });
});

describe('restoreItem', () => {
  it('puts a refused card back at its index, keeping later swipes applied', () => {
    const [a, b, c] = [item('a'), item('b'), item('c')];
    // a was refused after b had also left the deck.
    expect(restoreItem([c], a, 0).map((i) => i.draftId)).toEqual(['a', 'c']);
    expect(restoreItem([a, c], b, 1).map((i) => i.draftId)).toEqual(['a', 'b', 'c']);
  });

  it('never duplicates a card a refetch already brought back', () => {
    const a = item('a');
    expect(restoreItem([a], a, 0)).toHaveLength(1);
  });

  it('clamps an index past the end', () => {
    expect(restoreItem([], item('a'), 5).map((i) => i.draftId)).toEqual(['a']);
  });
});
