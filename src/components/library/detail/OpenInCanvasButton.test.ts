import { describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { templateSupportsAsset } from '@/lib/library/canvasTemplates';
import { canvasPlacement } from './OpenInCanvasButton';

const VERSION = '22222222-2222-4222-8222-222222222222';

const asset = (overrides: Partial<MediaAsset>): MediaAsset =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    brandId: '00000000-0000-4000-8000-0000000000b1',
    kind: 'file',
    bucket: 'media-library',
    storagePath: 'brand/file',
    fileName: 'file',
    mimeType: 'application/octet-stream',
    source: 'upload',
    status: 'ready',
    reviewStatus: 'none',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-09-27T00:00:00Z',
    updatedAt: '2026-09-27T00:00:00Z',
    ...overrides,
  }) as MediaAsset;

const readyPreview = (kind: 'image' | 'video') => ({
  assetVersionId: VERSION,
  state: 'ready' as const,
  kind,
  signedUrl: 'https://previews.example/p',
});

describe('canvasPlacement', () => {
  it('places image, video and audio as themselves', () => {
    expect(canvasPlacement(asset({ kind: 'image', mimeType: 'image/png' }))).toBe('image');
    expect(canvasPlacement(asset({ kind: 'video', mimeType: 'video/mp4' }))).toBe('video');
    expect(canvasPlacement(asset({ kind: 'audio', mimeType: 'audio/aiff' }))).toBe('audio');
  });

  it('places a PDF as a document without waiting on any preview', () => {
    expect(canvasPlacement(asset({ fileName: 'brief.pdf', mimeType: 'application/pdf' }))).toBe(
      'document',
    );
  });

  it('places a PSD only once its preview is ready, and as an image', () => {
    const psd = { fileName: 'hero.psd', mimeType: 'image/vnd.adobe.photoshop' };
    expect(canvasPlacement(asset(psd))).toBeNull();
    expect(
      canvasPlacement(
        asset({ ...psd, preview: { ...readyPreview('image'), state: 'processing' } }),
      ),
    ).toBeNull();
    expect(canvasPlacement(asset({ ...psd, preview: readyPreview('image') }))).toBe('image');
  });

  it('keeps the generation templates to images: audio and documents get the blank canvas only', () => {
    for (const placement of ['audio', 'document', 'video'] as const) {
      expect(templateSupportsAsset('brand-align', placement)).toBe(false);
      expect(templateSupportsAsset('blank', placement)).toBe(true);
    }
  });
});
