import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChatMedia } from '@/components/chat/media/media';
import { resetSignedUrlCache } from '@/lib/organic/hyperframeSign';
import { useAssetMediaRecovery } from './useAssetMediaRecovery';

const originalFetch = globalThis.fetch;
const fetchMock = mock((_url: string, init?: RequestInit) => {
  const { assetId } = JSON.parse(String(init?.body)) as { assetId: string };
  return Promise.resolve(
    new Response(JSON.stringify({ signedUrl: `https://fresh/${assetId}`, expiresAt: null })),
  );
});

const upload: ChatMedia = {
  id: 'm1:attachment:0',
  url: 'https://expired/a',
  kind: 'image',
  assetId: 'asset-1',
};

describe('useAssetMediaRecovery', () => {
  beforeEach(() => {
    resetSignedUrlCache();
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('re-signs a failed tile by asset id and hands back media carrying the fresh URL', async () => {
    const { result } = renderHook(() => useAssetMediaRecovery('brand-1'));
    expect(result.current.resolve(upload).url).toBe('https://expired/a');

    act(() => result.current.recover(upload));
    await waitFor(() => expect(result.current.resolve(upload).url).toBe('https://fresh/asset-1'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/library/sign');
  });

  it('does nothing for a tile with no asset id or no brand', () => {
    const { result } = renderHook(() => useAssetMediaRecovery(null));
    act(() => result.current.recover(upload));
    const anonymous = renderHook(() => useAssetMediaRecovery('brand-1'));
    act(() => anonymous.result.current.recover({ ...upload, assetId: undefined }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
