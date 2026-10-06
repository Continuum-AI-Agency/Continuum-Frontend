import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  SaveTemplateLayerVariantRequest,
  TemplateEditableLayer,
  TemplateLayerInventoryResponse,
  TemplateLayerPreviewRequest,
  TemplateLineage,
} from '@continuum/contracts';

const layer = (over: Partial<TemplateEditableLayer>): TemplateEditableLayer => ({
  compId: 63,
  comp: 'Middle Text line',
  layerId: 1,
  name: 'Layer',
  kind: 'artwork',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: null,
  font: null,
  fontSize: null,
  slotKeys: [],
  visibilitySlotKeys: [],
  index: 0,
  position: [100, 200],
  rotation: 0,
  scale: [100, 100],
  opacity: 100,
  transformLocks: {},
  parentName: null,
  parentId: null,
  ...over,
});
const LAYERS = [
  layer({
    layerId: 114,
    name: 'MENOS',
    text: 'MENOS DE 2.5',
    kind: 'text',
    index: 0,
    fontSize: 50,
  }),
  layer({
    layerId: 71,
    name: 'Red Box',
    index: 1,
    transformLocks: { scale: 'Scale is set by an expression and must be edited in its source.' },
  }),
  layer({
    layerId: 70,
    name: 'White Box',
    index: 2,
    transformLocks: {
      position: 'Position is set by an expression and must be edited in its source.',
    },
  }),
  layer({ layerId: 9, compId: 412, comp: 'Card B', name: 'Card', index: 0 }),
];
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
  '<g data-layer-id="70"><polygon points="0,0 400,0 400,300 0,300"/></g>' +
  '<g data-layer-id="71"><polygon points="10,10 20,10 20,20 10,20"/></g>' +
  '<g data-layer-id="114"><text x="100" y="200">MENOS</text></g></svg>';
const GOLDEN: TemplateLineage = { role: 'golden', parent: null };
let inventory: TemplateLayerInventoryResponse;
const fresh = (
  over: Partial<TemplateLayerInventoryResponse> = {},
): TemplateLayerInventoryResponse => ({
  compId: 63,
  comps: [
    { id: 63, name: 'Middle Text line', orderReason: null },
    {
      id: 412,
      name: 'Card B',
      orderReason:
        'An expression finds layers by their position in this composition, so their order is fixed.',
    },
  ],
  layers: LAYERS,
  warnings: [],
  lineage: GOLDEN,
  designImport: false,
  ...over,
});
inventory = fresh();
let readInventory: () => Promise<TemplateLayerInventoryResponse> = async () => inventory;
const inventories = mock(() => readInventory());
const scenes = mock(async (_b: string, _a: string, _v: string, compId: number | null) => ({
  compId: compId ?? inventory.compId,
  svg: SVG,
  warnings: [],
}));
const previews = mock(async (_assetId: string, request: TemplateLayerPreviewRequest) => {
  const { lineage: _l, designImport: _d, ...view } = inventory;
  return { ...view, compId: request.compId ?? inventory.compId, svg: SVG };
});
const saves = mock(async (_assetId: string, request: SaveTemplateLayerVariantRequest) => ({
  assetId: request.saveTo === 'new_variant' ? '00000000-0000-4000-8000-0000000000c1' : 'a',
  versionId: '00000000-0000-4000-8000-0000000000v2'.replace('v', '0'),
  parseState: 'parsed',
  checksum: 'a'.repeat(64),
}));
const variantList = mock(async () => ({
  lineage: GOLDEN,
  variants: [{ assetId: 'v1', name: 'Bigger labels' }],
}));
const fieldReads = mock(async () => ({ variables: [] }));
const sources = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...sources,
  fetchTemplateLayerInventory: inventories,
  fetchTemplateLayerScene: scenes,
  previewTemplateLayers: previews,
  saveTemplateLayerVariant: saves,
  fetchTemplateLayerVariants: variantList,
  fetchTemplateVariables: fieldReads,
  editableTemplateFonts: async () => [],
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { applyLayerChange, stackOf, TemplateLayerEditor } from './TemplateLayerEditor';

const BRAND = '00000000-0000-4000-8000-000000000001';
const VERSION = '00000000-0000-4000-8000-000000000002';
afterEach(() => {
  cleanup();
  for (const spy of [inventories, scenes, previews, saves, variantList, fieldReads])
    spy.mockClear();
  inventory = fresh();
  readInventory = async () => inventory;
});
const editor = (onOpenVariant = mock((_id: string) => {})) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TemplateLayerEditor
        brandId={BRAND}
        assetId="a"
        versionId={VERSION}
        name="Card B"
        active
        onSaved={async () => {}}
        onOpenVariant={onOpenVariant}
      />
    </QueryClientProvider>,
  );

describe('applyLayerChange', () => {
  test('a value equal to the file drops out, and a layer with nothing left is not edited', () => {
    const [text] = LAYERS;
    const moved = applyLayerChange({}, LAYERS, text!, { position: [120, 200], rotation: 0 });
    expect(moved).toEqual({ 114: { compId: 63, layerId: 114, position: [120, 200] } });
    expect(applyLayerChange(moved, LAYERS, text!, { position: [100, 200] })).toEqual({});
  });
  test('a shared Show field moves every layer it drives', () => {
    const shared = [
      layer({ layerId: 1, visibilitySlotKeys: ['show-logo'] }),
      layer({ layerId: 2, compId: 412, visibilitySlotKeys: ['show-logo'] }),
    ];
    expect(Object.keys(applyLayerChange({}, shared, shared[0]!, { visible: false }))).toEqual([
      '1',
      '2',
    ]);
  });
});

test('stackOf lists a comp front first', () => {
  expect(stackOf([...LAYERS].reverse(), 63)).toEqual([114, 71, 70]);
});

describe('TemplateLayerEditor', () => {
  test('a golden source only forks: Save as variant sends the move and a name', async () => {
    const onOpenVariant = mock((_id: string) => {});
    editor(onOpenVariant);
    await screen.findByText('Golden source');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const x = await screen.findByLabelText('Position X');
    fireEvent.change(x, { target: { value: '140' } });
    fireEvent.blur(x);
    fireEvent.click(screen.getByRole('button', { name: 'Save as variant' }));
    await waitFor(() => expect(saves).toHaveBeenCalledTimes(1));
    const [, request] = saves.mock.calls[0]!;
    expect(request.saveTo).toBe('new_variant');
    expect(request.name).toBe('Card B variant');
    expect(request.edits).toEqual([{ compId: 63, layerId: 114, position: [140, 200] }]);
    await waitFor(() =>
      expect(onOpenVariant).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000c1'),
    );
  });

  test('on a variant, Save writes this variant without a name', async () => {
    inventory = fresh({ lineage: { role: 'variant', parent: { assetId: 'g', name: 'Card B' } } });
    editor();
    await screen.findByText('of Card B');
    const rotation = await screen.findByLabelText('Rotation');
    fireEvent.change(rotation, { target: { value: '15' } });
    fireEvent.blur(rotation);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saves).toHaveBeenCalledTimes(1));
    const [, request] = saves.mock.calls[0]!;
    expect(request.saveTo).toBe('this_variant');
    expect(request.name).toBeUndefined();
    expect(request.edits).toEqual([{ compId: 63, layerId: 114, rotation: 15 }]);
  });

  test('re-stacking a comp previews and saves the whole front-first order', async () => {
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(list).getByRole('button', { name: 'Send MENOS DE 2.5 backward' }));
    await waitFor(
      () =>
        expect(
          previews.mock.calls.some(([, r]) => r.orders.length === 1 && r.orders[0]?.compId === 63),
        ).toBe(true),
      { timeout: 3000 },
    );
    const [, sent] = previews.mock.calls.find(([, r]) => r.orders.length)!;
    expect(sent.orders).toEqual([{ compId: 63, layerIds: [71, 114, 70] }]);
  });

  test('a locked property is shown but cannot be written', async () => {
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(list).getByRole('button', { name: 'White Box' }));
    expect((await screen.findByLabelText('Position X')).hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByText('Position is set by an expression and must be edited in its source.'),
    ).toBeTruthy();
    expect((screen.getByLabelText('Rotation') as HTMLInputElement).disabled).toBe(false);
  });

  test('a comp found by layer position cannot be re-stacked, and says why', async () => {
    inventory = fresh({ compId: 412 });
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    expect(within(list).getAllByRole('listitem').length).toBe(1);
    expect(within(list).queryByRole('button', { name: /Drag|forward|backward/ })).toBeNull();
    expect(screen.getByText(/order is fixed/)).toBeTruthy();
  });

  test('an edit shows in the preview at once, before the forge composes it', async () => {
    const { container } = editor();
    const x = await screen.findByLabelText('Position X');
    await waitFor(() => expect(container.querySelector('[data-layer-id="114"]')).toBeTruthy());
    fireEvent.change(x, { target: { value: '140' } });
    fireEvent.blur(x);
    await waitFor(() =>
      expect(container.querySelector('[data-layer-id="114"]')?.getAttribute('transform')).toContain(
        'translate(140 200)',
      ),
    );
    expect(previews).not.toHaveBeenCalled();
  });

  test('opening the tab asks for the layer list and the scene only; the rest loads when opened', async () => {
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    expect(inventories).toHaveBeenCalledTimes(1);
    expect(scenes).toHaveBeenCalledTimes(1);
    expect(fieldReads).not.toHaveBeenCalled();
    expect(variantList).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Fields each render row asks for/ }));
    await waitFor(() => expect(fieldReads).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Variants of this template/ }));
    expect(await screen.findByRole('button', { name: 'Bigger labels' })).toBeTruthy();
  });

  test('the shell stands in until the layer list lands, and the scene can arrive first', async () => {
    let land: (value: TemplateLayerInventoryResponse) => void = () => {};
    readInventory = () => new Promise((resolve) => (land = resolve));
    const { container } = editor();
    expect(await screen.findByRole('status', { name: 'Reading template layers…' })).toBeTruthy();
    await waitFor(() => expect(container.querySelector('[data-layer-id="114"]')).toBeTruthy());
    expect(
      (screen.getByRole('button', { name: 'Save as variant' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    land(inventory);
    expect(await screen.findByRole('list', { name: 'Layers' })).toBeTruthy();
  });
});
