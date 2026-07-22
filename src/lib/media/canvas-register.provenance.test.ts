import { describe, expect, it } from 'bun:test';
import type { RegisterCanvasAssetRequest } from '@continuum/contracts';
import {
  buildCanvasAssetRow,
  collectContributingAssetIds,
  mergeOriginRefLineage,
  readSeedSourceAssetId,
} from './canvas-register';

const SEED_ASSET_ID = '11111111-1111-4111-8111-111111111111';
const REFERENCE_ASSET_ID = '33333333-3333-4333-8333-333333333333';
const DRAGGED_ASSET_ID = '44444444-4444-4444-8444-444444444444';

const GEN_NODE_ID = 'library-seed1234-gen-brand';

const request: RegisterCanvasAssetRequest = {
  brandProfileId: '00000000-0000-4000-8000-0000000000b2',
  kind: 'image',
  bucket: 'brand-profile-assets',
  storagePath: 'brand/x/out.png',
  fileName: 'out.png',
  mimeType: 'image/png',
  originRef: {
    kind: 'canvas',
    roomId: '22222222-2222-4222-8222-222222222222',
    nodeId: GEN_NODE_ID,
    prompt: 'align to brand',
    model: 'nano-banana-2',
    generator: 'nanoGen',
  },
};

describe('readSeedSourceAssetId', () => {
  const nodes = [
    { id: 'other-node', data: { sourceAssetId: 'not-this-one' } },
    { id: GEN_NODE_ID, data: { sourceAssetId: SEED_ASSET_ID } },
  ];

  it('reads the seeded source asset id off the generating node', () => {
    expect(readSeedSourceAssetId(nodes, GEN_NODE_ID)).toBe(SEED_ASSET_ID);
  });

  it('returns null for a node that was not seeded from the Library', () => {
    expect(readSeedSourceAssetId([{ id: 'hand-made', data: {} }], 'hand-made')).toBeNull();
    expect(readSeedSourceAssetId(nodes, 'missing-node')).toBeNull();
  });

  it('tolerates a graph that is not an array or carries junk data', () => {
    expect(readSeedSourceAssetId(null, 'n')).toBeNull();
    expect(readSeedSourceAssetId('nodes', 'n')).toBeNull();
    expect(
      readSeedSourceAssetId([null, 7, { id: 'n', data: { sourceAssetId: 12 } }], 'n'),
    ).toBeNull();
  });
});

describe('collectContributingAssetIds', () => {
  // The shape "Open in Canvas" leaves behind, after the user drags a second Library
  // asset in as an extra reference: seed reference -> gen, dragged reference -> gen.
  const nodes = [
    { id: 'library-seed1234-ref', data: { libraryAssetId: REFERENCE_ASSET_ID } },
    { id: 'dropped-ref', data: { assetId: DRAGGED_ASSET_ID } },
    { id: GEN_NODE_ID, data: { sourceAssetId: SEED_ASSET_ID } },
    { id: 'unrelated', data: { assetId: 'not-wired-in' } },
  ];
  const edges = [
    { source: 'library-seed1234-ref', target: GEN_NODE_ID },
    { source: 'dropped-ref', target: GEN_NODE_ID },
    { source: 'unrelated', target: 'somewhere-else' },
  ];

  it('collects every asset feeding the output node, not just the seed', () => {
    const ids = collectContributingAssetIds(nodes, edges, GEN_NODE_ID);
    expect(new Set(ids)).toEqual(new Set([SEED_ASSET_ID, REFERENCE_ASSET_ID, DRAGGED_ASSET_ID]));
  });

  it('ignores assets on nodes that are not wired into the output', () => {
    expect(collectContributingAssetIds(nodes, edges, GEN_NODE_ID)).not.toContain('not-wired-in');
  });

  it('walks the whole upstream chain, not only direct parents', () => {
    const chained = [
      { id: 'ref', data: { assetId: DRAGGED_ASSET_ID } },
      { id: 'edit', data: {} },
      { id: 'out', data: {} },
    ];
    const chainedEdges = [
      { source: 'ref', target: 'edit' },
      { source: 'edit', target: 'out' },
    ];
    expect(collectContributingAssetIds(chained, chainedEdges, 'out')).toEqual([DRAGGED_ASSET_ID]);
  });

  it('dedupes an asset wired into the output twice', () => {
    const duplicated = [
      { id: 'a', data: { assetId: DRAGGED_ASSET_ID } },
      { id: 'b', data: { libraryAssetId: DRAGGED_ASSET_ID } },
      { id: 'out', data: {} },
    ];
    const duplicatedEdges = [
      { source: 'a', target: 'out' },
      { source: 'b', target: 'out' },
    ];
    expect(collectContributingAssetIds(duplicated, duplicatedEdges, 'out')).toEqual([
      DRAGGED_ASSET_ID,
    ]);
  });

  it('survives a cyclic or junk graph', () => {
    const cyclic = [
      { id: 'a', data: { assetId: DRAGGED_ASSET_ID } },
      { id: 'out', data: {} },
    ];
    const cyclicEdges = [
      { source: 'a', target: 'out' },
      { source: 'out', target: 'a' },
    ];
    expect(collectContributingAssetIds(cyclic, cyclicEdges, 'out')).toEqual([DRAGGED_ASSET_ID]);
    expect(collectContributingAssetIds(null, null, 'out')).toEqual([]);
    expect(collectContributingAssetIds([{ id: 'out' }], 'edges', 'out')).toEqual([]);
    expect(collectContributingAssetIds(nodes, edges, 'missing-node')).toEqual([]);
  });
});

describe('buildCanvasAssetRow provenance', () => {
  it('stamps every contributing asset, and keeps the legacy scalar for the seed', () => {
    const row = buildCanvasAssetRow(request, 'user-1', {
      sourceAssetId: SEED_ASSET_ID,
      sourceAssetIds: [SEED_ASSET_ID, REFERENCE_ASSET_ID],
    });

    expect(row.source).toBe('canvas');
    expect(row.origin_ref).toEqual({
      kind: 'canvas',
      roomId: '22222222-2222-4222-8222-222222222222',
      nodeId: GEN_NODE_ID,
      prompt: 'align to brand',
      model: 'nano-banana-2',
      generator: 'nanoGen',
      sourceAssetId: SEED_ASSET_ID,
      sourceAssetIds: [SEED_ASSET_ID, REFERENCE_ASSET_ID],
    });
  });

  it('leaves origin_ref untouched for a canvas output with no Library ancestor', () => {
    expect(buildCanvasAssetRow(request, 'user-1').origin_ref).toEqual({ ...request.originRef });
    expect(buildCanvasAssetRow(request, 'user-1', null).origin_ref).toEqual({
      ...request.originRef,
    });
  });

  it('files a Smart resize output under ai_generated with the asset it reframed', () => {
    const row = buildCanvasAssetRow(
      {
        ...request,
        originRef: {
          kind: 'resize',
          sourceAssetId: SEED_ASSET_ID,
          preset: 'ig-story-reel',
          aspectRatio: '9:16',
          model: 'gemini-3.1-flash-image',
        },
      },
      'user-1',
      { sourceAssetId: SEED_ASSET_ID, sourceAssetIds: [SEED_ASSET_ID] },
    );

    expect(row.source).toBe('ai_generated');
    expect(row.origin_ref).toMatchObject({
      kind: 'resize',
      sourceAssetId: SEED_ASSET_ID,
      sourceAssetIds: [SEED_ASSET_ID],
    });
  });
});

describe('mergeOriginRefLineage', () => {
  it('adds lineage to a row the AI Studio backend already registered', () => {
    const merged = mergeOriginRefLineage(
      { surface: 'creative_studio', medium: 'image' },
      { sourceAssetId: SEED_ASSET_ID, sourceAssetIds: [SEED_ASSET_ID] },
    );
    expect(merged).toEqual({
      surface: 'creative_studio',
      medium: 'image',
      sourceAssetId: SEED_ASSET_ID,
      sourceAssetIds: [SEED_ASSET_ID],
    });
  });

  it('unions with the ids already recorded and never drops one', () => {
    const merged = mergeOriginRefLineage(
      { sourceAssetIds: [REFERENCE_ASSET_ID] },
      { sourceAssetIds: [DRAGGED_ASSET_ID] },
    );
    expect(merged?.sourceAssetIds).toEqual([REFERENCE_ASSET_ID, DRAGGED_ASSET_ID]);
  });

  it('returns null when the row already carries the lineage, so no write is issued', () => {
    expect(
      mergeOriginRefLineage(
        { sourceAssetId: SEED_ASSET_ID, sourceAssetIds: [SEED_ASSET_ID] },
        { sourceAssetId: SEED_ASSET_ID, sourceAssetIds: [SEED_ASSET_ID] },
      ),
    ).toBeNull();
  });

  it('never overwrites a seed the row already names', () => {
    const merged = mergeOriginRefLineage(
      { sourceAssetId: REFERENCE_ASSET_ID },
      { sourceAssetId: SEED_ASSET_ID, sourceAssetIds: [SEED_ASSET_ID] },
    );
    expect(merged?.sourceAssetId).toBe(REFERENCE_ASSET_ID);
    expect(merged?.sourceAssetIds).toEqual([SEED_ASSET_ID]);
  });

  it('tolerates an origin_ref that is null or junk', () => {
    expect(mergeOriginRefLineage(null, { sourceAssetIds: [SEED_ASSET_ID] })).toEqual({
      sourceAssetIds: [SEED_ASSET_ID],
    });
    expect(mergeOriginRefLineage('junk', { sourceAssetIds: [SEED_ASSET_ID] })).toEqual({
      sourceAssetIds: [SEED_ASSET_ID],
    });
  });
});
