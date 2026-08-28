import { describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import {
  buildStudioAssetDropPayload,
  STUDIO_ASSET_DROP_EFFECT,
  STUDIO_ASSET_DROP_MIME,
  setStudioAssetDragData,
} from '../studioAssetDrop';

function makeDataTransfer() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: 'uninitialized',
    setData(type: string, value: string) {
      store[type] = value;
    },
    getData(type: string) {
      return store[type] ?? '';
    },
  };
}

const baseAsset: MediaAsset = {
  id: 'asset-1',
  brandId: 'brand-1',
  createdBy: 'user-1',
  kind: 'image',
  bucket: 'media-library',
  storagePath: 'brand-1/asset-1/photo.jpg',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  width: 800,
  height: 600,
  durationMs: null,
  source: 'ai_generated',
  originRef: { surface: 'creative_studio' },
  status: 'ready',
  headVersionId: 'version-1',
  title: 'A sunset',
  description: 'desc',
  tags: ['sunset'],
  detectedObjects: [],
  adCreativeAnalysis: null,
  embeddingModel: 'gemini-embedding-001',
  hasImageEmbedding: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  signedUrl: 'https://example.com/signed.jpg',
  thumbnailUrl: null,
};

describe('buildStudioAssetDropPayload', () => {
  it('maps bucket, path, mimeType from the asset', () => {
    const p = buildStudioAssetDropPayload(baseAsset).payload;
    expect(p.source).toBe('supabase');
    expect(p.bucket).toBe('media-library');
    expect(p.path).toBe('brand-1/asset-1/photo.jpg');
    expect(p.mimeType).toBe('image/jpeg');
  });

  it('carries a sanitized https signed url as publicUrl', () => {
    const p = buildStudioAssetDropPayload(baseAsset).payload;
    expect(p.publicUrl).toBe('https://example.com/signed.jpg');
  });

  it('nulls out an unsafe/empty signed url', () => {
    const p = buildStudioAssetDropPayload({
      ...baseAsset,
      signedUrl: 'javascript:alert(1)',
    }).payload;
    expect(p.publicUrl).toBeNull();
  });

  it('nulls out a missing signed url', () => {
    const p = buildStudioAssetDropPayload({ ...baseAsset, signedUrl: null }).payload;
    expect(p.publicUrl).toBeNull();
  });

  it('includes asset meta (id, title, kind)', () => {
    const p = buildStudioAssetDropPayload(baseAsset).payload;
    expect(p.meta).toEqual({
      assetId: 'asset-1',
      assetVersionId: 'version-1',
      brandId: 'brand-1',
      title: 'A sunset',
      kind: 'image',
    });
  });

  it('carries a recorded duration in meta, and omits it when the row has none', () => {
    const withDuration = buildStudioAssetDropPayload({
      ...baseAsset,
      kind: 'video',
      durationMs: 4210,
    }).payload;
    expect(withDuration.meta.durationMs).toBe(4210);
    // baseAsset has durationMs: null — the upload path that never probed. The payload
    // must not invent a 0.
    expect('durationMs' in buildStudioAssetDropPayload(baseAsset).payload.meta).toBe(false);
  });

  it('uses the reactflow node-data MIME contract', () => {
    expect(STUDIO_ASSET_DROP_MIME).toBe('application/reactflow-node-data');
    expect(buildStudioAssetDropPayload(baseAsset).type).toBe('asset_drop');
  });
});

describe('setStudioAssetDragData', () => {
  it('advertises the copy effect the canvas dropzone accepts', () => {
    // Regression: the canvas onDragOver used dropEffect "move", which the browser
    // reconciles against this "copy" effectAllowed down to "none" — the drop never
    // fires and the reference node is never created. Both sides share this constant.
    const dt = makeDataTransfer();
    setStudioAssetDragData(dt as unknown as DataTransfer, baseAsset);
    expect(dt.effectAllowed).toBe(STUDIO_ASSET_DROP_EFFECT);
    expect(STUDIO_ASSET_DROP_EFFECT).toBe('copy');
  });

  it('writes the asset_drop payload on the reactflow MIME and url on text/plain', () => {
    const dt = makeDataTransfer();
    setStudioAssetDragData(dt as unknown as DataTransfer, baseAsset);
    expect(JSON.parse(dt.getData(STUDIO_ASSET_DROP_MIME)).type).toBe('asset_drop');
    expect(dt.getData('text/plain')).toBe('https://example.com/signed.jpg');
  });
});
