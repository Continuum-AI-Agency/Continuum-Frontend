import { describe, expect, mock, test } from 'bun:test';

import type { RegisterCanvasAssetRequest } from '@continuum/contracts';
import { registerCanvasOutput } from './registerCanvasAsset';

const videoRequest: RegisterCanvasAssetRequest = {
  brandProfileId: '11111111-1111-4111-8111-111111111111',
  kind: 'video',
  bucket: 'brand-profile-assets',
  storagePath: '11111111-1111-4111-8111-111111111111/video/out.mp4',
  fileName: 'out.mp4',
  mimeType: 'video/mp4',
  originRef: {
    kind: 'canvas',
    roomId: 'room-1',
    nodeId: 'node-1',
    prompt: 'Animate the product',
    model: 'veo',
    generator: 'videoGen',
  },
};

describe('registerCanvasOutput video posters', () => {
  test('backfills a poster after registration when the browser has the generated video URL', async () => {
    const videoBytes = new Blob(['video-bytes'], { type: 'video/mp4' });
    const fetchImpl = mock(async (input: string | URL | Request) => {
      if (String(input) === '/api/library/register-canvas') {
        return Response.json({ assetId: 'asset-1', assetVersionId: 'version-1' });
      }
      return new Response(videoBytes, { status: 200 });
    });
    const attachPoster = mock(async () => 'brand/asset-1/thumb.webp');

    await expect(
      registerCanvasOutput(videoRequest, {
        videoSource: 'https://storage.example/out.mp4',
        fetchImpl: fetchImpl as typeof fetch,
        attachPoster,
      }),
    ).resolves.toEqual({ assetId: 'asset-1', assetVersionId: 'version-1' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(attachPoster).toHaveBeenCalledTimes(1);
    expect(attachPoster.mock.calls[0]?.[0]).toMatchObject({
      brandId: videoRequest.brandProfileId,
      assetId: 'asset-1',
      mimeType: 'video/mp4',
    });
  });

  test('keeps the registered asset when poster download fails', async () => {
    const fetchImpl = mock(async (input: string | URL | Request) =>
      String(input) === '/api/library/register-canvas'
        ? Response.json({ assetId: 'asset-1', assetVersionId: 'version-1' })
        : new Response('expired signed URL', { status: 403 }),
    );
    const attachPoster = mock(async () => 'must-not-run');

    await expect(
      registerCanvasOutput(videoRequest, {
        videoSource: 'https://storage.example/expired.mp4',
        fetchImpl: fetchImpl as typeof fetch,
        attachPoster,
      }),
    ).resolves.toEqual({ assetId: 'asset-1', assetVersionId: 'version-1' });
    expect(attachPoster).not.toHaveBeenCalled();
  });
});
