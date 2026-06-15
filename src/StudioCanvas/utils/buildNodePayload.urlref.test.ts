import { describe, it, expect } from 'bun:test';
import type { Edge } from '@xyflow/react';
import { buildNanoGenPayload, toBackendPayload } from './buildNodePayload';
import type { StudioNode } from '../types';
import type { NodeOutput } from '../types/execution';

const imageNode = (id: string): StudioNode =>
  ({ id, type: 'image', position: { x: 0, y: 0 }, data: { referenceType: 'default' } }) as unknown as StudioNode;

const nanoNode = (id: string): StudioNode =>
  ({ id, type: 'nanoGen', position: { x: 0, y: 0 }, data: { positivePrompt: 'a cat', model: 'nano-banana' } }) as unknown as StudioNode;

const refEdge = (source: string, target: string): Edge =>
  ({ id: `${source}->${target}`, source, target, targetHandle: 'ref-image' }) as Edge;

describe('buildNanoGenPayload reference handling (URL-first)', () => {
  it('sends image_url (not data) when the source output is a signed URL', () => {
    const img = imageNode('img1');
    const nano = nanoNode('nano1');
    const resolved = new Map<string, NodeOutput>([
      ['img1', { type: 'image', base64: '', mimeType: 'image/png', url: 'https://x.supabase.co/sign/a.png?token=t' }],
    ]);

    const payload = buildNanoGenPayload(nano, resolved, [img, nano], [refEdge('img1', 'nano1')], 'brand-1');
    expect(payload).not.toBeNull();
    expect(payload!.referenceImages).toHaveLength(1);
    expect(payload!.referenceImages![0].imageUrl).toBe('https://x.supabase.co/sign/a.png?token=t');
    expect(payload!.referenceImages![0].data).toBeUndefined();

    const backend = toBackendPayload(payload!);
    expect(backend.reference_images![0].image_url).toBe('https://x.supabase.co/sign/a.png?token=t');
    expect(backend.reference_images![0].data).toBeUndefined();
  });

  it('sends base64 data when the source output is inline bytes (fallback)', () => {
    const img = imageNode('img1');
    const nano = nanoNode('nano1');
    const resolved = new Map<string, NodeOutput>([
      ['img1', { type: 'image', base64: 'AAEC', mimeType: 'image/jpeg' }],
    ]);

    const payload = buildNanoGenPayload(nano, resolved, [img, nano], [refEdge('img1', 'nano1')], 'brand-1');
    expect(payload!.referenceImages![0].data).toBe('AAEC');
    expect(payload!.referenceImages![0].imageUrl).toBeUndefined();

    const backend = toBackendPayload(payload!);
    expect(backend.reference_images![0].data).toBe('AAEC');
    expect(backend.reference_images![0].image_url).toBeUndefined();
  });
});
