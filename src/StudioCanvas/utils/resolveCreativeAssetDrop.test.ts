import { describe, it, expect, mock } from 'bun:test';
import { resolveCreativeAssetDrop } from './resolveCreativeAssetDrop';

const resolver = mock(async () => ({ base64: 'resolved_base64', sourceName: 'asset.png', byteLength: 16 }));

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
    const payload = JSON.stringify({ name: 'asset.png', path: 'brand/asset.png', contentType: 'image/png' });
    const result = await resolveCreativeAssetDrop(payload, resolver);

    expect(result.status).toBe('success');
    expect(resolver).toHaveBeenCalledTimes(1);
    if (result.status === 'success') {
      expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(result.fileName).toBe('asset.png');
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
