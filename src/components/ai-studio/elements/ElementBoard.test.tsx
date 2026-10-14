import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock((_options: RequestOptions) => Promise.resolve({} as unknown));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

// The real Select is a Base UI popup; a native select drives the same `onValueChange`
// (the stand-in ElementCreateForm.test and ElementsPanel.test use).
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
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
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

import type { ElementRecord, Skill } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';
import { ElementBoard } from './ElementBoard';

type RequestOptions = { path: string; method?: string; body?: unknown };

configure({ asyncUtilTimeout: 4000 });

const MEMBER_1 = '00000000-0000-4000-8000-000000000001';
const MEMBER_2 = '00000000-0000-4000-8000-000000000002';

const buildElement = (overrides: Partial<ElementRecord> = {}): ElementRecord => ({
  id: 'element-1',
  brandId: 'brand-1',
  name: 'Aero Bottle',
  slug: 'aero-bottle',
  category: 'product',
  guidelines: null,
  rightsNote: null,
  members: [
    { assetId: MEMBER_2, position: 1 },
    { assetId: MEMBER_1, position: 0, role: 'front' },
  ],
  referenceHistory: [],
  defaultReferenceAssetId: null,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

const skill = (slug: string): Skill => ({
  id: `id-${slug}`,
  brandId: 'brand-1',
  isTemplate: false,
  name: `Name ${slug}`,
  slug,
  description: null,
  kind: 'creative_direction',
  surface: 'visual',
  directives: 'Do it.',
  tags: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const BRAND_ELEMENTS = [
  buildElement(),
  buildElement({ id: 'mood-1', name: 'Coastal Mood', slug: 'coastal-mood', category: 'moodboard' }),
  buildElement({ id: 'studio-1', name: 'White Studio', slug: 'white-studio', category: 'setting' }),
  buildElement({ id: 'model-1', name: 'Nova', slug: 'nova', category: 'model' }),
];

const respond = (options: RequestOptions): unknown => {
  if (options.path.startsWith('/api/organic/skills')) {
    return { skills: [skill('film-grain'), skill('golden-hour')] };
  }
  if (options.method === 'PATCH') return { element: buildElement() };
  return { elements: BRAND_ELEMENTS };
};

const fetchMock = mock((_url: string, init?: { body?: string }) => {
  const { assetId } = JSON.parse(init?.body ?? '{}') as { assetId: string };
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ signedUrl: `https://storage/${assetId}.png` }),
  });
});

const renderBoard = (element: ElementRecord = buildElement()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ElementBoard element={element} brandId="brand-1" />
    </QueryClientProvider>,
  );
};

const typeStyle = (text: string) => {
  const textarea = screen.getByLabelText('Styles') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  textarea.setSelectionRange(text.length, text.length);
  fireEvent.select(textarea);
  return textarea;
};

const patchCall = () =>
  requestMock.mock.calls.map(([options]) => options).find((options) => options.method === 'PATCH');

describe('ElementBoard', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation((options) => Promise.resolve(respond(options)));
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as never;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it('shows each member in position order with its stored role', async () => {
    renderBoard();

    expect(await screen.findByAltText('Source 1')).toBeTruthy();
    expect((await screen.findByAltText('Source 1')).getAttribute('src')).toBe(
      `https://storage/${MEMBER_1}.png`,
    );
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects.map((select) => select.value)).toEqual(['front', 'none']);
  });

  it('offers only same-brand board Elements, never itself', async () => {
    renderBoard();

    expect(await screen.findByRole('button', { name: /Coastal Mood/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /White Studio/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nova/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Aero Bottle/ })).toBeNull();
  });

  it('saves roles, linked boards and styles as one replacing PATCH', async () => {
    renderBoard();

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0] as HTMLSelectElement, { target: { value: 'none' } });
    fireEvent.change(selects[1] as HTMLSelectElement, { target: { value: 'label' } });
    fireEvent.click(await screen.findByRole('button', { name: /Coastal Mood/ }));

    const textarea = typeStyle('/film');
    await screen.findByText('/film-grain');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Remove /film-grain' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save board' }));

    await waitFor(() => expect(patchCall()).toBeTruthy());
    expect(patchCall()).toMatchObject({
      path: '/api/media/elements/element-1',
      body: {
        brandId: 'brand-1',
        memberRoles: { [MEMBER_2]: 'label' },
        styleSlugs: ['film-grain'],
        boardElementIds: ['mood-1'],
        expectedUpdatedAt: '2026-08-24T00:00:00.000Z',
      },
    });
    expect(await screen.findByText('Board saved.')).toBeTruthy();
  });

  it('removes a linked board and a style, and saves the cleared lists', async () => {
    renderBoard(buildElement({ boardElementIds: ['mood-1'], styleSlugs: ['golden-hour'] }));

    fireEvent.click(await screen.findByRole('button', { name: 'Unlink Coastal Mood' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove /golden-hour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save board' }));

    await waitFor(() => expect(patchCall()).toBeTruthy());
    expect(patchCall()?.body).toMatchObject({ styleSlugs: [], boardElementIds: [] });
  });

  it('refuses a brand-book switch as an Element style', async () => {
    renderBoard();

    const textarea = typeStyle('/nobr');
    await screen.findByText('/nobrand');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(await screen.findByText('/nobrand is not one of this brand’s styles.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove /nobrand' })).toBeNull();
  });

  it('says what a 422 style conflict means, with the Backend’s own message', async () => {
    requestMock.mockImplementation((options) =>
      options.method === 'PATCH'
        ? Promise.reject(
            new ApiError('/noir conflicts with /golden-hour', 422, 'element_style_conflict'),
          )
        : Promise.resolve(respond(options)),
    );
    renderBoard(buildElement({ styleSlugs: ['golden-hour'] }));

    fireEvent.click(screen.getByRole('button', { name: 'Save board' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Two of these styles contradict each other');
    expect(alert.textContent).toContain('/noir conflicts with /golden-hour');
  });
});
