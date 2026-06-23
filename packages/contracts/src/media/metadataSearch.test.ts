import { describe, expect, it } from 'bun:test';
import {
  assetMatchesTags,
  type MediaAssetRow,
  type MediaMetadataSearchDeps,
  type MediaMetadataSearchInput,
  type MediaTextMatch,
  mapMediaRowToAsset,
  mediaMetadataSearchResultSchema,
  runMediaMetadataSearch,
} from './metadataSearch';

function makeRow(overrides: Partial<MediaAssetRow> = {}): MediaAssetRow {
  return {
    id: 'asset-1',
    brand_id: 'brand-1',
    created_by: 'user-1',
    kind: 'image',
    bucket: 'media-library',
    storage_path: 'brand-1/asset-1/cat.png',
    file_name: 'cat.png',
    mime_type: 'image/png',
    size_bytes: 1024,
    width: 800,
    height: 600,
    duration_ms: null,
    source: 'upload',
    origin_ref: null,
    status: 'ready',
    title: 'A cat',
    description: 'An orange cat on a sofa',
    tags: ['cat', 'animal'],
    ad_creative_analysis: null,
    detected_objects: [
      { label: 'cat', confidence: 0.9, box: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
    ],
    embedding_model: 'gemini-embedding-001',
    has_image_embedding: true,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const input: MediaMetadataSearchInput = {
  query: 'orange cat',
  limit: 8,
  threshold: 0.2,
};

function makeDeps(overrides: Partial<MediaMetadataSearchDeps> = {}): MediaMetadataSearchDeps {
  return {
    embedQuery: async () => [0.1, 0.2, 0.3],
    matchAssetsByText: async () => [{ id: 'asset-1', similarity: 0.8 }],
    hydrateAssets: async (ids) => ids.map((id) => makeRow({ id })),
    mintSignedUrl: async () => 'https://signed.example/cat.png',
    ...overrides,
  };
}

describe('mapMediaRowToAsset', () => {
  it('maps snake_case row to a schema-valid MediaAsset with signed URL and no bytes', () => {
    const asset = mapMediaRowToAsset(makeRow(), 'https://signed/x');
    expect(asset.id).toBe('asset-1');
    expect(asset.brandId).toBe('brand-1');
    expect(asset.signedUrl).toBe('https://signed/x');
    expect(asset.tags).toEqual(['cat', 'animal']);
    expect(asset.detectedObjects[0]?.label).toBe('cat');
    // No embedding vectors / raw bytes ever leak into the boundary asset.
    expect(asset).not.toHaveProperty('embedding_text');
    expect(asset).not.toHaveProperty('embedding_image');
    expect(asset).not.toHaveProperty('bytes');
  });

  it('defensively coerces malformed ad_creative_analysis to null instead of throwing', () => {
    const asset = mapMediaRowToAsset(makeRow({ ad_creative_analysis: { garbage: true } }), null);
    expect(asset.adCreativeAnalysis).toBeNull();
  });

  it('drops degenerate detected objects (no label)', () => {
    const asset = mapMediaRowToAsset(
      makeRow({ detected_objects: [{ confidence: 0.5 }, 'nope'] }),
      null,
    );
    expect(asset.detectedObjects).toEqual([]);
  });
});

describe('assetMatchesTags', () => {
  it('returns true when no tags requested', () => {
    expect(assetMatchesTags(['a'], undefined)).toBe(true);
  });
  it('matches on ANY requested tag, case-insensitive', () => {
    expect(assetMatchesTags(['Cat', 'dog'], ['CAT'])).toBe(true);
    expect(assetMatchesTags(['cat'], ['bird'])).toBe(false);
  });
});

describe('runMediaMetadataSearch', () => {
  it('returns ranked metadata items with signed URLs (semantic path)', async () => {
    const result = await runMediaMetadataSearch(
      makeDeps({
        matchAssetsByText: async () => [
          { id: 'a', similarity: 0.9 },
          { id: 'b', similarity: 0.7 },
        ],
      }),
      input,
    );
    expect(result.count).toBe(2);
    expect(result.items.map((i) => i.asset.id)).toEqual(['a', 'b']);
    expect(result.items[0]?.similarity).toBe(0.9);
    expect(result.items[0]?.asset.signedUrl).toBe('https://signed.example/cat.png');
    // Output validates against the strict contract schema.
    expect(() => mediaMetadataSearchResultSchema.parse(result)).not.toThrow();
  });

  it('clamps out-of-range similarity into [0,1] so lexical scores validate', async () => {
    const result = await runMediaMetadataSearch(
      makeDeps({ matchAssetsByText: async () => [{ id: 'a', similarity: 3 }] }),
      input,
    );
    expect(result.items[0]?.similarity).toBe(1);
    expect(() => mediaMetadataSearchResultSchema.parse(result)).not.toThrow();
  });

  it('returns empty when nothing matches and no lexical fallback', async () => {
    const result = await runMediaMetadataSearch(
      makeDeps({ matchAssetsByText: async () => [] }),
      input,
    );
    expect(result).toEqual({ query: 'orange cat', count: 0, items: [] });
  });

  it('falls back to lexical search when the semantic path is empty', async () => {
    let lexicalCalled = false;
    const result = await runMediaMetadataSearch(
      makeDeps({
        matchAssetsByText: async () => [],
        lexicalSearch: async () => {
          lexicalCalled = true;
          return [{ id: 'lex-1', similarity: 0.33 }];
        },
      }),
      input,
    );
    expect(lexicalCalled).toBe(true);
    expect(result.count).toBe(1);
    expect(result.items[0]?.asset.id).toBe('lex-1');
  });

  it('uses lexical fallback when no query embedding is available (free tier)', async () => {
    const matchCalls: number[] = [];
    const result = await runMediaMetadataSearch(
      makeDeps({
        embedQuery: async () => null,
        matchAssetsByText: async () => {
          matchCalls.push(1);
          return [];
        },
        lexicalSearch: async () => [{ id: 'lex-1', similarity: 0.5 }],
      }),
      input,
    );
    expect(matchCalls).toEqual([]);
    expect(result.items[0]?.asset.id).toBe('lex-1');
  });

  it('forwards kind/source filters to hydration and applies tag filter in-core', async () => {
    let received: { kind?: string; source?: string } = {};
    const result = await runMediaMetadataSearch(
      makeDeps({
        matchAssetsByText: async () => [
          { id: 'match-tag', similarity: 0.9 },
          { id: 'miss-tag', similarity: 0.8 },
        ],
        hydrateAssets: async (ids, opts) => {
          received = opts;
          return ids.map((id) =>
            makeRow({ id, tags: id === 'match-tag' ? ['food'] : ['unrelated'] }),
          );
        },
      }),
      { ...input, kind: 'video', source: 'inspiration', tags: ['food'] },
    );
    expect(received).toEqual({ kind: 'video', source: 'inspiration' });
    expect(result.items.map((i) => i.asset.id)).toEqual(['match-tag']);
  });
});
