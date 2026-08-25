// Graph reading and format selection for the Export node. The pure half runs as-is; the
// `runExport` encode path runs against mocked per-kind encoders (real codecs live in
// `studio:router-export:e2e:bench`) with the REAL zip, verified by unzipping the bytes.

import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { EXPORT_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import * as transcode from '@/lib/export/transcode';
import type { NodeOutput } from '../../types/execution';
import {
  exportFormatForSource,
  exportKindForSources,
  exportSourceFromNodeData,
  exportSourcesFromGraph,
  exportSourcesFromOutputs,
  resolveExportFormat,
  runExport,
} from './runExport';

// Captured before mock.module patches the namespace, so afterAll can restore the real
// module for any later test file in this process (mock.module is process-wide).
const realTranscode = { ...transcode };

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

describe('exportFormatForSource', () => {
  it('keeps the picked format for sources of its own kind', () => {
    expect(exportFormatForSource({ kind: 'video', ref: 'x' }, 'mp4-h264')).toBe('mp4-h264');
    expect(exportFormatForSource({ kind: 'video', ref: 'x' }, 'gif')).toBe('gif');
    expect(exportFormatForSource({ kind: 'image', ref: 'x' }, 'webp')).toBe('webp');
  });

  it('sends a still in a video pool to the image default, never the clip encoder', () => {
    expect(exportFormatForSource({ kind: 'image', ref: 'x' }, 'mp4-h264')).toBe('png');
    expect(exportFormatForSource({ kind: 'image', ref: 'x' }, 'gif')).toBe('png');
  });

  it('sends a clip in an image pool to the video default', () => {
    expect(exportFormatForSource({ kind: 'video', ref: 'x' }, 'png')).toBe('mp4-h264');
  });
});

describe('runExport (mocked encoders, real zip)', () => {
  const imageCalls: string[] = [];
  const videoCalls: string[] = [];

  beforeAll(() => {
    mock.module('@/lib/export/transcode', () => ({
      ...realTranscode,
      transcodeImage: async (_source: Blob, format: transcode.ExportFormatId) => {
        imageCalls.push(format);
        return { blob: new Blob([`image:${format}`]) };
      },
      transcodeVideo: async (_source: Blob, format: transcode.ExportFormatId) => {
        videoCalls.push(format);
        return { blob: new Blob([`video:${format}`]), fellBackToH264: false };
      },
      encodeGif: async () => {
        videoCalls.push('gif');
        return { blob: new Blob(['video:gif']) };
      },
    }));
  });

  afterAll(() => {
    mock.module('@/lib/export/transcode', () => realTranscode);
  });

  beforeEach(() => {
    imageCalls.length = 0;
    videoCalls.length = 0;
  });

  const unzipNames = async (blob: Blob): Promise<Record<string, string>> => {
    const entries = realTranscode.unzipToEntries(new Uint8Array(await blob.arrayBuffer()));
    return Object.fromEntries(
      Object.entries(entries).map(([name, bytes]) => [name, new TextDecoder().decode(bytes)]),
    );
  };

  it('bundles a mixed image+video pool into one ZIP, each source by its own kind — D-03', async () => {
    const result = await runExport({
      sources: [
        { kind: 'image', ref: new Blob(['still-bytes']) },
        { kind: 'video', ref: new Blob(['clip-bytes']) },
      ],
      format: 'mp4-h264',
      download: false,
    });

    expect(result.zipped).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('canvas-export.zip');
    // The image went through the image encoder at its kind's default; the clip kept
    // the picked format. Nothing was pushed through the wrong encoder.
    expect(imageCalls).toEqual(['png']);
    expect(videoCalls).toEqual(['mp4-h264']);
    expect(await unzipNames(result.files[0].blob)).toEqual({
      'canvas-export-1.png': 'image:png',
      'canvas-export-2.mp4': 'video:mp4-h264',
    });
  });

  it('bundles a homogeneous two-image pool into one ZIP in the picked format', async () => {
    const result = await runExport({
      sources: [
        { kind: 'image', ref: new Blob(['a']) },
        { kind: 'image', ref: new Blob(['b']) },
      ],
      format: 'webp',
      download: false,
    });

    expect(result.zipped).toBe(true);
    expect(imageCalls).toEqual(['webp', 'webp']);
    expect(videoCalls).toEqual([]);
    expect(await unzipNames(result.files[0].blob)).toEqual({
      'canvas-export-1.webp': 'image:webp',
      'canvas-export-2.webp': 'image:webp',
    });
  });

  it('leaves the single-source path exactly as before — one file, picked format, no ZIP', async () => {
    const result = await runExport({
      sources: [{ kind: 'image', ref: new Blob(['solo']) }],
      format: 'png',
      download: false,
    });

    expect(result.zipped).toBe(false);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('canvas-export.png');
    expect(imageCalls).toEqual(['png']);
    expect(await result.files[0].blob.text()).toBe('image:png');
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
