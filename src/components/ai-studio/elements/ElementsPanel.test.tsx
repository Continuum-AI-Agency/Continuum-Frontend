import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({ elements: [] } as unknown));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

// The real Select is a Base UI popup; a native select drives the same `onValueChange`
// (the same stand-in ElementCreateForm.test uses).
mock.module('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      aria-label="Category"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
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
import type { ReactNode } from 'react';
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

    expect(await screen.findByText('Needs sheet')).toBeTruthy();
  });
  it('keeps the canvas accessible while the draggable reference panel is open', async () => {
    render(<button type="button">Canvas drop target</button>);
    renderPanel();
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: 'Canvas drop target' })).toBeTruthy();
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

  it("makes a person's character sheet as soon as they are created", async () => {
    const created = buildElement({
      id: 'new-1',
      category: 'character',
      rightsNote: 'own employee, consent on file',
      members: [{ assetId: 'asset-1', position: 0 }],
    });
    requestMock.mockImplementation((async (options: { path: string; method?: string }) => {
      if (options.method === 'POST' && options.path.endsWith('/new-1/reference'))
        return { element: created, referenceAssetId: 'sheet-1', becameDefault: true };
      if (options.method === 'POST') return { element: created };
      return { elements: [created] };
    }) as never);
    renderPanel({
      initialView: 'create',
      uploadAsset: mock(async () => ({
        assetId: 'asset-1',
        versionId: 'version-1',
        signedUrl: 'https://storage/asset-1.png',
      })),
    });

    fireEvent.change(document.getElementById('element-images') as HTMLInputElement, {
      target: { files: [new File(['x'], 'face.png', { type: 'image/png' })] },
    });
    fireEvent.change(await screen.findByLabelText('Category'), { target: { value: 'character' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Aria' } });
    fireEvent.change(await screen.findByLabelText('Rights basis'), {
      target: { value: 'own employee, consent on file' },
    });
    const submit = screen.getByRole('button', { name: 'Create and make character sheet' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => {
      expect(
        requestMock.mock.calls.some(
          ([options]) =>
            (options as { path: string; method?: string }).method === 'POST' &&
            (options as { path: string }).path.endsWith('/new-1/reference'),
        ),
      ).toBe(true);
    });
    expect(await screen.findByTestId('element-detail')).toBeTruthy();
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
