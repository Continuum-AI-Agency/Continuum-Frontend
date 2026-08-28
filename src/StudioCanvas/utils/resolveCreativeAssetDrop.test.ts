import { describe, expect, it, mock } from 'bun:test';
import { resolveCreativeAssetDrop } from './resolveCreativeAssetDrop';

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
