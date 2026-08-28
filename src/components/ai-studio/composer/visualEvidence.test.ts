import { describe, expect, it } from 'bun:test';
import type { StudioNode } from '@/StudioCanvas/types';
import { isVideoNode, rankEvidenceCandidates, resolveMediaUrl } from './visualEvidence';

const node = (id: string, type: string, data: Record<string, unknown> = {}): StudioNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as unknown as StudioNode;

describe('resolveMediaUrl', () => {
  it('reads a reference node from sourceUrl', () => {
    expect(resolveMediaUrl(node('a', 'image', { sourceUrl: 'https://x/a.png' }))).toBe(
      'https://x/a.png',
    );
  });

  // "Look at the second one" after a run means the render, not the reference that fed
  // it — so a generator that has produced something reads its output first.
  it('prefers generated output over the reference that produced it', () => {
    const generator = node('g', 'nanoGen', {
      sourceUrl: 'https://x/ref.png',
      generatedImageUrl: 'https://x/out.png',
    });
    expect(resolveMediaUrl(generator)).toBe('https://x/out.png');
  });

  it('ignores a blank url', () => {
    expect(resolveMediaUrl(node('a', 'image', { sourceUrl: '   ' }))).toBeUndefined();
    expect(resolveMediaUrl(node('a', 'image', {}))).toBeUndefined();
  });

  // generatedImage can hold a Blob mid-run; only a string is a URL.
  it('does not treat a non-string generatedImage as a url', () => {
    expect(resolveMediaUrl(node('a', 'nanoGen', { generatedImage: {} }))).toBeUndefined();
  });
});

describe('isVideoNode', () => {
  it('classifies by node type', () => {
    expect(isVideoNode(node('v', 'video'))).toBe(true);
    expect(isVideoNode(node('t', 'timelineEditor'))).toBe(true);
    expect(isVideoNode(node('i', 'image'))).toBe(false);
    expect(isVideoNode(node('n', 'nanoGen'))).toBe(false);
  });

  it('treats a generator that produced video as video', () => {
    expect(isVideoNode(node('g', 'omniGen', { generatedVideoUrl: 'https://x/v.mp4' }))).toBe(true);
  });
});

describe('rankEvidenceCandidates', () => {
  const nodes = [
    node('prompt', 'string', { value: 'hello' }),
    node('img-1', 'image', { sourceUrl: 'https://x/1.png' }),
    node('img-2', 'image', { sourceUrl: 'https://x/2.png' }),
    node('empty', 'image', {}),
    node('note', 'note', { content: 'hi' }),
  ];

  it('keeps only media nodes that actually have a url', () => {
    expect(rankEvidenceCandidates(nodes).map((n) => n.id)).toEqual(['img-1', 'img-2']);
  });

  // The selection is the only reliable statement of what the turn is about, so on a
  // canvas with more media than budget it decides which frames get spent.
  it('puts the selection first', () => {
    expect(rankEvidenceCandidates(nodes, ['img-2']).map((n) => n.id)).toEqual(['img-2', 'img-1']);
  });

  it('returns nothing when the canvas carries no media', () => {
    expect(rankEvidenceCandidates([nodes[0] as StudioNode])).toEqual([]);
  });
});
