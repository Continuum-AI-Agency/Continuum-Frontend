// An Element's `/slug` style defaults ride into every generator it is wired into, ahead of
// the generator's own prompt so a slug the user typed there still wins.

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ElementRecord } from '@continuum/contracts';

const ELEMENT: ElementRecord = {
  id: 'element-1',
  brandId: 'brand-1',
  name: 'Aero Bottle',
  slug: 'aero-bottle',
  category: 'product',
  guidelines: null,
  rightsNote: null,
  members: [{ assetId: 'member-1', position: 0 }],
  referenceHistory: ['ref-1'],
  defaultReferenceAssetId: 'ref-1',
  styleSlugs: ['film-grain', 'golden-hour'],
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

const requestMock = mock(() => Promise.resolve({ element: ELEMENT } as unknown));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import type { Edge } from '@xyflow/react';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { elementStyleSlugsFor, executeWorkflow } from './executeWorkflow';

const elementNode = (id: string, styleSlugs?: string[]): StudioNode => ({
  id,
  position: { x: 0, y: 0 },
  type: 'element',
  data: { elementId: null, ...(styleSlugs ? { styleSlugs } : {}) },
});

const node = (id: string, type: string): StudioNode => ({
  id,
  position: { x: 0, y: 0 },
  type,
  data: {},
});

const edge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
});

describe('elementStyleSlugsFor', () => {
  it('collects every wired Element’s slugs in wire order, once each', () => {
    const nodes = [
      elementNode('a', ['film-grain', 'golden-hour']),
      elementNode('b', ['golden-hour', 'matte']),
      node('gen', 'nanoGen'),
    ];
    expect(elementStyleSlugsFor('gen', nodes, [edge('a', 'gen'), edge('b', 'gen')])).toEqual([
      'film-grain',
      'golden-hour',
      'matte',
    ]);
    expect(elementStyleSlugsFor('gen', nodes, [edge('b', 'gen'), edge('a', 'gen')])).toEqual([
      'golden-hour',
      'matte',
      'film-grain',
    ]);
  });

  it('ignores Elements wired elsewhere and sources that are not Elements', () => {
    const nodes = [
      elementNode('a', ['film-grain']),
      elementNode('b', ['matte']),
      { ...node('img', 'image'), data: { styleSlugs: ['not-an-element'] } } as StudioNode,
      node('gen', 'nanoGen'),
      node('other', 'nanoGen'),
    ];
    expect(
      elementStyleSlugsFor('gen', nodes, [
        edge('a', 'gen'),
        edge('img', 'gen'),
        edge('b', 'other'),
      ]),
    ).toEqual(['film-grain']);
  });

  it('is empty for an Element with no styles and for a generator with nothing wired', () => {
    const nodes = [elementNode('a'), node('gen', 'nanoGen')];
    expect(elementStyleSlugsFor('gen', nodes, [edge('a', 'gen')])).toEqual([]);
    expect(elementStyleSlugsFor('gen', nodes, [])).toEqual([]);
  });
});

describe('executeWorkflow — Element style tokens', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requestMock.mockClear();
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ signedUrl: 'https://storage/ref-1.png' }),
      }),
    ) as never;
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const seed = (generator: StudioNode, targetHandle = 'ref-image') => {
    useStudioStore.getState().setNodes([
      {
        id: 'el',
        position: { x: 0, y: 0 },
        type: 'element',
        data: { elementId: 'element-1', useIntent: 'subject' },
      },
      generator,
    ]);
    useStudioStore.getState().setEdges([
      {
        id: 'e-el',
        source: 'el',
        target: generator.id,
        sourceHandle: 'image',
        targetHandle,
      },
    ]);
  };

  it('refreshes the Element’s slugs onto its node and prepends them to the nanoGen prompt', async () => {
    seed({
      id: 'gen',
      position: { x: 0, y: 0 },
      type: 'nanoGen',
      data: { model: 'nano-banana', positivePrompt: 'the bottle on wet sand /noir' },
    });
    const executeGeneration = mock(async (_id: string, _payload: { prompt: string }) => ({
      success: true,
      output: { type: 'image', base64: 'generated', mimeType: 'image/png' },
    }));

    await executeWorkflow(
      {
        executeGeneration,
        executeVideoExtension: mock(async () => ({ success: true })),
        executeEnrichment: mock(async () => ({ success: true })),
        registerController: () => new AbortController(),
        releaseController: () => {},
        show: () => {},
        cancel: () => {},
        reset: () => {},
      } as never,
      { brandId: 'brand-1' },
    );

    const elementData = useStudioStore.getState().nodes.find((entry) => entry.id === 'el')?.data;
    expect(elementData?.styleSlugs).toEqual(['film-grain', 'golden-hour']);
    expect(executeGeneration).toHaveBeenCalledTimes(1);
    expect(executeGeneration.mock.calls[0]?.[1].prompt).toStartWith(
      '/film-grain /golden-hour the bottle on wet sand /noir',
    );
  });

  it('prepends them to the Omni prompt', async () => {
    seed(
      {
        id: 'omni',
        position: { x: 0, y: 0 },
        type: 'omniGen',
        data: { model: 'gemini-omni-flash', prompt: 'a slow push-in' },
      },
      'ref-images',
    );
    const executeOmniTurn = mock(async (_id: string, _payload: { prompt: string }) => ({
      success: true,
      interactionId: 'v1',
      output: {
        type: 'video',
        url: 'https://example.com/out.mp4',
        storagePath: 'p',
        storageBucket: 'b',
      },
    }));

    await executeWorkflow(
      {
        executeGeneration: mock(async () => ({ success: true })),
        executeVideoExtension: mock(async () => ({ success: true })),
        executeEnrichment: mock(async () => ({ success: true })),
        executeOmniTurn,
        cancel: () => {},
        reset: () => {},
      } as never,
      { targetNodeId: 'omni', brandId: 'brand-1' },
    );

    expect(executeOmniTurn.mock.calls[0]?.[1].prompt).toBe(
      '/film-grain /golden-hour a slow push-in',
    );
  });
});
