import { describe, expect, it } from 'bun:test';
import type { StudioNode } from '../types';
import { upstreamDraft } from './OrganicPublishBlock';
import { mediaInputHandles, upstreamCaption } from './PlannerDraftBlock';

const node = (id: string, type: string, data: Record<string, unknown>): StudioNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as StudioNode;

describe('upstreamCaption', () => {
  const stringNode = node('copy', 'string', { value: 'Summer drop is live' });

  it('reads the wired text node', () => {
    expect(
      upstreamCaption({
        nodeId: 'draft',
        nodes: [stringNode],
        edges: [{ source: 'copy', target: 'draft', targetHandle: 'text-in' }],
      }),
    ).toBe('Summer drop is live');
  });

  it('ignores media wires — only the caption handle carries copy', () => {
    expect(
      upstreamCaption({
        nodeId: 'draft',
        nodes: [stringNode],
        edges: [{ source: 'copy', target: 'draft', targetHandle: 'image-in' }],
      }),
    ).toBeNull();
  });

  it('treats a blank upstream value as no caption', () => {
    expect(
      upstreamCaption({
        nodeId: 'draft',
        nodes: [node('copy', 'string', { value: '   ' })],
        edges: [{ source: 'copy', target: 'draft', targetHandle: 'text-in' }],
      }),
    ).toBeNull();
  });
});

describe('mediaInputHandles', () => {
  it('exposes one handle per carousel slot, in slot order', () => {
    expect(
      mediaInputHandles({
        format: 'carousel',
        assetSlots: [
          { id: 'second', order: 1 },
          { id: 'first', order: 0 },
        ],
      }).map((handle) => handle.id),
    ).toEqual(['asset-first', 'asset-second']);
  });

  it('exposes a single kind-specific handle otherwise', () => {
    expect(mediaInputHandles({ format: 'image' }).map((handle) => handle.id)).toEqual(['image-in']);
    expect(mediaInputHandles({ format: 'video' }).map((handle) => handle.id)).toEqual(['video-in']);
  });
});

describe('upstreamDraft', () => {
  const edges = [{ source: 'draft', target: 'publish', targetHandle: 'draft-in' }];

  it('reports a saved draft as publishable', () => {
    const result = upstreamDraft({
      nodeId: 'publish',
      nodes: [
        node('draft', 'plannerDraft', {
          targetDraftId: 'row-1',
          targetUpdatedAt: '2026-08-17T00:00:00.000Z',
          platform: 'instagram',
          platformAccountId: 'ig-1',
        }),
      ],
      edges,
    });

    expect(result).toMatchObject({ draftId: 'row-1', saved: true, accountId: 'ig-1' });
  });

  /**
   * The whole reason the publish node is downstream of a SAVED row: a draft bound in the
   * node but never written has no row to publish, and posting it would 404.
   */
  it('reports a bound-but-unsaved draft as not publishable', () => {
    const result = upstreamDraft({
      nodeId: 'publish',
      nodes: [node('draft', 'plannerDraft', { targetDraftId: 'row-2' })],
      edges,
    });

    expect(result?.saved).toBe(false);
  });

  it('refuses anything that is not a plannerDraft', () => {
    expect(
      upstreamDraft({
        nodeId: 'publish',
        nodes: [node('draft', 'nanoGen', { targetDraftId: 'row-3' })],
        edges,
      }),
    ).toBeNull();
  });

  it('returns nothing when no draft is wired in', () => {
    expect(
      upstreamDraft({
        nodeId: 'publish',
        nodes: [node('draft', 'plannerDraft', { targetDraftId: 'row-4' })],
        edges: [{ source: 'draft', target: 'publish', targetHandle: 'image-in' }],
      }),
    ).toBeNull();
  });
});
