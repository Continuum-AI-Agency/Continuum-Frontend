import { afterEach, describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { cleanup, render, waitFor } from '@testing-library/react';
import { ReviewStatusControl } from './ReviewStatusControl';

afterEach(cleanup);

const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const V2 = '44444444-4444-4444-8444-444444444444';

const asset = {
  id: ASSET,
  brandId: BRAND,
  reviewStatus: 'in_review',
  reviewStateId: null,
} as unknown as MediaAsset;

function stubFetch(requests: string[]) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith('/api/library/review/labels')) {
      return Response.json({ labels: [], customStates: [] });
    }
    return Response.json({
      events: [],
      versions: [
        {
          versionId: V2,
          versionNumber: 2,
          isHead: true,
          reviewStatus: 'in_review',
          reviewStateId: null,
        },
        {
          versionId: V1,
          versionNumber: 1,
          isHead: false,
          reviewStatus: 'approved',
          reviewStateId: null,
        },
      ],
    });
  }) as typeof fetch;
}

describe('ReviewStatusControl on an older version', () => {
  it("reads and shows that version's own decided state, not the head's", async () => {
    const requests: string[] = [];
    stubFetch(requests);
    const { container } = render(
      <ReviewStatusControl brandId={BRAND} asset={asset} version={{ id: V1, versionNumber: 1 }} />,
    );
    const pill = () => container.querySelector('[data-review-status]') as HTMLElement;
    expect(pill().getAttribute('data-review-version')).toBe(V1);
    await waitFor(() => expect(pill().getAttribute('data-review-status')).toBe('approved'));
    expect(pill().textContent).toContain('v1 · Approved');
    expect(requests.some((url) => url.startsWith(`/api/library/review?brandId=${BRAND}`))).toBe(
      true,
    );
  });

  it('keeps showing the version state after the asset refreshes (onChanged)', async () => {
    stubFetch([]);
    const { container, rerender } = render(
      <ReviewStatusControl brandId={BRAND} asset={asset} version={{ id: V1, versionNumber: 1 }} />,
    );
    const pill = () => container.querySelector('[data-review-status]') as HTMLElement;
    await waitFor(() => expect(pill().getAttribute('data-review-status')).toBe('approved'));
    // The modal hands a fresh asset object after every change.
    rerender(
      <ReviewStatusControl
        brandId={BRAND}
        asset={{ ...asset }}
        version={{ id: V1, versionNumber: 1 }}
      />,
    );
    await waitFor(() => expect(pill().getAttribute('data-review-status')).toBe('approved'));
    expect(pill().textContent).toContain('v1 · Approved');
  });

  it('shows the head status when no older version is on stage', () => {
    stubFetch([]);
    const { container } = render(<ReviewStatusControl brandId={BRAND} asset={asset} />);
    const pill = container.querySelector('[data-review-status]') as HTMLElement;
    expect(pill.getAttribute('data-review-version')).toBe('head');
    expect(pill.getAttribute('data-review-status')).toBe('in_review');
  });
});
