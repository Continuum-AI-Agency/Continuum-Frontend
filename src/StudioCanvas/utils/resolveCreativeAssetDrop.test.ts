import { describe, expect, it, mock } from 'bun:test';
import { type CanvasLibraryContext, canvasLibraryContextSchema } from '@continuum/contracts';
import type { ParsedReferenceDropPayload } from '@/lib/ai-studio/referenceDrop';
import { pickCanvasLibrarySource } from '@/lib/creative-assets/canvasLibrarySource';
import {
  NO_CANVAS_PREVIEW,
  NO_CANVAS_PREVIEW_YET,
  resolveCreativeAssetDrop,
} from './resolveCreativeAssetDrop';

const resolver = mock(async () => ({
  base64: 'resolved_base64',
  sourceName: 'asset.png',
  byteLength: 16,
}));

describe('resolveCreativeAssetDrop', () => {
  it('returns image success for data-url payloads', async () => {
    const payload = 'data:image/png;base64,abc123';
    const result = await resolveCreativeAssetDrop(payload, resolver);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.nodeType).toBe('image');
      expect(result.dataUrl).toBe(payload);
    }
  });

  it('returns video success for data-url payloads', async () => {
    const payload = 'data:video/mp4;base64,xyz987';
    const result = await resolveCreativeAssetDrop(payload, resolver);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.nodeType).toBe('video');
      expect(result.dataUrl).toBe(payload);
    }
  });

  it('resolves remote creative asset payloads', async () => {
    const payload = JSON.stringify({
      name: 'asset.png',
      path: 'brand/asset.png',
      contentType: 'image/png',
    });
    const result = await resolveCreativeAssetDrop(payload, resolver);

    expect(result.status).toBe('success');
    expect(resolver).toHaveBeenCalledTimes(1);
    if (result.status === 'success') {
      expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(result.fileName).toBe('asset.png');
      expect(result.sourcePath).toBe('brand/asset.png');
    }
  });

  it('preserves library bucket metadata and fresh signed url from asset_drop payloads', async () => {
    const payload = JSON.stringify({
      type: 'asset_drop',
      payload: {
        bucket: 'media-library',
        path: 'brand/asset.png',
        publicUrl: 'https://expired.example/asset.png',
        mimeType: 'image/png',
        meta: { assetId: 'asset-1', assetVersionId: 'version-1', brandId: 'brand-1' },
      },
    });
    const resolverWithFreshUrl = mock(async () => ({
      base64: 'resolved_base64',
      sourceName: 'asset.png',
      byteLength: 16,
      sourceUrl: 'https://fresh.example/asset.png',
    }));

    const result = await resolveCreativeAssetDrop(payload, resolverWithFreshUrl);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.sourcePath).toBe('brand/asset.png');
      expect(result.bucket).toBe('media-library');
      expect(result.sourceUrl).toBe('https://fresh.example/asset.png');
      // Carries the Library asset id, so anything generated from this reference can
      // be traced back to the asset that fed it.
      expect(result.assetId).toBe('asset-1');
      expect(result.assetVersionId).toBe('version-1');
    }
  });

  it('carries a recorded video duration from the library row onto the node — D-04', async () => {
    const payload = JSON.stringify({
      type: 'asset_drop',
      payload: {
        bucket: 'media-library',
        path: 'brand/clip.mp4',
        publicUrl: 'https://cdn.example/clip.mp4',
        mimeType: 'video/mp4',
        meta: { assetId: 'asset-2', brandId: 'brand-1', durationMs: 4210 },
      },
    });

    const result = await resolveCreativeAssetDrop(payload, resolver);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.nodeType).toBe('video');
      expect(result.durationMs).toBe(4210);
    }
  });

  it('leaves durationMs unset when the row never recorded one', async () => {
    const payload = JSON.stringify({
      type: 'asset_drop',
      payload: {
        bucket: 'media-library',
        path: 'brand/clip.mp4',
        publicUrl: 'https://cdn.example/clip.mp4',
        mimeType: 'video/mp4',
        meta: { assetId: 'asset-3', brandId: 'brand-1' },
      },
    });

    const result = await resolveCreativeAssetDrop(payload, resolver);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.durationMs).toBeUndefined();
    }
  });

  it('returns document type for PDF', async () => {
    const payload = 'data:application/pdf;base64,abcd';
    const result = await resolveCreativeAssetDrop(payload, resolver);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.nodeType).toBe('document');
    }
  });
});

describe('resolveCreativeAssetDrop — Library files the browser cannot draw', () => {
  const BRAND = '00000000-0000-4000-8000-0000000000b1';
  const ASSET = '11111111-1111-4111-8111-111111111111';
  const PINNED = '22222222-2222-4222-8222-222222222222';
  const HEAD = '33333333-3333-4333-8333-333333333333';

  const libraryPayload = (path: string, mimeType: string, assetVersionId?: string) =>
    JSON.stringify({
      type: 'asset_drop',
      payload: {
        bucket: 'media-library',
        path,
        publicUrl: `https://cdn.example/${path}`,
        mimeType,
        meta: { assetId: ASSET, assetVersionId, brandId: BRAND, size: 400 * 1024 * 1024 },
      },
    });

  const context = (
    fileName: string,
    mimeType: string,
    kind: 'image' | 'video' | 'audio' | 'file',
    renditions: Array<{ role: string; storagePath: string; mimeType: string }>,
  ): CanvasLibraryContext => {
    const version = (id: string, versionNumber: number) => ({
      id,
      assetId: ASSET,
      versionNumber,
      bucket: 'media-library',
      storagePath: `brand/${id}/${fileName}`,
      fileName,
      mimeType,
      durationMs: kind === 'video' ? 9000 : null,
      renditions: renditions.map((r) => ({ ...r, bucket: 'media-previews' })),
    });
    return canvasLibraryContextSchema.parse({
      assets: [
        {
          id: ASSET,
          kind,
          fileName,
          mimeType,
          reviewStatus: 'none',
          headVersionId: HEAD,
          headVersionNumber: 2,
          commentCount: 0,
          openThreadCount: 0,
          updatedAt: '2026-09-27T00:00:00Z',
        },
      ],
      versions: [version(PINNED, 1), version(HEAD, 2)],
    });
  };

  const readerFor = (ctx: CanvasLibraryContext) =>
    mock(async (ref: { assetId: string; assetVersionId?: string }) =>
      pickCanvasLibrarySource(ctx, ref.assetId, ref.assetVersionId),
    );

  const bytes = () =>
    mock(async (parsed: ParsedReferenceDropPayload) => ({
      base64: 'cmVuZGl0aW9u',
      sourceName: 'preview.png',
      byteLength: 1024,
      sourceUrl: `https://signed.example/${parsed.kind === 'remote' ? parsed.path : ''}`,
    }));

  it('a PSD lands as its flattened preview image, keeping the source asset and pinned version', async () => {
    const read = readerFor(
      context('hero.psd', 'image/vnd.adobe.photoshop', 'file', [
        { role: 'preview_image', storagePath: 'brand/previews/hero.png', mimeType: 'image/png' },
      ]),
    );
    const fetchBytes = bytes();

    const result = await resolveCreativeAssetDrop(
      libraryPayload('brand/v1/hero.psd', 'image/vnd.adobe.photoshop', PINNED),
      fetchBytes,
      read,
    );

    expect(result).toMatchObject({
      status: 'success',
      nodeType: 'image',
      mimeType: 'image/png',
      bucket: 'media-previews',
      sourcePath: 'brand/previews/hero.png',
      sourceUrl: 'https://signed.example/brand/previews/hero.png',
      assetId: ASSET,
      assetVersionId: PINNED,
      renditionRole: 'preview_image',
      fileName: 'hero.psd',
    });
    if (result.status === 'success') {
      expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    }
    // The rendition is read at its own coordinates, never through the Library sign
    // route for the ORIGINAL (which would hand back the PSD bytes), and the 400 MB
    // original size is not held against a small preview.
    const [renditionCoords] = fetchBytes.mock.calls[0] as [ParsedReferenceDropPayload];
    expect(renditionCoords).toEqual({
      kind: 'remote',
      bucket: 'media-previews',
      path: 'brand/previews/hero.png',
      mimeType: 'image/png',
    });
  });

  it('an MKV lands as a video node playing its proxy', async () => {
    const read = readerFor(
      context('shoot.mkv', 'video/x-matroska', 'video', [
        { role: 'proxy_540', storagePath: 'brand/previews/shoot-540.mp4', mimeType: 'video/mp4' },
        { role: 'preview_video', storagePath: 'brand/previews/shoot.mp4', mimeType: 'video/mp4' },
      ]),
    );

    const result = await resolveCreativeAssetDrop(
      libraryPayload('brand/v2/shoot.mkv', 'video/x-matroska'),
      bytes(),
      read,
    );

    expect(result).toMatchObject({
      status: 'success',
      nodeType: 'video',
      sourcePath: 'brand/previews/shoot.mp4',
      renditionRole: 'preview_video',
      // No pin on the drag payload: the head is what the node holds.
      assetVersionId: HEAD,
      durationMs: 9000,
    });
  });

  it('an AIFF lands as an audio node on its audio proxy', async () => {
    const read = readerFor(
      context('mix.aiff', 'audio/aiff', 'audio', [
        { role: 'audio_proxy', storagePath: 'brand/previews/mix.m4a', mimeType: 'audio/mp4' },
      ]),
    );

    const result = await resolveCreativeAssetDrop(
      libraryPayload('brand/v2/mix.aiff', 'audio/aiff', HEAD),
      bytes(),
      read,
    );

    expect(result).toMatchObject({
      status: 'success',
      nodeType: 'audio',
      renditionRole: 'audio_proxy',
      assetId: ASSET,
    });
  });

  it('says the preview is still rendering when a previewable file has none yet', async () => {
    const result = await resolveCreativeAssetDrop(
      libraryPayload('brand/v1/hero.psd', 'image/vnd.adobe.photoshop', PINNED),
      bytes(),
      readerFor(context('hero.psd', 'image/vnd.adobe.photoshop', 'file', [])),
    );

    expect(result).toEqual({
      status: 'error',
      title: NO_CANVAS_PREVIEW_YET,
      description: 'hero.psd',
      variant: 'warning',
    });
  });

  it('says a file type with no preview never gets one', async () => {
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const result = await resolveCreativeAssetDrop(
      libraryPayload('brand/v1/brief.docx', mime, PINNED),
      bytes(),
      readerFor(context('brief.docx', mime, 'file', [])),
    );

    expect(result).toMatchObject({ status: 'error', title: NO_CANVAS_PREVIEW });
  });

  it('keeps native Library images on the fast path with no Library read', async () => {
    const read = mock(async () => null);
    const result = await resolveCreativeAssetDrop(
      JSON.stringify({
        type: 'asset_drop',
        payload: {
          bucket: 'media-library',
          path: 'brand/hero.png',
          publicUrl: 'https://cdn.example/hero.png',
          mimeType: 'image/png',
          meta: { assetId: ASSET, assetVersionId: PINNED, brandId: BRAND },
        },
      }),
      resolver,
      read,
    );

    expect(read).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'success', nodeType: 'image', bucket: 'media-library' });
    expect(result.status === 'success' && result.renditionRole).toBeFalsy();
  });

  it('a failed Library read is a drop failure, not a raw-bytes node', async () => {
    const result = await resolveCreativeAssetDrop(
      libraryPayload('brand/v1/hero.psd', 'image/vnd.adobe.photoshop', PINNED),
      bytes(),
      async () => {
        throw new Error('permission denied');
      },
    );

    expect(result).toMatchObject({ status: 'error', title: 'Drop failed' });
  });
});
