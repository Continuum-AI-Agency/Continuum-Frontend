import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset, MediaAssetVersion } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

// The real path the bench drives: asset modal → version rail → View v1 → pill.
const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const V2 = '44444444-4444-4444-8444-444444444444';

const version = (id: string, n: number, isHead: boolean): MediaAssetVersion =>
  ({
    id,
    brandId: BRAND,
    assetId: ASSET,
    versionNumber: n,
    bucket: 'media-library',
    storagePath: `${BRAND}/${ASSET}/v${n}.png`,
    fileName: `v${n}.png`,
    mimeType: 'image/png',
    isHead,
    createdAt: '2026-09-27T00:00:00Z',
  }) as MediaAssetVersion;
const VERSIONS = [version(V2, 2, true), version(V1, 1, false)];

mock.module('./useAssetVersions', () => ({
  useAssetVersions: () => ({
    versions: VERSIONS,
    error: null,
    headVersionId: V2,
    refresh: async () => {},
    replaceVersions: () => {},
  }),
}));

import { ToastProvider } from '@/components/ui/ToastProvider';
import { AssetDetailModal } from './AssetDetailModal';

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

describe('pill on an older version, through the asset modal', () => {
  it('reads v1’s own decided state after View v1', async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.startsWith('/api/library/review?')) {
        return Response.json({
          events: [],
          versions: [
            {
              versionId: V2,
              versionNumber: 2,
              isHead: true,
              reviewStatus: 'draft',
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
      }
      if (url.startsWith('/api/library/review/labels')) {
        return Response.json({ labels: [], customStates: [] });
      }
      return Response.json({ comments: [], versions: [], segments: [] });
    }) as typeof fetch;
    const asset = {
      id: ASSET,
      brandId: BRAND,
      kind: 'image',
      bucket: 'media-library',
      storagePath: `${BRAND}/${ASSET}/v2.png`,
      fileName: 'v2.png',
      mimeType: 'image/png',
      source: 'upload',
      status: 'ready',
      reviewStatus: 'draft',
      headVersionId: V2,
      tags: [],
      detectedObjects: [],
      hasImageEmbedding: false,
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
      signedUrl: 'https://cdn.test/v2.png',
    } as unknown as MediaAsset;
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <AssetDetailModal brandId={BRAND} asset={asset} onClose={() => {}} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const pill = () => document.querySelector('[data-review-status]') as HTMLElement | null;
    await waitFor(() => expect(pill()).not.toBeNull());
    const viewV1 = document.querySelector(
      `[data-version-id="${V1}"] button[aria-label="View v1"]`,
    ) as HTMLElement;
    expect(viewV1).not.toBeNull();
    fireEvent.click(viewV1);
    await waitFor(() => expect(pill()?.getAttribute('data-review-version')).toBe(V1));
    await waitFor(() => expect(pill()?.getAttribute('data-review-status')).toBe('approved'));
    expect(requests.some((url) => url.startsWith('/api/library/review?'))).toBe(true);
    expect(container).toBeDefined();
  });
});
