import { describe, expect, it } from 'bun:test';
import type { MediaAsset, MediaAssetVersion } from '@continuum/contracts';
import { resolveStageMedia, stageKindForMimeType } from './stageMedia';

const HEAD_ASSET: MediaAsset = {
  id: 'asset-1',
  brandId: 'brand-1',
  kind: 'video',
  source: 'upload',
  status: 'ready',
  bucket: 'media',
  storagePath: 'brand-1/asset-1/v2/hero.mp4',
  fileName: 'hero-v2.mp4',
  mimeType: 'video/mp4',
  title: 'Hero cut',
  sizeBytes: 2048,
  width: 1080,
  height: 1920,
  durationMs: 30000,
  signedUrl: 'https://storage.test/head.mp4',
  reviewStatus: 'none',
  tags: [],
  detectedObjects: [],
  hasImageEmbedding: false,
  createdAt: '2026-07-04T00:00:00.000Z',
  updatedAt: '2026-07-04T00:00:00.000Z',
};

function version(overrides: Partial<MediaAssetVersion> & { id: string }): MediaAssetVersion {
  return {
    brandId: 'brand-1',
    assetId: 'asset-1',
    versionNumber: 1,
    bucket: 'media',
    storagePath: 'brand-1/asset-1/v1/hero.mp4',
    fileName: 'hero-v1.mp4',
    mimeType: 'video/mp4',
    durationMs: 18000,
    signedUrl: 'https://storage.test/v1.mp4',
    isHead: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('stageKindForMimeType', () => {
  it('reads the kind off the mime type of the bytes actually being shown', () => {
    expect(stageKindForMimeType('image/png')).toBe('image');
    expect(stageKindForMimeType('video/quicktime')).toBe('video');
    expect(stageKindForMimeType('application/pdf')).toBe('file');
  });
});

describe('resolveStageMedia', () => {
  it('shows an exact-version companion preview for a source file', () => {
    const source = {
      ...HEAD_ASSET,
      kind: 'file' as const,
      mimeType: 'application/vnd.adobe.aftereffects.project',
      preview: {
        assetVersionId: '11111111-1111-4111-8111-111111111111',
        renditionId: '22222222-2222-4222-8222-222222222222',
        state: 'ready' as const,
        kind: 'video' as const,
        signedUrl: 'https://storage.test/aep-preview.mp4',
      },
    };
    const stage = resolveStageMedia({ asset: source, viewedVersion: null });
    expect(stage).toMatchObject({ kind: 'video', src: 'https://storage.test/aep-preview.mp4' });
  });

  it('shows the head asset when no older version is picked', () => {
    const stage = resolveStageMedia({ asset: HEAD_ASSET, viewedVersion: null });

    expect(stage.src).toBe('https://storage.test/head.mp4');
    expect(stage.kind).toBe('video');
    expect(stage.durationMs).toBe(30000);
    expect(stage.label).toBe('Hero cut');
  });

  it('swaps the stage to the picked version’s own signed URL, duration and name', () => {
    const stage = resolveStageMedia({
      asset: HEAD_ASSET,
      viewedVersion: version({ id: 'version-1' }),
    });

    expect(stage.src).toBe('https://storage.test/v1.mp4');
    // The scrubber must measure the cut on screen, not the head's 30s.
    expect(stage.durationMs).toBe(18000);
    expect(stage.label).toBe('hero-v1.mp4');
  });

  it('keys the stage on the bytes so a playhead never carries from one cut to another', () => {
    const head = resolveStageMedia({ asset: HEAD_ASSET, viewedVersion: null });
    const older = resolveStageMedia({
      asset: HEAD_ASSET,
      viewedVersion: version({ id: 'version-1' }),
    });

    expect(older.key).toBe('version-1');
    expect(older.key).not.toBe(head.key);
  });

  it('derives the stage kind from the version, not the head', () => {
    // A v1 still image under a v2 video would otherwise render as a broken <video>.
    const stage = resolveStageMedia({
      asset: HEAD_ASSET,
      viewedVersion: version({
        id: 'version-1',
        mimeType: 'image/png',
        fileName: 'hero-v1.png',
        durationMs: null,
        signedUrl: 'https://storage.test/v1.png',
      }),
    });

    expect(stage.kind).toBe('image');
    expect(stage.durationMs).toBeNull();
  });

  it('reports a missing signed URL as null rather than an empty src', () => {
    const stage = resolveStageMedia({
      asset: HEAD_ASSET,
      viewedVersion: version({ id: 'version-1', signedUrl: null }),
    });

    expect(stage.src).toBeNull();
  });
});

describe('resolveStageMedia — the head follows its version row, not the stale asset snapshot', () => {
  it('paints the HEAD VERSION bytes, not the asset snapshot the grid handed over', () => {
    // The grid holds the asset as it was when the card was clicked. After a v2
    // upload that snapshot still names v1's file — the stage must not believe it.
    const stage = resolveStageMedia({
      asset: { ...HEAD_ASSET, signedUrl: 'https://storage.test/STALE-v1.mp4' },
      viewedVersion: null,
      headVersion: version({
        id: 'v2',
        versionNumber: 2,
        isHead: true,
        signedUrl: 'https://storage.test/FRESH-v2.mp4',
        durationMs: 24000,
      }),
    });
    expect(stage.src).toBe('https://storage.test/FRESH-v2.mp4');
    expect(stage.durationMs).toBe(24000);
    expect(stage.key).toBe('head-v2');
  });

  it('a new head remounts the stage, so a playhead cannot survive the bytes changing', () => {
    const onV1 = resolveStageMedia({
      asset: HEAD_ASSET,
      viewedVersion: null,
      headVersion: version({ id: 'v1', isHead: true }),
    });
    const onV2 = resolveStageMedia({
      asset: HEAD_ASSET,
      viewedVersion: null,
      headVersion: version({ id: 'v2', versionNumber: 2, isHead: true }),
    });
    expect(onV1.key).not.toBe(onV2.key);
  });

  it('falls back to the asset when no version row exists (never re-uploaded)', () => {
    const stage = resolveStageMedia({
      asset: { ...HEAD_ASSET, signedUrl: 'https://storage.test/original.mp4' },
      viewedVersion: null,
      headVersion: null,
    });
    expect(stage.src).toBe('https://storage.test/original.mp4');
    expect(stage.key).toBe('head-asset-1');
  });
});
