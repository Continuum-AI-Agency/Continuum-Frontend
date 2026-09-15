/**
 * RenderPreviewPanel against a mocked jobs API: a row's effective values are drawn into the
 * selected format's slot boxes, overflow is flagged and clears live, the format select swaps the
 * layout, and "Last render" appears only for a finished job that belongs to this row.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  ApiRenderJob,
  ApiRenderTemplateContract,
  ApiRenderTemplateLayout,
} from '@continuum/contracts';

const listJobsMock = mock(async (..._args: unknown[]) => ({
  items: [] as ApiRenderJob[],
  nextCursor: null,
}));

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listJobs: listJobsMock },
}));

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const job = (rowId: string, url: string, createdAt: string) =>
  ({
    id: crypto.randomUUID(),
    status: 'finished',
    renderSetRowId: rowId,
    outputs: [{ id: 'square', kind: 'image', url, width: 1080, height: 1080 }],
    createdAt,
  }) as unknown as ApiRenderJob;

const slot = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-slot="${key}"]`);

afterEach(() => {
  cleanup();
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

  test('switching the format draws that output layout', () => {
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
    expect(screen.getByRole('option', { name: 'Story · 9:16' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Preview format'), { target: { value: 'story' } });

    expect(slot(container, 'sticker')).not.toBeNull();
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1080 1920');
  });

  test('Last render shows only a finished job for this row', async () => {
    listJobsMock.mockImplementation(async () => ({
      items: [
        job(OTHER_ROW, 'https://cdn.test/other.png', '2026-09-14T12:00:00Z'),
        job(ROW, 'https://cdn.test/old.png', '2026-09-13T10:00:00Z'),
        job(ROW, 'https://cdn.test/mine.png', '2026-09-14T10:00:00Z'),
      ],
      nextCursor: null,
    }));
    render(
      <RenderPreviewPanel
        brandId={BRAND}
        contract={CONTRACT}
        rows={rowWith('Hola')}
        rowId={ROW}
        renderSetId={SET}
      />,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Last render' }));

    expect(screen.getByAltText('Last render').getAttribute('src')).toBe(
      'https://cdn.test/mine.png',
    );
    expect(listJobsMock).toHaveBeenCalledWith(BRAND, 50, { renderSetId: SET });
  });

  test('a job for another row gives no Last render tab', async () => {
    listJobsMock.mockImplementation(async () => ({
      items: [job(OTHER_ROW, 'https://cdn.test/other.png', '2026-09-14T12:00:00Z')],
      nextCursor: null,
    }));
    render(
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

    expect(screen.queryByRole('tab', { name: 'Last render' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Square preview' })).toBeTruthy();
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
