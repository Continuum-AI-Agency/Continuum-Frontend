import { describe, expect, it, mock } from 'bun:test';

import { stitchPlannerReel, toReelClip } from './plannerReelStitch';

const clip = {
  index: 0,
  role: 'hook' as const,
  durationSec: 4,
  bucket: 'brand-profile-assets',
  storagePath: 'brand-1/canvas-creations/reel/draft-1/scene-0.mp4',
  signedUrl: 'https://cdn.example/scene-0.mp4',
  assetId: '00000000-0000-4000-8000-000000000010',
  mimeType: 'video/mp4',
  captionText: 'Start here',
};

const composition = {
  id: 'composition-1',
  brandId: 'brand-1',
  draftId: 'draft-1',
  roomId: 'room-1',
  timelineNodeId: 'timeline-1',
  publishNodeId: 'publish-1',
  revision: 1,
  status: 'clips_ready' as const,
  isCurrent: true,
  sourceFingerprint: 'sha256:abc',
  openHref: '/ai-studio?roomId=room-1&focusNodeId=timeline-1',
  returnHref: '/organic?tab=planner&draftId=draft-1',
  createdAt: '2026-07-22T12:00:00.000Z',
  updatedAt: '2026-07-22T12:00:00.000Z',
};

describe('Planner reel stitch', () => {
  it('adapts refreshed durable composition clips to the existing reel stitch contract', () => {
    expect(toReelClip(clip)).toEqual({
      index: 0,
      role: 'hook',
      durationSec: 4,
      bucket: 'brand-profile-assets',
      clipUrl: clip.storagePath,
      signedClipUrl: clip.signedUrl,
      assetId: clip.assetId,
      mimeType: 'video/mp4',
      captionText: 'Start here',
    });
  });

  it('refreshes signed clips before stitching and returns the linked composition', async () => {
    const fetcher = mock(async () =>
      Response.json({ composition, revisions: [composition], clips: [clip], created: false }),
    );
    const stitcher = mock(async () => ({
      bucket: 'brand-profile-assets',
      path: 'brand-1/reels/final.mp4',
      signedUrl: 'https://cdn.example/final.mp4',
      durationSec: 4,
      assetId: '00000000-0000-4000-8000-000000000020',
    }));

    const result = await stitchPlannerReel(
      {
        brandId: 'brand-1',
        draftId: 'draft-1',
        sourceRevision: composition.sourceFingerprint,
        durationSec: 4,
        captions: {
          enabled: true,
          sourceAssetId: clip.assetId,
          referenceAssetIds: ['character-asset'],
        },
      },
      { fetcher: fetcher as typeof fetch, stitcher },
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(stitcher).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        draftId: 'draft-1',
        clips: [expect.objectContaining({ signedClipUrl: clip.signedUrl })],
        captions: {
          enabled: true,
          sourceAssetId: clip.assetId,
          referenceAssetIds: ['character-asset'],
        },
      }),
    );
    expect(result.composition.id).toBe('composition-1');
    expect(result.reel.path).toBe('brand-1/reels/final.mp4');
  });

  it('refuses to stitch a newer clip revision under an older durable job', async () => {
    const fetcher = mock(async () =>
      Response.json({ composition, revisions: [composition], clips: [clip], created: false }),
    );
    const stitcher = mock(async () => ({
      bucket: 'brand-profile-assets',
      path: 'brand-1/reels/final.mp4',
      signedUrl: 'https://cdn.example/final.mp4',
      durationSec: 4,
      assetId: '00000000-0000-4000-8000-000000000020',
    }));

    await expect(
      stitchPlannerReel(
        {
          brandId: 'brand-1',
          draftId: 'draft-1',
          sourceRevision: 'sha256:older',
          durationSec: 4,
        },
        { fetcher: fetcher as typeof fetch, stitcher },
      ),
    ).rejects.toThrow('clips changed');
    expect(stitcher).not.toHaveBeenCalled();
  });
});
