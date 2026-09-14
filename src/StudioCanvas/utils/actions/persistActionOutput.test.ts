import { describe, expect, it, mock } from 'bun:test';

import { persistActionOutput } from './persistActionOutput';

describe('persistActionOutput', () => {
  it('passes through an already-saved Library result without uploading it again', async () => {
    const persist = mock();
    const store = mock();
    const output = {
      type: 'image' as const,
      mimeType: 'image/png',
      url: 'https://cdn.example.com/cutout.png',
      storagePath: 'brand/cutout.png',
      storageBucket: 'media-library',
      assetId: 'asset-1',
      assetVersionId: 'version-1',
    };

    expect(
      await persistActionOutput(
        {
          output,
          actionId: 'image.removeBackground',
          brandId: 'brand-1',
          nodeId: 'action-1',
          sourceAssetIds: [],
        },
        { persist, store },
      ),
    ).toBe(output);
    expect(persist).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('stores a transient result without a Library row unless Keep or Export', async () => {
    const persist = mock();
    const store = mock(async () => ({
      bucket: 'media-library',
      storagePath: 'brand/asset-2/flip.png',
      signedUrl: 'https://cdn.example.com/flip.png',
      sizeBytes: 3,
      mimeType: 'image/png',
    }));
    const fetchImpl = mock(
      async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    ) as typeof fetch;

    const output = await persistActionOutput(
      {
        output: { type: 'image', mimeType: 'image/png', base64: 'LOCAL_BYTES' },
        actionId: 'image.flip',
        brandId: 'brand-1',
        nodeId: 'action-1',
        sourceAssetIds: ['source-1'],
      },
      { persist, store, fetchImpl },
    );

    expect(persist).not.toHaveBeenCalled();
    expect(store).toHaveBeenCalledTimes(1);
    expect(output).toEqual({
      type: 'image',
      mimeType: 'image/png',
      url: 'https://cdn.example.com/flip.png',
      storagePath: 'brand/asset-2/flip.png',
      storageBucket: 'media-library',
      sizeBytes: 3,
    });
  });

  it('registers a transient result when the node is Keep', async () => {
    const persist = mock(async () => ({
      assetId: 'asset-2',
      versionId: 'version-2',
      lineageCount: 1,
      status: 'created' as const,
      bucket: 'media-library',
      storagePath: 'brand/asset-2/flip.png',
    }));
    const fetchImpl = mock(
      async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    ) as typeof fetch;

    const output = await persistActionOutput(
      {
        output: { type: 'image', mimeType: 'image/png', base64: 'LOCAL_BYTES' },
        actionId: 'image.flip',
        brandId: 'brand-1',
        nodeId: 'action-1',
        sourceAssetIds: ['source-1'],
        keep: true,
      },
      {
        persist,
        fetchImpl,
        sign: mock(async () => 'https://cdn.example.com/flip.png'),
      },
    );

    expect(persist).toHaveBeenCalledTimes(1);
    expect(output).toMatchObject({
      assetId: 'asset-2',
      assetVersionId: 'version-2',
    });
  });

  it('registers stored media by pointer when wired to a library sink', async () => {
    const fetchImpl = mock();
    const persist = mock();
    const register = mock(async () => ({ assetId: 'asset-3', assetVersionId: 'version-3' }));

    expect(
      await persistActionOutput(
        {
          output: {
            type: 'video',
            url: '',
            storagePath: 'brand/reversed.mp4',
            storageBucket: 'media-library',
          },
          actionId: 'video.reverse',
          brandId: 'brand-1',
          nodeId: 'action-1',
          sourceAssetIds: ['source-1'],
          wiredToLibrarySink: true,
        },
        {
          fetchImpl,
          persist,
          register,
          sign: mock(async () => 'https://cdn.example.com/reversed.mp4'),
        },
      ),
    ).toMatchObject({
      url: 'https://cdn.example.com/reversed.mp4',
      assetId: 'asset-3',
      assetVersionId: 'version-3',
    });
    expect(register).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
