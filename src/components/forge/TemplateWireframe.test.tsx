/**
 * The wireframe draws each ratio's own boxes: a slot's per-comp instance where one exists (scaled
 * when measured in a comp of another size), the older single placement where it names that comp,
 * and a bare box only where it cannot be some other comp's rectangle. Nothing unmeasured is drawn.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ApiRenderJob, TemplateParse } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

let jobs: ApiRenderJob[] = [];
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listJobs: async () => ({ items: jobs, nextCursor: null }) },
}));

const { TemplateWireframe, useLatestRenderFrame, wireframeFrames } = await import(
  './TemplateWireframe'
);
const { previewFormats } = await import('./FormatPreview');

afterEach(cleanup);

const slot = (key: string, extra: Record<string, unknown>) =>
  ({
    key,
    name: key,
    kind: 'text',
    origin: 'essential',
    driver: 'static',
    comps: [],
    layerIds: [],
    ...extra,
  }) as TemplateParse['slots'][number];

const PARSE = {
  parser: 'py_aep',
  sourceFamily: 'after_effects',
  appVersion: null,
  comps: [],
  ratios: [
    { ratio: '1:1', width: 1080, height: 1080, comps: ['Square'] },
    { ratio: '9:16', width: 1080, height: 1920, comps: ['Story'] },
  ],
  slots: [
    slot('Headline', {
      comps: ['Square', 'Story'],
      instances: [
        { compId: 1, comp: 'Square', layerId: 1, box: [0, 0, 540, 100], compSize: [540, 540] },
        { compId: 2, comp: 'Story', layerId: 1, box: [10, 20, 30, 40], compSize: [1080, 1920] },
      ],
    }),
    slot('Product', {
      kind: 'image',
      comps: ['Story'],
      placement: { comp: 'Story', compSize: [1080, 1920], box: [100, 100, 900, 900] },
    }),
    // Two comps and no per-comp measurement: which one this box belongs to is unknown.
    slot('Price', { comps: ['Square', 'Story'], box: [1, 2, 3, 4] }),
  ],
  fonts: [],
  staticText: [],
  warnings: [],
} as unknown as TemplateParse;

describe('wireframeFrames', () => {
  test('each ratio gets the boxes measured in its own comp', () => {
    const [square, story] = wireframeFrames(PARSE);
    expect(square).toEqual({
      ratio: '1:1',
      width: 1080,
      height: 1080,
      // Measured in a 540 px comp, drawn on the 1080 px frame.
      boxes: [{ key: 'Headline', kind: 'text', box: [0, 0, 1080, 200] }],
    });
    expect(story?.boxes).toEqual([
      { key: 'Headline', kind: 'text', box: [10, 20, 30, 40] },
      { key: 'Product', kind: 'image', box: [100, 100, 900, 900] },
    ]);
  });

  test('a bare box is drawn when there is only one frame it could belong to', () => {
    const single = { ...PARSE, ratios: [PARSE.ratios[0]!] } as TemplateParse;
    expect(wireframeFrames(single)[0]?.boxes.map((entry) => entry.key)).toEqual([
      'Headline',
      'Price',
    ]);
    expect(wireframeFrames(null)).toEqual([]);
  });
});

test('a gallery wireframe renders its compact parse without requesting render history', () => {
  render(
    <TemplateWireframe
      brandId="22222222-2222-4222-8222-222222222222"
      templateKey="47"
      parse={PARSE}
    />,
  );

  expect(screen.getByRole('img', { name: '1:1 layout' })).toBeTruthy();
});

test('the latest frame is the picked format’s file, never whichever file the fleet listed first', async () => {
  const file = (fileName: string) => ({
    id: fileName,
    kind: 'image' as const,
    fileName,
    mimeType: 'image/jpeg',
    url: `https://cdn.test/${fileName}`,
    width: null,
    height: null,
    assetId: null,
    versionId: null,
  });
  jobs = [
    {
      templateKey: '47',
      status: 'finished',
      outputs: [
        file('Producto_individual_con_descuento_9_16_ooqxxwb.jpg'),
        file('Producto_individual_con_descuento_1_1_1mjxxwb.jpg'),
        file('Producto_individual_con_descuento_16_9_9w5xxwa.jpg'),
      ],
    } as ApiRenderJob,
  ];
  const formats = previewFormats({ ratios: ['16:9', '1:1', '9:16'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const first = renderHook(() => useLatestRenderFrame('brand', '47', formats), { wrapper });
  await waitFor(() =>
    expect(first.result.current?.fileName).toBe(
      'Producto_individual_con_descuento_16_9_9w5xxwa.jpg',
    ),
  );
  const square = renderHook(() => useLatestRenderFrame('brand', '47', formats, '1:1'), { wrapper });
  await waitFor(() =>
    expect(square.result.current?.fileName).toBe(
      'Producto_individual_con_descuento_1_1_1mjxxwb.jpg',
    ),
  );
  const none = renderHook(() => useLatestRenderFrame('brand', '47'), { wrapper });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(none.result.current).toBeNull();
});
