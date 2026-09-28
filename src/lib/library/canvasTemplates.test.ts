import { describe, expect, it } from 'bun:test';
import {
  buildLibraryCanvasTemplate,
  type CanvasTemplateGraph,
  type LibrarySeedAsset,
  mergeSeedIntoGraph,
  referenceNodeId,
  templateSupportsAsset,
} from './canvasTemplates';
import { RESIZE_PRESETS } from './quickLook';

const asset: LibrarySeedAsset = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'image',
  bucket: 'media-library',
  storagePath: 'brand/abc/hero-olive-oil-pour.png',
  fileName: 'hero-olive-oil-pour.png',
};

const SEED = 'seed1234';

const genNodes = (graph: CanvasTemplateGraph) => graph.nodes.filter((n) => n.type === 'nanoGen');
const refNode = (graph: CanvasTemplateGraph) =>
  graph.nodes.find((n) => n.id === referenceNodeId(SEED));

describe('buildLibraryCanvasTemplate — reference node', () => {
  it('carries the asset bucket, storage path and asset id, and no expiring signed URL', () => {
    const graph = buildLibraryCanvasTemplate({ template: 'brand-align', asset, seedId: SEED });
    const reference = refNode(graph);

    expect(reference?.type).toBe('image');
    expect(reference?.data.bucket).toBe('media-library');
    expect(reference?.data.sourcePath).toBe('brand/abc/hero-olive-oil-pour.png');
    expect(reference?.data.libraryAssetId).toBe(asset.id);
    // Same pointer under the name every canvas reader uses. Seeding only
    // `libraryAssetId` made Remove Background ask for a Library save on an asset that
    // had just come out of the Library, and greyed out Reformat with it.
    expect(reference?.data.assetId).toBe(asset.id);
    expect(reference?.data.fileName).toBe('hero-olive-oil-pour.png');
    // A stored signed URL would be dead by the time the canvas re-opened; the canvas
    // re-signs from bucket + sourcePath instead.
    expect(reference?.data.image).toBeUndefined();
    expect(reference?.data.sourceUrl).toBeUndefined();
  });

  it('pins the head version when the Library row has one', () => {
    const graph = buildLibraryCanvasTemplate({
      template: 'blank',
      asset: { ...asset, headVersionId: 'version-9' },
      seedId: SEED,
    });
    expect(refNode(graph)?.data.assetVersionId).toBe('version-9');
    // A row with no head version pins nothing rather than pinning a null.
    const unpinned = buildLibraryCanvasTemplate({ template: 'blank', asset, seedId: SEED });
    expect(refNode(unpinned)?.data.assetVersionId).toBeUndefined();
  });

  it('uses a video reference node for a video asset on a blank canvas', () => {
    const graph = buildLibraryCanvasTemplate({
      template: 'blank',
      asset: { ...asset, kind: 'video', fileName: 'clip.mp4' },
      seedId: SEED,
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].type).toBe('video');
    expect(graph.edges).toHaveLength(0);
  });
});

describe('buildLibraryCanvasTemplate — brand align', () => {
  it('wires one brand-enforced gen node to the reference through the ref-image handle', () => {
    const graph = buildLibraryCanvasTemplate({ template: 'brand-align', asset, seedId: SEED });
    const gens = genNodes(graph);

    expect(gens).toHaveLength(1);
    expect(gens[0].data.brandBookPieces).toEqual(['full']);
    expect(gens[0].data.sourceAssetId).toBe(asset.id);
    expect(gens[0].data.model).toBe('nano-banana-2');
    expect(typeof gens[0].data.positivePrompt).toBe('string');
    expect((gens[0].data.positivePrompt as string).length).toBeGreaterThan(0);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      source: referenceNodeId(SEED),
      sourceHandle: 'image',
      target: gens[0].id,
      targetHandle: 'ref-image',
      type: 'dataType',
      data: { dataType: 'image', pathType: 'bezier' },
    });
  });

  it('honours an explicit brand-book piece selection', () => {
    const graph = buildLibraryCanvasTemplate({
      template: 'brand-align',
      asset,
      seedId: SEED,
      brandPieces: ['colors', 'logo'],
    });
    expect(genNodes(graph)[0].data.brandBookPieces).toEqual(['colors', 'logo']);
  });
});

describe('buildLibraryCanvasTemplate — resize pack', () => {
  it('creates one gen node per preset, each wired to the single reference node', () => {
    const graph = buildLibraryCanvasTemplate({ template: 'resize-pack', asset, seedId: SEED });
    const gens = genNodes(graph);

    expect(gens).toHaveLength(RESIZE_PRESETS.length);
    expect(gens.map((node) => node.data.aspectRatio)).toEqual(
      RESIZE_PRESETS.map((preset) => preset.apiAspectRatio),
    );
    expect(graph.edges).toHaveLength(RESIZE_PRESETS.length);
    expect(graph.edges.every((edge) => edge.source === referenceNodeId(SEED))).toBe(true);
    expect(graph.edges.every((edge) => edge.targetHandle === 'ref-image')).toBe(true);
    expect(gens.every((node) => node.data.brandBookPieces !== undefined)).toBe(true);
    expect(gens.every((node) => node.data.sourceAssetId === asset.id)).toBe(true);
  });

  it('accepts a narrowed preset list', () => {
    const presets = RESIZE_PRESETS.filter((preset) => preset.apiAspectRatio === '9:16');
    const graph = buildLibraryCanvasTemplate({
      template: 'resize-pack',
      asset,
      seedId: SEED,
      presets,
    });
    expect(genNodes(graph)).toHaveLength(1);
    expect(genNodes(graph)[0].data.aspectRatio).toBe('9:16');
  });

  it('sizes each gen node to its own aspect ratio', () => {
    const graph = buildLibraryCanvasTemplate({ template: 'resize-pack', asset, seedId: SEED });
    for (const node of genNodes(graph)) {
      const [w, h] = (node.data.aspectRatio as string).split(':').map(Number);
      const expected = w / h;
      const actual = node.style.width / node.style.height;
      expect(Math.abs(actual - expected)).toBeLessThan(0.05);
    }
  });

  it('gives every node and edge a unique id', () => {
    const graph = buildLibraryCanvasTemplate({ template: 'resize-pack', asset, seedId: SEED });
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
    expect(new Set(graph.edges.map((e) => e.id)).size).toBe(graph.edges.length);
  });
});

describe('buildLibraryCanvasTemplate — every placeable Library family', () => {
  const VERSION = '22222222-2222-4222-8222-222222222222';

  it('places a PSD as an image node showing its preview, pinned to the SOURCE asset + version', () => {
    const graph = buildLibraryCanvasTemplate({
      template: 'brand-align',
      asset: {
        ...asset,
        bucket: 'media-previews',
        storagePath: 'brand/previews/hero.png',
        fileName: 'hero.psd',
        headVersionId: VERSION,
        renditionRole: 'preview_image',
      },
      seedId: SEED,
    });
    expect(refNode(graph)).toMatchObject({
      type: 'image',
      data: {
        bucket: 'media-previews',
        sourcePath: 'brand/previews/hero.png',
        assetId: asset.id,
        assetVersionId: VERSION,
        libraryAssetId: asset.id,
        renditionRole: 'preview_image',
      },
    });
  });

  it('places audio as an audio node', () => {
    const graph = buildLibraryCanvasTemplate({
      template: 'blank',
      asset: { ...asset, kind: 'audio', fileName: 'mix.aiff', renditionRole: 'audio_proxy' },
      seedId: SEED,
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      type: 'audio',
      data: { assetId: asset.id, libraryAssetId: asset.id, renditionRole: 'audio_proxy' },
    });
    expect(graph.nodes[0].data).not.toHaveProperty('referenceType');
  });

  it('places a PDF as a document node whose entry carries the Library coordinates', () => {
    const graph = buildLibraryCanvasTemplate({
      template: 'blank',
      asset: {
        ...asset,
        kind: 'document',
        storagePath: 'brand/brief',
        fileName: 'brief',
        mimeType: 'application/pdf',
        headVersionId: VERSION,
      },
      seedId: SEED,
    });
    expect(graph.nodes[0].type).toBe('document');
    expect(graph.nodes[0].data).toEqual({
      libraryAssetId: asset.id,
      documents: [
        {
          name: 'brief',
          type: 'pdf',
          bucket: 'media-library',
          storagePath: 'brand/brief',
          assetId: asset.id,
          assetVersionId: VERSION,
        },
      ],
    });
  });
});

describe('templateSupportsAsset', () => {
  it('keeps generation templates image-only', () => {
    for (const kind of ['audio', 'document'] as const) {
      expect(templateSupportsAsset('brand-align', kind)).toBe(false);
      expect(templateSupportsAsset('resize-pack', kind)).toBe(false);
      expect(templateSupportsAsset('blank', kind)).toBe(true);
    }
  });

  it('rejects generation templates for video and throws when forced', () => {
    expect(templateSupportsAsset('brand-align', 'video')).toBe(false);
    expect(templateSupportsAsset('resize-pack', 'video')).toBe(false);
    expect(templateSupportsAsset('blank', 'video')).toBe(true);
    expect(() =>
      buildLibraryCanvasTemplate({
        template: 'brand-align',
        asset: { ...asset, kind: 'video' },
        seedId: SEED,
      }),
    ).toThrow(/needs an image asset/);
  });
});

describe('mergeSeedIntoGraph', () => {
  const existing = {
    nodes: [{ id: 'user-node-1' }, { id: 'user-node-2' }],
    edges: [{ id: 'user-edge-1' }],
  };

  it('appends the seed without dropping any existing node or edge', () => {
    const seed = buildLibraryCanvasTemplate({ template: 'brand-align', asset, seedId: SEED });
    const merged = mergeSeedIntoGraph(existing, seed);

    expect(merged.nodes.slice(0, 2)).toEqual(existing.nodes);
    expect(merged.edges.slice(0, 1)).toEqual(existing.edges);
    expect(merged.nodes).toHaveLength(existing.nodes.length + seed.nodes.length);
    expect(merged.edges).toHaveLength(existing.edges.length + seed.edges.length);
  });

  it('is idempotent when the seed ids already landed (a replayed retry)', () => {
    const seed = buildLibraryCanvasTemplate({ template: 'resize-pack', asset, seedId: SEED });
    const once = mergeSeedIntoGraph(existing, seed);
    const twice = mergeSeedIntoGraph(once, seed);
    expect(twice.nodes).toHaveLength(once.nodes.length);
    expect(twice.edges).toHaveLength(once.edges.length);
  });

  it('does not mutate the graph it was given', () => {
    const seed = buildLibraryCanvasTemplate({ template: 'brand-align', asset, seedId: SEED });
    mergeSeedIntoGraph(existing, seed);
    expect(existing.nodes).toHaveLength(2);
    expect(existing.edges).toHaveLength(1);
  });
});
