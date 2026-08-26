import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({ elements: [] } as unknown));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import type { ElementRecord } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type React from 'react';
import { ELEMENT_DRAG_TYPE, parseElementDragPayload } from '@/lib/ai-studio/referenceDrop';
import { ElementsPanel } from './ElementsPanel';

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

const signedUrlFor = (assetId: string) => `https://storage/${assetId}.png`;

const fetchMock = mock((_url: string, init?: { body?: string }) => {
  const { assetId } = JSON.parse(init?.body ?? '{}') as { assetId: string };
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ signedUrl: signedUrlFor(assetId) }),
  });
});

const renderPanel = (props: Partial<React.ComponentProps<typeof ElementsPanel>> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ElementsPanel open onOpenChange={() => {}} brandId="brand-1" {...props} />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
};

describe('ElementsPanel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({ elements: [] } as never);
    fetchMock.mockClear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as never;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it('asks for a brand before it will show anything', () => {
    renderPanel({ brandId: undefined });

    expect(screen.getByText('Select a brand to use Elements.')).toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('offers the empty state when the brand has no Elements', async () => {
    renderPanel();

    expect(await screen.findByText('No Elements yet')).toBeTruthy();
  });

  it('groups Elements by category', async () => {
    requestMock.mockResolvedValue({
      elements: [
        buildElement({ id: 'e1', name: 'Aria', category: 'model' }),
        buildElement({ id: 'e2', name: 'Bottle', category: 'product' }),
      ],
    } as never);

    renderPanel();

    expect(await screen.findByText('Model')).toBeTruthy();
    expect(screen.getByText('Product')).toBeTruthy();
    expect(screen.getByText('Aria')).toBeTruthy();
    expect(screen.getByText('Bottle')).toBeTruthy();
  });

  it('marks an Element that has no reference yet', async () => {
    requestMock.mockResolvedValue({ elements: [buildElement()] } as never);

    renderPanel();

    expect(await screen.findByText('no ref')).toBeTruthy();
  });

  it('drags an Element out as an element-drop payload, not as an image', async () => {
    requestMock.mockResolvedValue({
      elements: [buildElement({ referenceHistory: ['ref-1'], defaultReferenceAssetId: 'ref-1' })],
    } as never);

    renderPanel();

    const card = await screen.findByTestId('element-card-element-1');
    await waitFor(() => {
      expect(screen.getByAltText('Aria').getAttribute('src')).toBe(signedUrlFor('ref-1'));
    });
    const written: Record<string, string> = {};
    fireEvent.dragStart(card, {
      dataTransfer: {
        setData: (type: string, value: string) => {
          written[type] = value;
        },
      },
    });

    expect(parseElementDragPayload(written[ELEMENT_DRAG_TYPE] ?? '')).toEqual({
      elementId: 'element-1',
      name: 'Aria',
      category: 'product',
      previewUrl: signedUrlFor('ref-1'),
    });
  });

  it('opens straight on the create form when initialView asks for it', async () => {
    renderPanel({ initialView: 'create' });

    expect(await screen.findByTestId('element-create-form')).toBeTruthy();
  });

  it('opens the create form and comes back to the list on cancel', async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /New Element/ }));

    expect(await screen.findByTestId('element-create-form')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('No Elements yet')).toBeTruthy();
  });

  it('opens one Element detail from the list', async () => {
    requestMock.mockResolvedValue({ elements: [buildElement()] } as never);

    renderPanel();

    fireEvent.click(await screen.findByTestId('element-card-element-1'));

    expect(await screen.findByTestId('element-detail')).toBeTruthy();
  });

  it('falls back to the list when the open Element is deleted underneath it', async () => {
    requestMock.mockResolvedValue({ elements: [buildElement()] } as never);

    const { queryClient } = renderPanel();
    fireEvent.click(await screen.findByTestId('element-card-element-1'));
    await screen.findByTestId('element-detail');

    requestMock.mockResolvedValue({ elements: [] } as never);
    await act(async () => {
      await queryClient.refetchQueries();
    });

    expect(await screen.findByText('No Elements yet')).toBeTruthy();
  });

  it('surfaces a load failure instead of pretending the brand has no Elements', async () => {
    requestMock.mockRejectedValue(new Error('elements unavailable') as never);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('elements unavailable')).toBeTruthy();
    });
  });
});
