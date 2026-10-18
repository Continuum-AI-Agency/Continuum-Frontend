/**
 * ApplyDesignSystemButton against mocked reads: one tap branches a tagged Brand-aligned variant
 * from the revision on screen with the builder's edits, a retry replays the same intent, and a
 * brand with nothing to apply saves nothing.
 */

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type {
  BrandTypeInputs,
  FontInventoryRow,
  SaveTemplateRevisionRequest,
  TemplateEditableLayer,
  TemplateRevision,
} from '@continuum/contracts';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';
const REVISION = '44444444-4444-4444-8444-444444444444';
const VERSION = '55555555-5555-4555-8555-555555555555';
const SAVED_ASSET = '66666666-6666-4666-8666-666666666666';

let brand: BrandTypeInputs = {};
const headline: TemplateEditableLayer = {
  compId: 1,
  comp: 'Delivery',
  layerId: 2,
  name: 'Headline',
  kind: 'text',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: 'Hello',
  font: 'Sora-Bold',
  fontSize: 96,
  slotKeys: [],
  visibilitySlotKeys: [],
};
const montserrat: FontInventoryRow = {
  id: '77777777-7777-4777-8777-777777777777',
  family: 'Montserrat',
  familyKey: 'montserrat',
  licenceScope: 'brand',
  brandId: BRAND,
  brandName: 'Easy Fit',
  postScriptName: 'Montserrat-Bold',
  winRegistryName: null,
  weight: 700,
  style: 'normal',
  format: 'otf',
  bytes: 1,
  sha256: 'x',
  source: 'upload',
  createdAt: '2026-10-13T00:00:00Z',
};

const shows = mock((_options: { title: string; description?: string; variant?: string }) => {});
let saveFailures = 0;
const saves = mock(async (_assetId: string, _request: SaveTemplateRevisionRequest) => {
  if (saveFailures-- > 0) throw new Error('network');
  return { sourceAssetId: SAVED_ASSET } as TemplateRevision;
});

mock.module('@/lib/brands/brandTypeInputs.client', () => ({
  loadBrandTypeInputs: async () => brand,
  brandTypeInputsQueryKey: (brandId?: string) => ['brand-type-inputs', brandId] as const,
}));
mock.module('@/lib/library/templateSources', () => ({
  editableTemplateFonts: async () => [montserrat],
  fetchTemplateLayerInventory: async () => ({
    compId: 1,
    comps: [],
    layers: [headline],
    warnings: [],
  }),
  saveTemplateRevision: saves,
}));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show: shows }) }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApplyDesignSystemButton } from './ApplyDesignSystemButton';

const revision = {
  id: REVISION,
  sourceAssetId: ASSET,
  sourceVersionId: VERSION,
} as TemplateRevision;

function renderButton(onCreated = mock(async (_saved: TemplateRevision) => {})) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ApplyDesignSystemButton
        brandId={BRAND}
        assetId={ASSET}
        revision={revision}
        designImport={false}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return onCreated;
}

const tap = () => fireEvent.click(screen.getByRole('button', { name: 'Apply my design system' }));

beforeEach(() => {
  brand = {
    brandKit: { typography: { primary: 'Montserrat', secondary: null }, colors: ['#E30613'] },
  };
  saveFailures = 0;
});

afterEach(() => {
  cleanup();
  saves.mockClear();
  shows.mockClear();
});

test('one tap branches a tagged Brand-aligned variant from the revision on screen', async () => {
  const onCreated = renderButton();
  tap();
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  const [assetId, request] = saves.mock.calls[0]!;
  expect(assetId).toBe(ASSET);
  expect(request).toMatchObject({
    brandId: BRAND,
    parentRevisionId: REVISION,
    expectedHeadRevisionId: REVISION,
    name: 'Brand-aligned',
    tags: ['brand_aligned'],
    edits: {
      layers: [{ compId: 1, layerId: 2, font: 'Montserrat-Bold' }],
      recolor: { palette: ['#e30613'] },
    },
  });
  expect(onCreated.mock.calls[0]![0].sourceAssetId).toBe(SAVED_ASSET);
  expect(shows.mock.calls.at(-1)![0]).toMatchObject({ title: 'Brand-aligned variant created' });
});

test('a retry after a failed save replays the same intent', async () => {
  saveFailures = 1;
  const onCreated = renderButton();
  tap();
  await waitFor(() =>
    expect(shows.mock.calls.at(-1)?.[0]).toMatchObject({
      variant: 'error',
      description: 'network',
    }),
  );
  tap();
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(saves.mock.calls[1]![1].idempotencyKey).toBe(saves.mock.calls[0]![1].idempotencyKey);
});

test('a brand with no colours and no held faces saves nothing', async () => {
  brand = {};
  renderButton();
  tap();
  await waitFor(() =>
    expect(shows.mock.calls.at(-1)?.[0]).toMatchObject({ title: 'Nothing to apply' }),
  );
  expect(saves).not.toHaveBeenCalled();
});
