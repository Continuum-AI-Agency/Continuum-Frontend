import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({ elements: [] } as unknown));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import type { ElementRecord } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { useStudioStore } from '../stores/useStudioStore';
import { ElementNode, type ElementNodeData } from './ElementNode';

// A signed-preview round trip through react-query does not settle inside
// testing-library's 1s default on a loaded machine.
configure({ asyncUtilTimeout: 4000 });

const buildElement = (overrides: Partial<ElementRecord> = {}): ElementRecord => ({
  id: 'element-1',
  brandId: 'brand-1',
  name: 'Aria',
  slug: 'aria',
  category: 'product',
  guidelines: null,
  rightsNote: null,
  members: [],
  referenceHistory: [],
  defaultReferenceAssetId: null,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

// The wire record carries asset ids; the panel and the node sign them one at a time
// through the library route the canvas already uses for thumbnails.
const signedUrlFor = (assetId: string) => `https://storage/${assetId}.png`;

const fetchMock = mock((_url: string, init?: { body?: string }) => {
  const { assetId } = JSON.parse(init?.body ?? '{}') as { assetId: string };
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ signedUrl: signedUrlFor(assetId) }),
  });
});

const renderNode = (data: ElementNodeData) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReactFlowProvider>
        <ElementNode
          id="node-1"
          data={data}
          type="element"
          selected={false}
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          dragHandle=""
        />
      </ReactFlowProvider>
    </QueryClientProvider>,
  );
};

describe('ElementNode', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({ elements: [] } as never);
    fetchMock.mockClear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as never;
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it('paints the pinned reference and exposes exactly one image source handle', async () => {
    requestMock.mockResolvedValue({
      elements: [
        buildElement({
          referenceHistory: ['ref-1'],
          defaultReferenceAssetId: 'ref-1',
          members: [{ assetId: 'member-1', position: 0 }],
        }),
      ],
    } as never);

    const { container } = renderNode({ elementId: 'element-1' });

    const image = await screen.findByAltText('Aria reference');
    expect(image.getAttribute('src')).toBe(signedUrlFor('ref-1'));

    const handles = container.querySelectorAll('.react-flow__handle');
    expect(handles).toHaveLength(1);
    expect(handles[0]?.getAttribute('data-handleid')).toBe('image');
    expect(handles[0]?.classList.contains('source')).toBe(true);
  });

  it('says it is sending raw members when no reference exists', async () => {
    requestMock.mockResolvedValue({
      elements: [
        buildElement({
          members: [
            { assetId: 'member-1', position: 0 },
            { assetId: 'member-2', position: 1 },
          ],
        }),
      ],
    } as never);

    renderNode({ elementId: 'element-1' });

    expect(await screen.findByText('No reference — sending 2 images')).toBeTruthy();
  });

  it('surfaces the dropped members when a person fallback is over the four-slot budget', async () => {
    requestMock.mockResolvedValue({
      elements: [
        buildElement({
          category: 'model',
          members: Array.from({ length: 6 }, (_, index) => ({
            assetId: `member-${index}`,
            position: index,
          })),
        }),
      ],
    } as never);

    renderNode({ elementId: 'element-1' });

    expect(await screen.findByText('2 of 6 reference images dropped')).toBeTruthy();
  });

  it('reports a deleted Element as unavailable instead of silently sending nothing', async () => {
    requestMock.mockResolvedValue({ elements: [] } as never);

    renderNode({ elementId: 'element-gone', elementName: 'Aria' });

    await waitFor(() => {
      expect(screen.getByText('Element unavailable')).toBeTruthy();
    });
    expect(screen.queryByText(/sending/)).toBeNull();
  });

  it('shows the category on a resolved Element', async () => {
    requestMock.mockResolvedValue({
      elements: [buildElement({ category: 'character', members: [{ assetId: 'm', position: 0 }] })],
    } as never);

    renderNode({ elementId: 'element-1' });

    expect(await screen.findByText('Character')).toBeTruthy();
  });
});
