/**
 * RenderPreviewPanel against a mocked jobs API: a row's effective values are drawn into the picked
 * format's slot boxes, overflow is flagged and clears live, the format chips swap the layout, and
 * the row's last render shows THAT format's file — found by name, never by position — read once per
 * row and re-read when realtime says one of that row's jobs finished.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  ApiRenderJob,
  ApiRenderTemplateContract,
  ApiRenderTemplateLayout,
} from '@continuum/contracts';
import type { PostgresChangesSubscription } from '@/lib/supabase/realtime';

const listJobsMock = mock(async (..._args: unknown[]) => ({
  items: [] as ApiRenderJob[],
  nextCursor: null,
}));
let setRevision = 3;

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listJobs: listJobsMock,
    listRenderSets: async () => ({
      items: [{ id: '33333333-3333-4333-8333-333333333333', revision: setRevision }],
      nextCursor: null,
    }),
  },
}));

let subscription: PostgresChangesSubscription | null = null;
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: (options: PostgresChangesSubscription) => {
    subscription = options;
    return () => undefined;
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render as renderInDom,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { RenderPreviewPanel } from './RenderPreviewPanel';
import type { RequestRow } from './renderRequestRows';

const BRAND = '22222222-2222-4222-8222-222222222222';
const SET = '33333333-3333-4333-8333-333333333333';
const ROW = '55555555-5555-4555-8555-555555555555';
const OTHER_ROW = '66666666-6666-4666-8666-666666666666';
const HERO_URL = 'https://cdn.test/hero.png';

const variable = (
  key: string,
  label: string,
  kind: string,
  extra: Record<string, unknown> = {},
) => ({
  key,
  label,
  kind,
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  role: null,
  roleSource: null,
  charBudget: null,
  comps: [],
  sample: null,
  placement: null,
  ...extra,
});

const box = (key: string, label: string, coords: [number, number, number, number]) => ({
  key,
  label,
  box: coords,
  role: null,
  kind: null,
});

const SQUARE: ApiRenderTemplateLayout = {
  comp: { name: 'Square', width: 1080, height: 1080 },
  boxes: [
    box('bg', 'Background', [0, 0, 1080, 1080]),
    box('headline', 'Headline', [60, 60, 1020, 260]),
    box('hero', 'Hero', [240, 300, 840, 900]),
    box('logo', 'Logo', [60, 940, 260, 1040]),
  ],
};

const STORY: ApiRenderTemplateLayout = {
  comp: { name: 'Story', width: 1080, height: 1920 },
  boxes: [
    box('bg', 'Background', [0, 0, 1080, 1920]),
    box('headline', 'Headline', [60, 200, 1020, 500]),
    box('hero', 'Hero', [140, 600, 940, 1400]),
    box('sticker', 'Sticker', [700, 1500, 1020, 1800]),
    box('logo', 'Logo', [60, 1780, 260, 1880]),
  ],
};

const CONTRACT = {
  template: { key: '133', name: 'forge_bench_starcraft', contractHash: 'hash' },
  variables: [
    variable('headline', 'Headline', 'text', { charBudget: 10, sample: 'Hola' }),
    variable('hero', 'Hero', 'image'),
    variable('bg', 'Background', 'color'),
    variable('logo', 'Logo', 'image', { reserved: true }),
  ],
  fonts: [],
  layout: SQUARE,
  divergence: [],
  outputs: [
    { id: 'square', label: 'Square', ratio: '1:1', layout: SQUARE },
    { id: 'story', label: 'Story', ratio: '9:16', layout: STORY },
  ],
} as unknown as ApiRenderTemplateContract;

const rowWith = (headline: string): RequestRow[] => [
  {
    id: ROW,
    parentId: null,
    label: 'Spain',
    values: {
      headline,
      hero: { assetId: '77777777-7777-4777-8777-777777777777' },
      bg: 'ff3366',
    },
    clearedKeys: [],
    outputIds: [],
    media: { hero: { w: 800, h: 800, thumbnailUrl: HERO_URL } },
    check: { state: 'idle' },
  },
];

const file = (fileName: string, url = `https://cdn.test/${fileName}`) => ({
  id: `hash-${fileName}`,
  kind: 'image',
  fileName,
  mimeType: 'image/png',
  url,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});

const job = (
  rowId: string,
  outputs: ReturnType<typeof file>[],
  extra: Partial<ApiRenderJob> = {},
) =>
  ({
    id: crypto.randomUUID(),
    status: 'finished',
    renderSetRowId: rowId,
    renderSetRevision: 3,
    outputs,
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    ...extra,
  }) as unknown as ApiRenderJob;

/** Renders inside a fresh query cache, as the grid mounts it; rerender keeps the same cache. */
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (next: ReactElement) => (
    <QueryClientProvider client={client}>{next}</QueryClientProvider>
  );
  const view = renderInDom(wrap(ui));
  return { ...view, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
}

const slot = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-slot="${key}"]`);
const frame = (container: HTMLElement) =>
  container.querySelector('[data-slot="format-preview-frame"]') as HTMLElement;
const badge = (container: HTMLElement) =>
  container.querySelector('[data-slot="format-preview-badge"]')?.textContent;

afterEach(() => {
  cleanup();
  subscription = null;
  setRevision = 3;
  listJobsMock.mockReset();
  listJobsMock.mockImplementation(async () => ({ items: [], nextCursor: null }));
});

describe('RenderPreviewPanel', () => {
  test('draws text in its box and flags overflow live from props', () => {
    const props = { brandId: BRAND, contract: CONTRACT, rowId: ROW, renderSetId: null };
    const { container, rerender } = render(
      <RenderPreviewPanel {...props} rows={rowWith('Una oferta enorme hoy')} />,
    );

    expect(slot(container, 'headline')?.textContent).toContain('Una oferta');
    expect(slot(container, 'headline')?.getAttribute('data-overflow')).toBe('true');
    expect(screen.getByText('Headline overflows its box (21/10 characters)')).toBeTruthy();

    rerender(<RenderPreviewPanel {...props} rows={rowWith('Hola')} />);

    expect(slot(container, 'headline')?.textContent).toContain('Hola');
    expect(slot(container, 'headline')?.getAttribute('data-overflow')).toBeNull();
    expect(screen.queryByText(/overflows its box/)).toBeNull();
    expect(slot(container, 'logo')?.textContent).toContain('Continuum fills this');
  });

  test('draws the image thumbnail and fills the colour', () => {
    const { container } = render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={null}
      />,
    );

    const image = slot(container, 'hero')?.querySelector('image');
    expect(image?.getAttribute('href')).toBe(HERO_URL);
    expect(image?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(slot(container, 'bg')?.querySelector('rect')?.getAttribute('fill')).toBe('#ff3366');
    expect(slot(container, 'bg')?.textContent).toContain('#ff3366');
  });

  test('a format chip draws that output’s layout in a frame of its shape', () => {
    const { container } = render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={null}
      />,
    );
    expect(slot(container, 'sticker')).toBeNull();
    expect(frame(container).style.aspectRatio).toBe('1080 / 1080');
    expect(badge(container)).toBe('Estimate · wireframe');

    fireEvent.click(screen.getByRole('button', { name: 'Story' }));

    expect(slot(container, 'sticker')).not.toBeNull();
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1080 1920');
    expect(frame(container).style.aspectRatio).toBe('1080 / 1920');
  });

  test('the row’s last render shows the picked format’s file, whatever order the job listed them', async () => {
    // Template 133: no contract outputs, formats from the ratios, files in the fleet's order.
    const contract = {
      ...CONTRACT,
      template: { ...CONTRACT.template, ratios: ['16:9', '1:1', '9:16'] },
      outputs: [],
    } as unknown as ApiRenderTemplateContract;
    listJobsMock.mockImplementation(async () => ({
      items: [
        job(ROW, [
          file('Producto_individual_con_descuento_9_16_ooqxxwb.jpg'),
          file('Producto_individual_con_descuento_1_1_1mjxxwb.jpg'),
          file('Producto_individual_con_descuento_16_9_9w5xxwa.jpg'),
        ]),
      ],
      nextCursor: null,
    }));
    const { container } = render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={contract}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={SET}
      />,
    );

    // The first format in contract order, never the first file.
    expect((await screen.findByAltText('Last render')).getAttribute('src')).toBe(
      'https://cdn.test/Producto_individual_con_descuento_16_9_9w5xxwa.jpg',
    );
    fireEvent.click(screen.getByRole('button', { name: '1:1' }));
    expect(screen.getByAltText('Last render').getAttribute('src')).toBe(
      'https://cdn.test/Producto_individual_con_descuento_1_1_1mjxxwb.jpg',
    );
    expect(frame(container).style.aspectRatio).toBe('1 / 1');
    await waitFor(() => expect(badge(container)).toBe('Rendered · 2h ago'));
    expect(listJobsMock).toHaveBeenCalledTimes(1);
    expect(listJobsMock).toHaveBeenCalledWith(BRAND, 1, {
      renderSetId: SET,
      renderSetRowId: ROW,
      status: 'finished',
    });
  });

  test('a format no file answers shows the estimate, never another format’s file', async () => {
    listJobsMock.mockImplementation(async () => ({
      items: [job(ROW, [file('Story_ooqxxwb.png')])],
      nextCursor: null,
    }));
    const { container } = render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={SET}
      />,
    );
    await waitFor(() => expect(listJobsMock).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.queryByAltText('Last render')).toBeNull();
    expect(badge(container)).toBe('Estimate · wireframe');
    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    expect(screen.getByAltText('Last render').getAttribute('src')).toBe(
      'https://cdn.test/Story_ooqxxwb.png',
    );
  });

  test('a render of an older set revision says it predates the latest edits', async () => {
    setRevision = 4;
    listJobsMock.mockImplementation(async () => ({
      items: [job(ROW, [file('Square_1mjxxwb.png')], { renderSetRevision: 3 })],
      nextCursor: null,
    }));
    const { container } = render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={SET}
      />,
    );

    await waitFor(() => expect(badge(container)).toBe('Rendered · before latest edits'));
    fireEvent.click(screen.getByRole('button', { name: 'Estimate' }));
    expect(badge(container)).toBe('Estimate · wireframe');
  });

  test('the picked format stays picked when another row is selected', async () => {
    const OTHER: RequestRow = { ...(rowWith('Adiós')[0] as RequestRow), id: OTHER_ROW };
    const rows = [...rowWith('Hola'), OTHER];
    const props = { brandId: BRAND, contract: CONTRACT, rows, renderSetId: SET };
    const { container, rerender } = render(<RenderPreviewPanel {...props} rowId={ROW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Story' }));

    rerender(<RenderPreviewPanel {...props} rowId={OTHER_ROW} />);

    expect(screen.getByRole('button', { name: 'Story' }).getAttribute('aria-pressed')).toBe('true');
    expect(frame(container).style.aspectRatio).toBe('1080 / 1920');
  });

  test('a fork previews what it inherits, minus what it cleared', () => {
    const [root] = rowWith('Hola');
    const FORK = '88888888-8888-4888-8888-888888888888';
    const rows: RequestRow[] = [
      root as RequestRow,
      {
        ...(root as RequestRow),
        id: FORK,
        parentId: ROW,
        values: {},
        clearedKeys: ['bg'],
        media: {},
      },
    ];
    const { container } = render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rows}
        rowId={FORK}
        renderSetId={null}
      />,
    );

    expect(slot(container, 'headline')?.textContent).toContain('Hola');
    expect(slot(container, 'hero')?.querySelector('image')?.getAttribute('href')).toBe(HERO_URL);
    // The cleared colour is a gap again: dashed outline and its name, no fill.
    expect(slot(container, 'bg')?.querySelector('rect[stroke-dasharray]')).not.toBeNull();
    expect(slot(container, 'bg')?.querySelector('text')?.textContent).toBe('Background');
    expect(slot(container, 'bg')?.querySelector('[fill="#ff3366"]')).toBeNull();
  });

  test('an output without its own layout never borrows another ratio', () => {
    const contract = {
      ...CONTRACT,
      outputs: [
        { id: 'story', label: 'Story', ratio: '9:16', layout: null },
        { id: 'square', label: 'Square', ratio: '1:1', layout: null },
      ],
    } as unknown as ApiRenderTemplateContract;
    const { container } = render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={contract}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={null}
      />,
    );

    expect(screen.getByText('No measured layout for this format')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(frame(container).style.aspectRatio).toBe('9 / 16');

    fireEvent.click(screen.getByRole('button', { name: 'Square' }));

    expect(screen.getByRole('img', { name: 'Square preview' })).toBeTruthy();
    expect(screen.queryByText('No measured layout for this format')).toBeNull();
  });

  test('a job of this row finishing re-reads the last render', async () => {
    render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={SET}
      />,
    );
    await waitFor(() => expect(listJobsMock).toHaveBeenCalledTimes(1));

    listJobsMock.mockImplementation(async () => ({
      items: [job(ROW, [file('Square_fresh.png', 'https://cdn.test/fresh.png')])],
      nextCursor: null,
    }));
    act(() => {
      subscription?.bindings[1]?.onRow({ render_set_row_id: ROW, status: 'finished' }, {} as never);
    });

    expect((await screen.findByAltText('Last render')).getAttribute('src')).toBe(
      'https://cdn.test/fresh.png',
    );
  });

  test('no selected row shows the hint', () => {
    render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rowWith('Hola')}
        rowId={null}
        renderSetId={SET}
      />,
    );

    expect(screen.getByText('Select a row to preview it')).toBeTruthy();
    expect(listJobsMock).not.toHaveBeenCalled();
  });
});
