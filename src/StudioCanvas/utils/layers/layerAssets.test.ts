import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import { layerAssetCoordinates, resolveLayerSources } from './layerAssets';

/**
 * `uploadLayerAsset` and `signLayerAsset` are not exercised here — both are thin wrappers
 * over the Supabase browser client, and a test of them would be a test of a mock. What is
 * worth pinning is the RESOLUTION rule, because it decides which pixels a layer shows when
 * it has two possible sources.
 */

const layer = (id: string, over: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id,
  name: id,
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...over,
});

const signer = (answers: Record<string, string | null>) => {
  const asked: string[] = [];
  const sign = async (coordinates: { bucket: string; storagePath: string }) => {
    const key = `${coordinates.bucket}/${coordinates.storagePath}`;
    asked.push(key);
    return answers[key] ?? null;
  };
  return { sign, asked };
};

describe('layerAssetCoordinates', () => {
  test('is null for a wired layer', () => {
    expect(layerAssetCoordinates(layer('a', { sourceNodeId: 'n1' }))).toBeNull();
  });

  test('needs BOTH halves — a bucket with no path signs nothing', () => {
    expect(layerAssetCoordinates(layer('a', { sourceBucket: 'media-library' }))).toBeNull();
    expect(layerAssetCoordinates(layer('a', { sourceStoragePath: 'brand/x.png' }))).toBeNull();
  });

  test('is the pair when both are present', () => {
    const coordinates = layerAssetCoordinates(
      layer('a', { sourceBucket: 'media-library', sourceStoragePath: 'brand/x.png' }),
    );
    expect(coordinates).toEqual({ bucket: 'media-library', storagePath: 'brand/x.png' });
  });
});

describe('resolveLayerSources', () => {
  test('a wired layer resolves through its node', async () => {
    const { sign, asked } = signer({});
    const urls = await resolveLayerSources({
      layers: [layer('a', { sourceNodeId: 'n1' })],
      refByNodeId: new Map([['n1', 'blob:from-node']]),
      sign,
    });

    expect(urls.get('a')).toBe('blob:from-node');
    // No round trip for a layer that never needed one.
    expect(asked).toEqual([]);
  });

  test('a file-sourced layer resolves by signing its stored coordinates', async () => {
    const { sign } = signer({ 'media-library/brand/hero.png': 'https://signed/hero' });
    const urls = await resolveLayerSources({
      layers: [layer('a', { sourceBucket: 'media-library', sourceStoragePath: 'brand/hero.png' })],
      refByNodeId: new Map(),
      sign,
    });

    expect(urls.get('a')).toBe('https://signed/hero');
  });

  test('the WIRED node wins when a layer has both', async () => {
    const { sign, asked } = signer({ 'media-library/brand/old.png': 'https://signed/old' });
    const urls = await resolveLayerSources({
      layers: [
        layer('a', {
          sourceNodeId: 'n1',
          sourceBucket: 'media-library',
          sourceStoragePath: 'brand/old.png',
        }),
      ],
      refByNodeId: new Map([['n1', 'blob:regenerated']]),
      sign,
    });

    // The node's ref is the live output of a generator; the stored asset is a snapshot.
    // Preferring the snapshot would pin the layer to pixels from before a regenerate.
    expect(urls.get('a')).toBe('blob:regenerated');
    expect(asked).toEqual([]);
  });

  test('a layer whose node is disconnected falls back to nothing, not to a stale asset', async () => {
    const { sign } = signer({});
    const urls = await resolveLayerSources({
      layers: [layer('a', { sourceNodeId: 'gone' })],
      refByNodeId: new Map(),
      sign,
    });

    expect(urls.has('a')).toBe(false);
  });

  test('a signature that fails leaves the layer unresolved rather than broken', async () => {
    const { sign } = signer({ 'media-library/brand/x.png': null });
    const urls = await resolveLayerSources({
      layers: [layer('a', { sourceBucket: 'media-library', sourceStoragePath: 'brand/x.png' })],
      refByNodeId: new Map(),
      sign,
    });

    // The stage skips it and Compose refuses — the same treatment an unresolvable wired
    // layer gets, rather than a broken image or a silent hole in the export.
    expect(urls.has('a')).toBe(false);
  });

  test('signs the whole document in parallel, not one at a time', async () => {
    let live = 0;
    let peak = 0;
    const sign = async (coordinates: { bucket: string; storagePath: string }) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => setTimeout(resolve, 5));
      live -= 1;
      return `https://signed/${coordinates.storagePath}`;
    };

    const urls = await resolveLayerSources({
      layers: ['a', 'b', 'c'].map((id) =>
        layer(id, { sourceBucket: 'media-library', sourceStoragePath: `${id}.png` }),
      ),
      refByNodeId: new Map(),
      sign,
    });

    expect(urls.size).toBe(3);
    expect(peak).toBeGreaterThan(1);
  });
});
