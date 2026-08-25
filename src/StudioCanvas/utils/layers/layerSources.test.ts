import { describe, expect, test } from 'bun:test';
import type { Edge } from '@xyflow/react';
import { layerSourcesFromGraph } from './layerSources';

const edge = (source: string, targetHandle: string | null = 'image-in'): Edge => ({
  id: `e-${source}`,
  source,
  target: 'layers',
  targetHandle,
});

describe('layerSourcesFromGraph', () => {
  const nodes = [
    { id: 'gen', type: 'nanoGen', data: { generatedImageUrl: 'https://cdn/one.png', label: 'Hero' } },
    { id: 'img', type: 'image', data: { sourceUrl: 'https://cdn/two.png' } },
    { id: 'clip', type: 'videoGen', data: { generatedVideoUrl: 'https://cdn/three.mp4' } },
    { id: 'empty', type: 'nanoGen', data: {} },
  ];

  test('reads the image pool in edge order', () => {
    const sources = layerSourcesFromGraph('layers', [edge('gen'), edge('img')], nodes);
    expect(sources.map((source) => source.nodeId)).toEqual(['gen', 'img']);
    expect(sources[0].ref).toBe('https://cdn/one.png');
    expect(sources[1].ref).toBe('https://cdn/two.png');
  });

  test('a video source is dropped — this is a STILLS compositor', () => {
    expect(layerSourcesFromGraph('layers', [edge('clip')], nodes)).toEqual([]);
  });

  test('a node holding nothing yet contributes nothing', () => {
    expect(layerSourcesFromGraph('layers', [edge('empty')], nodes)).toEqual([]);
  });

  test('only the image-in handle counts', () => {
    expect(layerSourcesFromGraph('layers', [edge('gen', 'prompt')], nodes)).toEqual([]);
    // A null targetHandle defaults to the pool: React Flow omits it on single-handle drops.
    expect(layerSourcesFromGraph('layers', [edge('gen', null)], nodes)).toHaveLength(1);
  });

  test('edges to another node are ignored', () => {
    const elsewhere = { ...edge('gen'), target: 'someone-else' };
    expect(layerSourcesFromGraph('layers', [elsewhere], nodes)).toEqual([]);
  });

  test('the name comes from the node label, and falls back to type + position', () => {
    const sources = layerSourcesFromGraph('layers', [edge('gen'), edge('img')], nodes);
    expect(sources[0].name).toBe('Hero');
    expect(sources[1].name).toBe('image 2');
  });

  test('carries the durable library identity when the node has one', () => {
    const pinned = [
      {
        id: 'gen',
        type: 'nanoGen',
        data: {
          generatedImageUrl: 'https://cdn/one.png',
          renderOutputAssetId: 'asset-1',
          renderOutputAssetVersionId: 'version-1',
        },
      },
    ];
    const [source] = layerSourcesFromGraph('layers', [edge('gen')], pinned);
    expect(source.assetId).toBe('asset-1');
    expect(source.assetVersionId).toBe('version-1');
  });
});
