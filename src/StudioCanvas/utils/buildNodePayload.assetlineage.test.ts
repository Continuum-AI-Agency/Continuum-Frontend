import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import type { NodeOutput } from '../types/execution';
import { buildNanoGenPayload, toBackendPayload } from './buildNodePayload';

// A reference node that came from the Library carries its asset id; a loose file
// dropped straight onto the canvas does not.
const imageNode = (id: string, assetId?: string): StudioNode =>
  ({
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: { referenceType: 'default', ...(assetId ? { assetId } : {}) },
  }) as unknown as StudioNode;

const nanoNode = (id: string): StudioNode =>
  ({
    id,
    type: 'nanoGen',
    position: { x: 0, y: 0 },
    data: { positivePrompt: 'make a variant', model: 'nano-banana' },
  }) as unknown as StudioNode;

const refEdge = (source: string, target: string): Edge =>
  ({ id: `${source}->${target}`, source, target, targetHandle: 'ref-image' }) as Edge;

const signedOutput = (name: string): NodeOutput => ({
  type: 'image',
  base64: '',
  mimeType: 'image/png',
  url: `https://x.supabase.co/sign/${name}.png?token=t`,
});

describe('reference asset lineage reaches the Backend', () => {
  // Without this, performance-aware generation is silently inert: the digest is
  // built server-side but nothing ever tells it WHICH creative was referenced.
  it('sends the Library ids of the reference creatives on the wire', () => {
    const nano = nanoNode('nano1');
    const a = imageNode('img1', 'asset-a');
    const b = imageNode('img2', 'asset-b');
    const resolved = new Map<string, NodeOutput>([
      ['img1', signedOutput('a')],
      ['img2', signedOutput('b')],
    ]);

    const payload = buildNanoGenPayload(
      nano,
      resolved,
      [a, b, nano],
      [refEdge('img1', 'nano1'), refEdge('img2', 'nano1')],
      'brand-1',
    );

    expect(payload?.referenceAssetIds).toEqual(['asset-a', 'asset-b']);
    expect(toBackendPayload(payload!).reference_asset_ids).toEqual(['asset-a', 'asset-b']);
  });

  it('omits a reference that has no Library id rather than inventing one', () => {
    const nano = nanoNode('nano1');
    const tracked = imageNode('img1', 'asset-a');
    const loose = imageNode('img2');
    const resolved = new Map<string, NodeOutput>([
      ['img1', signedOutput('a')],
      ['img2', signedOutput('b')],
    ]);

    const payload = buildNanoGenPayload(
      nano,
      resolved,
      [tracked, loose, nano],
      [refEdge('img1', 'nano1'), refEdge('img2', 'nano1')],
      'brand-1',
    );

    expect(payload?.referenceImages).toHaveLength(2);
    expect(payload?.referenceAssetIds).toEqual(['asset-a']);
  });

  it('leaves the field unset when no reference is a Library asset', () => {
    const nano = nanoNode('nano1');
    const loose = imageNode('img1');
    const resolved = new Map<string, NodeOutput>([['img1', signedOutput('a')]]);

    const payload = buildNanoGenPayload(
      nano,
      resolved,
      [loose, nano],
      [refEdge('img1', 'nano1')],
      'brand-1',
    );

    expect(payload?.referenceAssetIds).toBeUndefined();
    expect(toBackendPayload(payload!).reference_asset_ids).toBeUndefined();
  });

  it('dedupes the same asset attached twice', () => {
    const nano = nanoNode('nano1');
    const a = imageNode('img1', 'asset-a');
    const again = imageNode('img2', 'asset-a');
    const resolved = new Map<string, NodeOutput>([
      ['img1', signedOutput('a')],
      ['img2', signedOutput('a')],
    ]);

    const payload = buildNanoGenPayload(
      nano,
      resolved,
      [a, again, nano],
      [refEdge('img1', 'nano1'), refEdge('img2', 'nano1')],
      'brand-1',
    );

    expect(payload?.referenceAssetIds).toEqual(['asset-a']);
  });
});
