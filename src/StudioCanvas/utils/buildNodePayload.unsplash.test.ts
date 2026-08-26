// The load-bearing assumption of the Unsplash feature: a canvas image node that
// holds a REMOTE Unsplash url (never inlined to base64) still reaches the model.
//
// If someone reintroduces mandatory inlining, or "normalises" the url, these
// fail — which is the point. Unsplash's guidelines require the CDN url to be
// used as returned, `ixid` included, and the Backend's resolveReferenceToBase64
// is what turns it into bytes at generation time.

import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import type { NodeOutput } from '../types/execution';
import { buildNanoGenPayload, toBackendPayload } from './buildNodePayload';

const UNSPLASH_URL =
  'https://images.unsplash.com/photo-1416339306562-f3d12fefd36f?ixid=M3w0fDB8MXxyYW5kb218&ixlib=rb-4.0.3&q=80&w=1080';

const unsplashImageNode = (id: string): StudioNode =>
  ({
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      image: UNSPLASH_URL,
      sourceUrl: UNSPLASH_URL,
      referenceType: 'default',
      attribution: {
        provider: 'unsplash',
        photographerName: 'Jeff Sheldon',
        photographerUrl: 'https://unsplash.com/@ugmonk?utm_source=continuum&utm_medium=referral',
        sourceUrl:
          'https://unsplash.com/photos/eOLpJytrbsQ?utm_source=continuum&utm_medium=referral',
      },
    },
  }) as unknown as StudioNode;

const nanoNode = (id: string): StudioNode =>
  ({
    id,
    type: 'nanoGen',
    position: { x: 0, y: 0 },
    data: { positivePrompt: 'a product on a marble surface', model: 'nano-banana' },
  }) as unknown as StudioNode;

const refEdge = (source: string, target: string): Edge =>
  ({ id: `${source}->${target}`, source, target, targetHandle: 'ref-image' }) as Edge;

// What executeWorkflow puts in the output map for an image node holding an http
// url (executeWorkflow.ts, the `isHttpUrl(imageData.image)` branch). The payload
// builder reads references from that map, so seeding it is what makes this test
// the real path rather than a hypothetical one.
const seededAsExecutorWould = (nodeId: string, url: string): Map<string, NodeOutput> =>
  new Map<string, NodeOutput>([
    [nodeId, { type: 'image', base64: '', mimeType: 'image/png', url }],
  ]);

describe('Unsplash reference images stay hotlinked', () => {
  it('ships a remote Unsplash url as image_url, with no base64 payload', () => {
    const img = unsplashImageNode('img1');
    const nano = nanoNode('nano1');

    const payload = buildNanoGenPayload(
      nano,
      seededAsExecutorWould('img1', UNSPLASH_URL),
      [img, nano],
      [refEdge('img1', 'nano1')],
      'brand-1',
    );

    expect(payload).not.toBeNull();
    expect(payload!.referenceImages).toHaveLength(1);
    expect(payload!.referenceImages![0].imageUrl).toBe(UNSPLASH_URL);
    expect(payload!.referenceImages![0].data).toBeUndefined();

    const backend = toBackendPayload(payload!);
    expect(backend.reference_images![0].image_url).toBe(UNSPLASH_URL);
    expect(backend.reference_images![0].data).toBeUndefined();
  });

  it('preserves the ixid tracking parameter verbatim', () => {
    const img = unsplashImageNode('img1');
    const nano = nanoNode('nano1');

    const payload = buildNanoGenPayload(
      nano,
      seededAsExecutorWould('img1', UNSPLASH_URL),
      [img, nano],
      [refEdge('img1', 'nano1')],
      'brand-1',
    );
    const sent = toBackendPayload(payload!).reference_images![0].image_url!;

    expect(sent).toContain('ixid=M3w0fDB8MXxyYW5kb218');
    expect(new URL(sent).searchParams.get('ixid')).toBe('M3w0fDB8MXxyYW5kb218');
  });
});
