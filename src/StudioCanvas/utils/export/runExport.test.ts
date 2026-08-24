// Graph reading and format selection for the Export node. The encoding half runs in a
// real browser (`studio:router-export:e2e:bench`); everything here is pure.

import { describe, expect, it } from 'bun:test';
import { EXPORT_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { NodeOutput } from '../../types/execution';
import {
  exportKindForSources,
  exportSourceFromNodeData,
  exportSourcesFromGraph,
  exportSourcesFromOutputs,
  resolveExportFormat,
} from './runExport';

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  targetHandle: EXPORT_MEDIA_INPUT_HANDLE,
});

describe('exportSourcesFromOutputs', () => {
  it('prefers the durable URL over inline base64', () => {
    const outputs: NodeOutput[] = [
      { type: 'image', mimeType: 'image/png', base64: 'AAA', url: 'https://cdn/one.png' },
    ];
    expect(exportSourcesFromOutputs(outputs)).toEqual([
      { kind: 'image', ref: 'https://cdn/one.png' },
    ]);
  });

  it('falls back to base64 when there is no URL', () => {
    const outputs: NodeOutput[] = [{ type: 'image', mimeType: 'image/png', base64: 'AAA' }];
    expect(exportSourcesFromOutputs(outputs)).toEqual([{ kind: 'image', ref: 'AAA' }]);
  });

  it('flattens a collection to one source per item — the ZIP case', () => {
    const outputs: NodeOutput[] = [
      {
        type: 'collection',
        itemType: 'image',
        items: [
          { type: 'image', mimeType: 'image/png', url: 'https://cdn/a.png' },
          { type: 'image', mimeType: 'image/png', url: 'https://cdn/b.png' },
          { type: 'image', mimeType: 'image/png', url: 'https://cdn/c.png' },
        ],
      },
    ];
    expect(exportSourcesFromOutputs(outputs)).toHaveLength(3);
  });

  it('flattens a nested collection', () => {
    const inner: NodeOutput = {
      type: 'collection',
      itemType: 'video',
      items: [{ type: 'video', url: 'https://cdn/a.mp4' }],
    };
    const outputs: NodeOutput[] = [{ type: 'collection', itemType: 'video', items: [inner] }];
    expect(exportSourcesFromOutputs(outputs)).toEqual([
      { kind: 'video', ref: 'https://cdn/a.mp4' },
    ]);
  });

  it('yields one source per variation of a multi-image generation', () => {
    const outputs: NodeOutput[] = [
      {
        type: 'images',
        items: [
          { mimeType: 'image/png', url: 'https://cdn/v1.png' },
          { mimeType: 'image/png', url: 'https://cdn/v2.png' },
        ],
      },
    ];
    expect(exportSourcesFromOutputs(outputs)).toHaveLength(2);
  });

  it('drops text — there is no file to hand a user for a string', () => {
    expect(exportSourcesFromOutputs([{ type: 'text', value: 'hello' }])).toEqual([]);
  });

  it('drops an output that carries no bytes at all', () => {
    const outputs: NodeOutput[] = [{ type: 'image', mimeType: 'image/png', base64: '' }];
    expect(exportSourcesFromOutputs(outputs)).toEqual([]);
  });
});

describe('exportSourceFromNodeData', () => {
  it('reads a generated still', () => {
    expect(
      exportSourceFromNodeData({ type: 'nanoGen', data: { generatedImage: 'data:image/png,x' } }),
    ).toEqual({ kind: 'image', ref: 'data:image/png,x' });
  });

  it('prefers the durable image URL over the inline preview', () => {
    expect(
      exportSourceFromNodeData({
        type: 'nanoGen',
        data: { generatedImage: 'data:image/png,x', generatedImageUrl: 'https://cdn/x.png' },
      }),
    ).toEqual({ kind: 'image', ref: 'https://cdn/x.png' });
  });

  it('picks the clip over its poster still on a node that carries both', () => {
    expect(
      exportSourceFromNodeData({
        type: 'videoGen',
        data: { generatedVideoUrl: 'https://cdn/x.mp4', generatedImage: 'data:image/png,poster' },
      }),
    ).toEqual({ kind: 'video', ref: 'https://cdn/x.mp4' });
  });

  it('reads a reference node that only kept its durable URL', () => {
    expect(
      exportSourceFromNodeData({ type: 'image', data: { sourceUrl: 'https://cdn/ref.png' } }),
    ).toEqual({ kind: 'image', ref: 'https://cdn/ref.png' });
    expect(
      exportSourceFromNodeData({ type: 'video', data: { sourceUrl: 'https://cdn/ref.mp4' } }),
    ).toEqual({ kind: 'video', ref: 'https://cdn/ref.mp4' });
  });

  it('returns null for a node that has produced nothing yet', () => {
    expect(exportSourceFromNodeData({ type: 'nanoGen', data: {} })).toBeNull();
    expect(exportSourceFromNodeData({ type: 'nanoGen' })).toBeNull();
  });
});

describe('exportSourcesFromGraph', () => {
  const nodes = [
    { id: 'a', type: 'nanoGen', data: { generatedImageUrl: 'https://cdn/a.png' } },
    { id: 'b', type: 'nanoGen', data: { generatedImageUrl: 'https://cdn/b.png' } },
    { id: 'empty', type: 'nanoGen', data: {} },
    { id: 'exp', type: 'export', data: { format: 'png' } },
  ];

  it('collects the whole pool feeding media-in, in edge order', () => {
    const edges = [edge('e1', 'a', 'exp'), edge('e2', 'b', 'exp')];
    expect(exportSourcesFromGraph('exp', edges, nodes)).toEqual([
      { kind: 'image', ref: 'https://cdn/a.png' },
      { kind: 'image', ref: 'https://cdn/b.png' },
    ]);
  });

  it('ignores edges into other nodes', () => {
    const edges = [edge('e1', 'a', 'exp'), edge('e2', 'b', 'someone-else')];
    expect(exportSourcesFromGraph('exp', edges, nodes)).toHaveLength(1);
  });

  it('ignores an edge landing on a different handle', () => {
    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'exp', targetHandle: 'prompt' }];
    expect(exportSourcesFromGraph('exp', edges, nodes)).toEqual([]);
  });

  it('drops an upstream that has produced nothing yet', () => {
    const edges = [edge('e1', 'empty', 'exp'), edge('e2', 'a', 'exp')];
    expect(exportSourcesFromGraph('exp', edges, nodes)).toHaveLength(1);
  });
});

describe('exportKindForSources', () => {
  it('is null with nothing wired in', () => {
    expect(exportKindForSources([])).toBeNull();
  });

  it('is image for a pool of stills', () => {
    expect(exportKindForSources([{ kind: 'image', ref: 'x' }])).toBe('image');
  });

  it('is video as soon as one clip is in the pool', () => {
    expect(
      exportKindForSources([
        { kind: 'image', ref: 'x' },
        { kind: 'video', ref: 'y' },
      ]),
    ).toBe('video');
  });
});

describe('resolveExportFormat', () => {
  it('keeps a stored format that matches what is wired in', () => {
    expect(resolveExportFormat('webp', 'image')).toBe('webp');
    expect(resolveExportFormat('gif', 'video')).toBe('gif');
  });

  it('ignores a stored format from the wrong kind rather than writing a mislabelled file', () => {
    expect(resolveExportFormat('mov-h264', 'image')).toBe('png');
    expect(resolveExportFormat('jpg', 'video')).toBe('mp4-h264');
  });

  it('defaults when nothing has been picked', () => {
    expect(resolveExportFormat(null, 'image')).toBe('png');
    expect(resolveExportFormat(undefined, 'video')).toBe('mp4-h264');
    expect(resolveExportFormat('nonsense', 'image')).toBe('png');
  });

  it('is null when nothing is connected — the node has no format to offer', () => {
    expect(resolveExportFormat('png', null)).toBeNull();
  });
});
