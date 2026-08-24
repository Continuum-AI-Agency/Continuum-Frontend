import { describe, expect, it } from 'bun:test';
import type { StudioNode } from '../types';
import { collectApplyAssetCandidates, sortNodesByCanvasPosition } from './applyAssetCandidates';

const node = (
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  position?: { x: number; y: number },
): StudioNode =>
  ({
    id,
    type,
    ...(position ? { position } : {}),
    data,
  }) as unknown as StudioNode;

describe('sortNodesByCanvasPosition', () => {
  it('sorts by x when the x gap exceeds 16px', () => {
    const nodes = [
      node('right', 'nanoGen', {}, { x: 200, y: 500 }),
      node('left', 'nanoGen', {}, { x: 100, y: 900 }),
    ];

    expect(sortNodesByCanvasPosition(nodes).map((n) => n.id)).toEqual(['left', 'right']);
  });

  it('falls back to y when the x difference is within 16px', () => {
    const nodes = [
      node('lower', 'nanoGen', {}, { x: 0, y: 300 }),
      node('upper', 'nanoGen', {}, { x: 16, y: 100 }),
    ];

    expect(sortNodesByCanvasPosition(nodes).map((n) => n.id)).toEqual(['upper', 'lower']);
  });

  it('treats an x gap of exactly 16px as a tie and breaks on y', () => {
    const nodes = [
      node('a', 'nanoGen', {}, { x: 0, y: 10 }),
      node('b', 'nanoGen', {}, { x: 16, y: 5 }),
    ];

    expect(sortNodesByCanvasPosition(nodes).map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const nodes = [
      node('right', 'nanoGen', {}, { x: 400, y: 0 }),
      node('left', 'nanoGen', {}, { x: 0, y: 0 }),
    ];

    const sorted = sortNodesByCanvasPosition(nodes);

    expect(nodes.map((n) => n.id)).toEqual(['right', 'left']);
    expect(sorted).not.toBe(nodes);
  });

  it('treats a missing position as { x: 0, y: 0 }', () => {
    const nodes = [
      node('positioned', 'nanoGen', {}, { x: 100, y: 100 }),
      node('unpositioned', 'nanoGen'),
    ];

    expect(sortNodesByCanvasPosition(nodes).map((n) => n.id)).toEqual([
      'unpositioned',
      'positioned',
    ]);
  });
});

describe('collectApplyAssetCandidates', () => {
  it('returns every image before any video, regardless of canvas order', () => {
    const nodes = [
      node('video-left', 'videoGen', { generatedVideo: 'v-left' }, { x: 0, y: 0 }),
      node('image-right', 'nanoGen', { generatedImage: 'i-right' }, { x: 500, y: 0 }),
    ];

    expect(collectApplyAssetCandidates(nodes)).toEqual([
      { nodeId: 'image-right', role: 'image_1', kind: 'image', source: 'i-right' },
      { nodeId: 'video-left', role: 'video_1', kind: 'video', source: 'v-left' },
    ]);
  });

  it('numbers image and video roles in canvas-position order', () => {
    const nodes = [
      node('image-c', 'nanoGen', { generatedImage: 'i-c' }, { x: 900, y: 0 }),
      node('video-b', 'extendVideo', { generatedVideo: 'v-b' }, { x: 600, y: 0 }),
      node('image-a', 'nanoGen', { generatedImage: 'i-a' }, { x: 0, y: 0 }),
      node('video-a', 'videoGen', { generatedVideo: 'v-a' }, { x: 300, y: 0 }),
      node('image-b', 'nanoGen', { generatedImage: 'i-b' }, { x: 450, y: 0 }),
    ];

    expect(collectApplyAssetCandidates(nodes)).toEqual([
      { nodeId: 'image-a', role: 'image_1', kind: 'image', source: 'i-a' },
      { nodeId: 'image-b', role: 'image_2', kind: 'image', source: 'i-b' },
      { nodeId: 'image-c', role: 'image_3', kind: 'image', source: 'i-c' },
      { nodeId: 'video-a', role: 'video_1', kind: 'video', source: 'v-a' },
      { nodeId: 'video-b', role: 'video_2', kind: 'video', source: 'v-b' },
    ]);
  });

  it('only takes images from nanoGen nodes and videos from videoGen / extendVideo nodes', () => {
    const nodes = [
      node('nano', 'nanoGen', { generatedImage: 'nano-image' }, { x: 0, y: 0 }),
      node('video-gen', 'videoGen', { generatedVideo: 'video-gen-video' }, { x: 200, y: 0 }),
      node('extend', 'extendVideo', { generatedVideo: 'extend-video' }, { x: 400, y: 0 }),
      node(
        'omni',
        'omniGen',
        { generatedImage: 'omni-image', generatedVideo: 'omni-video' },
        { x: 600, y: 0 },
      ),
      node('image-node', 'image', { generatedImage: 'plain-image' }, { x: 800, y: 0 }),
      node('video-node', 'video', { generatedVideo: 'plain-video' }, { x: 1000, y: 0 }),
      node('string', 'string', { generatedImage: 'string-image' }, { x: 1200, y: 0 }),
    ];

    expect(collectApplyAssetCandidates(nodes)).toEqual([
      { nodeId: 'nano', role: 'image_1', kind: 'image', source: 'nano-image' },
      { nodeId: 'video-gen', role: 'video_1', kind: 'video', source: 'video-gen-video' },
      { nodeId: 'extend', role: 'video_2', kind: 'video', source: 'extend-video' },
    ]);
  });

  it('prefers generatedImage / generatedVideo over the url variants and trims the value', () => {
    const nodes = [
      node(
        'image',
        'nanoGen',
        { generatedImage: '  data:image/png;base64,AAAA  ', generatedImageUrl: 'https://img' },
        { x: 0, y: 0 },
      ),
      node(
        'video',
        'videoGen',
        { generatedVideo: '  data:video/mp4;base64,BBBB  ', generatedVideoUrl: 'https://vid' },
        { x: 200, y: 0 },
      ),
    ];

    expect(collectApplyAssetCandidates(nodes)).toEqual([
      { nodeId: 'image', role: 'image_1', kind: 'image', source: 'data:image/png;base64,AAAA' },
      { nodeId: 'video', role: 'video_1', kind: 'video', source: 'data:video/mp4;base64,BBBB' },
    ]);
  });

  it('falls back to the url variant when the preferred source is unusable', () => {
    const nodes = [
      node(
        'blob-image',
        'nanoGen',
        { generatedImage: new Blob(['x']), generatedImageUrl: '  https://img  ' },
        { x: 0, y: 0 },
      ),
      node(
        'blank-video',
        'videoGen',
        { generatedVideo: '   ', generatedVideoUrl: 'https://vid' },
        { x: 200, y: 0 },
      ),
    ];

    expect(collectApplyAssetCandidates(nodes)).toEqual([
      { nodeId: 'blob-image', role: 'image_1', kind: 'image', source: 'https://img' },
      { nodeId: 'blank-video', role: 'video_1', kind: 'video', source: 'https://vid' },
    ]);
  });

  it('skips nodes with no usable source without consuming a role number', () => {
    const nodes = [
      node('image-missing', 'nanoGen', {}, { x: 0, y: 0 }),
      node(
        'image-empty',
        'nanoGen',
        { generatedImage: '', generatedImageUrl: '' },
        { x: 200, y: 0 },
      ),
      node(
        'image-whitespace',
        'nanoGen',
        { generatedImage: '   ', generatedImageUrl: '\t\n' },
        { x: 400, y: 0 },
      ),
      node(
        'image-non-string',
        'nanoGen',
        { generatedImage: 42, generatedImageUrl: null },
        { x: 600, y: 0 },
      ),
      node('image-ok', 'nanoGen', { generatedImage: 'i-ok' }, { x: 800, y: 0 }),
      node('video-missing', 'videoGen', {}, { x: 1000, y: 0 }),
      node(
        'video-non-string',
        'extendVideo',
        { generatedVideo: { url: 'nope' }, generatedVideoUrl: undefined },
        { x: 1200, y: 0 },
      ),
      node('video-ok', 'videoGen', { generatedVideoUrl: 'v-ok' }, { x: 1400, y: 0 }),
    ];

    expect(collectApplyAssetCandidates(nodes)).toEqual([
      { nodeId: 'image-ok', role: 'image_1', kind: 'image', source: 'i-ok' },
      { nodeId: 'video-ok', role: 'video_1', kind: 'video', source: 'v-ok' },
    ]);
  });
});
