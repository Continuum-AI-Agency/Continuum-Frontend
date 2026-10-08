import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  type SaveTemplateRevisionRequest,
  type TemplateEditableLayer,
  type TemplateLayerEdit,
  type TemplateLayerInventory,
  type TemplateLayerPreviewResponse,
  type TemplateRevision,
  type TemplateRevisionPreviewRequest,
  type TemplateRevisionVariant,
  templateSourceSummarySchema,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import * as templateSources from '@/lib/library/templateSources';
import { applyLayerChange, stackOf, TemplateLayerEditor } from './TemplateLayerEditor';
import { TemplateLayerInspector } from './TemplateLayerInspector';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';
const VERSION = '66666666-6666-4666-8666-666666666666';
const ORIGINAL_REVISION = '77777777-7777-4777-8777-777777777777';
const VARIANT_REVISION = '88888888-8888-4888-8888-888888888888';
const SAVED_ASSET = '99999999-9999-4999-8999-999999999999';

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
  x: 100,
  y: 200,
  width: null,
  height: null,
  geometryReason: 'Only text geometry is editable here.',
  index: 0,
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
    font: 'ClientFont-Regular',
    fontSize: 50,
    width: 300,
    height: 80,
    geometryReason: null,
    index: 0,
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

const revisionOf = (id: string, variantId: string, number: number): TemplateRevision => ({
  templateId: ASSET,
  variantId,
  id,
  number,
  parentRevisionId: null,
  sourceAssetId: ASSET,
  sourceVersionId: VERSION,
  checksum: 'a'.repeat(64),
  edits: { layers: [], slots: [], orders: [] },
  source: templateSourceSummarySchema.parse({
    assetId: ASSET,
    brandId: BRAND,
    versionId: VERSION,
    family: 'after_effects_package',
    parseState: 'parsed',
    createdAt: '2026-10-06T00:00:00Z',
  }),
  publications: [],
  createdAt: '2026-10-06T00:00:00Z',
  createdBy: null,
  nativeCommitId: null,
  dependencies: null,
});
const ORIGINAL: TemplateRevisionVariant = {
  templateId: ASSET,
  variantId: ASSET,
  name: 'Original',
  original: true,
  parentRevisionId: null,
  draftHeadRevisionId: ORIGINAL_REVISION,
  publishedHeadRevisionId: null,
  archivedAt: null,
  sourceKind: 'after_effects',
  revisions: [revisionOf(ORIGINAL_REVISION, ASSET, 1)],
};
const VARIANT: TemplateRevisionVariant = {
  ...ORIGINAL,
  variantId: '44444444-4444-4444-8444-444444444444',
  name: 'Bigger labels',
  original: false,
  parentRevisionId: ORIGINAL_REVISION,
  draftHeadRevisionId: VARIANT_REVISION,
  revisions: [revisionOf(VARIANT_REVISION, '44444444-4444-4444-8444-444444444444', 2)],
};

let catalog: TemplateRevisionVariant[];
let inventory: TemplateLayerInventory;
let readInventory: () => Promise<TemplateLayerInventory>;
let sceneSvg: string;
const fresh = (over: Partial<TemplateLayerInventory> = {}): TemplateLayerInventory => ({
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
  ...over,
});
type Spy = { mockRestore: () => void; mock: { calls: unknown[][] } };
let spies: Record<string, Spy>;
const callsOf = <T,>(name: string) => (spies[name]?.mock.calls ?? []) as T[];

beforeEach(() => {
  catalog = [ORIGINAL];
  inventory = fresh();
  readInventory = async () => inventory;
  sceneSvg = SVG;
  spies = {
    catalog: spyOn(templateSources, 'fetchTemplateRevisionVariants').mockImplementation(
      async () => catalog,
    ),
    inventory: spyOn(templateSources, 'fetchTemplateLayerInventory').mockImplementation(() =>
      readInventory(),
    ),
    scene: spyOn(templateSources, 'fetchTemplateLayerScene').mockImplementation(
      async (_b, _a, _v, compId) => ({
        compId: compId ?? inventory.compId,
        svg: sceneSvg,
        warnings: [],
      }),
    ),
    preview: spyOn(templateSources, 'previewTemplateRevision').mockImplementation(
      async (_assetId, request): Promise<TemplateLayerPreviewResponse> => ({
        ...inventory,
        compId: request.compId ?? inventory.compId,
        svg: SVG,
      }),
    ),
    save: spyOn(templateSources, 'saveTemplateRevision').mockImplementation(async () => ({
      ...revisionOf('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', VARIANT.variantId, 3),
      sourceAssetId: SAVED_ASSET,
    })),
    fields: spyOn(templateSources, 'fetchTemplateVariables').mockImplementation(
      async () =>
        ({ variables: [], edits: [] }) as unknown as Awaited<
          ReturnType<typeof templateSources.fetchTemplateVariables>
        >,
    ),
    fonts: spyOn(templateSources, 'editableTemplateFonts').mockImplementation(async () => []),
  };
});
afterEach(() => {
  cleanup();
  for (const spy of Object.values(spies)) spy.mockRestore();
});

const editor = (
  props: Partial<Parameters<typeof TemplateLayerEditor>[0]> = {},
  onOpenVariant: (id: string) => void = () => {},
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TemplateLayerEditor
        brandId={BRAND}
        assetId={ASSET}
        versionId={VERSION}
        name="Card B"
        active
        onSaved={async () => {}}
        onOpenVariant={onOpenVariant}
        {...props}
      />
    </QueryClientProvider>,
  );
const commit = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

describe('TemplateLayerInspector', () => {
  const [text] = LAYERS as [TemplateEditableLayer];
  function Inspector({ over = {} }: { over?: Partial<TemplateEditableLayer> }) {
    const [edit, setEdit] = useState<TemplateLayerEdit>({ compId: 63, layerId: 114 });
    const [inputs, setInputs] = useState<Record<string, string>>({});
    const [invalid, setInvalid] = useState<string[]>([]);
    return (
      <>
        <TemplateLayerInspector
          layer={{ ...text, ...over }}
          edit={edit}
          fonts={[]}
          disabled={false}
          inputValues={inputs}
          invalidFields={invalid}
          onInputValue={(field, value) => setInputs((current) => ({ ...current, [field]: value }))}
          onValidity={setInvalid}
          onEdit={(change) => setEdit((current) => ({ ...current, ...change }))}
        />
        <button type="button" disabled={invalid.length > 0}>
          Save
        </button>
        <output>{JSON.stringify(edit)}</output>
      </>
    );
  }

  test('point text moves by x/y while a box it cannot resize stays disabled', () => {
    render(<Inspector over={{ width: null, height: null }} />);
    expect(screen.getByLabelText('Position X').hasAttribute('disabled')).toBe(false);
    expect(screen.getByLabelText('width').hasAttribute('disabled')).toBe(true);
    commit('Position X', '17');
    expect(screen.getByRole('status').textContent).toContain('"x":17');
  });

  test('blank geometry remains invalid when another field changes', () => {
    render(<Inspector />);
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Text size (pt)'), { target: { value: '24' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect((screen.getByLabelText('width') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '10' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('"fontSize":24');
    expect(screen.getByRole('status').textContent).toContain('"width":10');
  });

  test('a position lock disables x/y and says why; a geometry reason locks only the text box', () => {
    const reason = 'Position is keyframed, so it must be edited in After Effects.';
    render(<Inspector over={{ transformLocks: { position: reason } }} />);
    expect(screen.getByLabelText('Position X').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Position Y').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('width').hasAttribute('disabled')).toBe(false);
    expect(screen.getByText(reason)).toBeTruthy();
    cleanup();
    render(<Inspector over={{ geometryReason: 'This text box is animated.' }} />);
    expect(screen.getByLabelText('Position X').hasAttribute('disabled')).toBe(false);
    expect(screen.getByLabelText('width').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('height').hasAttribute('disabled')).toBe(true);
  });
});

describe('applyLayerChange', () => {
  test('a value equal to the file drops out, and a layer with nothing left is not edited', () => {
    const [text] = LAYERS as [TemplateEditableLayer];
    const moved = applyLayerChange({}, LAYERS, text, { x: 120, rotation: 0 });
    expect(moved).toEqual({ '63:114': { compId: 63, layerId: 114, x: 120 } });
    expect(applyLayerChange(moved, LAYERS, text, { x: 100 })).toEqual({});
  });
  test('a shared Show field moves every layer it drives', () => {
    const shared = [
      layer({ layerId: 1, visibilitySlotKeys: ['show-logo'] }),
      layer({ layerId: 2, compId: 412, visibilitySlotKeys: ['show-logo'] }),
    ];
    expect(
      Object.keys(
        applyLayerChange({}, shared, shared[0] as TemplateEditableLayer, { visible: false }),
      ),
    ).toEqual(['63:1', '412:2']);
  });
});

test('stackOf lists a comp front first', () => {
  expect(stackOf([...LAYERS].reverse(), 63)).toEqual([114, 71, 70]);
});

describe('TemplateLayerEditor', () => {
  test('the Original only branches: Save as new variant sends the move, a name and its head', async () => {
    const opened: string[] = [];
    editor({}, (id) => opened.push(id));
    await screen.findByText('Original');
    await screen.findByRole('list', { name: 'Layers' });
    expect(screen.queryByRole('button', { name: 'Save revision' })).toBeNull();
    commit('Position X', '140');
    fireEvent.click(screen.getByRole('button', { name: 'Save as new variant' }));
    await waitFor(() => expect(callsOf(`save`).length).toBe(1));
    const [, request] = callsOf<[string, SaveTemplateRevisionRequest]>('save')[0]!;
    expect(request.parentRevisionId).toBe(ORIGINAL_REVISION);
    expect(request.expectedHeadRevisionId).toBe(ORIGINAL_REVISION);
    expect(request.name).toBe('Card B variant');
    expect(request.variantId).toBeUndefined();
    expect(request.edits.layers).toEqual([{ compId: 63, layerId: 114, x: 140 }]);
    expect(request.edits.orders).toEqual([]);
    await waitFor(() => expect(opened).toEqual([SAVED_ASSET]));
  });

  test('on a variant at its head, Save revision writes that variant without a name', async () => {
    catalog = [VARIANT];
    editor();
    await screen.findByText('Variant');
    await screen.findByRole('list', { name: 'Layers' });
    commit('Rotation', '15');
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    await waitFor(() => expect(callsOf('save').length).toBe(1));
    const [, request] = callsOf<[string, SaveTemplateRevisionRequest]>('save')[0]!;
    expect(request.variantId).toBe(VARIANT.variantId);
    expect(request.expectedHeadRevisionId).toBe(VARIANT_REVISION);
    expect(request.name).toBeUndefined();
    expect(request.edits.layers).toEqual([{ compId: 63, layerId: 114, rotation: 15 }]);
  });

  test('re-stacking a comp previews and saves the whole front-first order', async () => {
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(list).getByRole('button', { name: 'Send MENOS DE 2.5 backward' }));
    await waitFor(
      () =>
        expect(
          callsOf<[string, TemplateRevisionPreviewRequest]>('preview').some(
            ([, r]) => r.edits.orders.length === 1,
          ),
        ).toBe(true),
      { timeout: 3000 },
    );
    const [, sent] = callsOf<[string, TemplateRevisionPreviewRequest]>('preview').find(
      ([, r]) => r.edits.orders.length,
    )!;
    expect(sent.parentRevisionId).toBe(ORIGINAL_REVISION);
    expect(sent.edits.orders).toEqual([{ compId: 63, layerIds: [71, 114, 70] }]);
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save as new variant' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save as new variant' }));
    await waitFor(() => expect(callsOf('save').length).toBe(1));
    const [, saved] = callsOf<[string, SaveTemplateRevisionRequest]>('save')[0]!;
    expect(saved.edits.orders).toEqual([{ compId: 63, layerIds: [71, 114, 70] }]);
  });

  test('a locked property is shown but cannot be written, and says why', async () => {
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

  test('an edit shows in the inline preview at once, before the forge composes it', async () => {
    const { container } = editor();
    await screen.findByRole('list', { name: 'Layers' });
    await waitFor(() => expect(container.querySelector('[data-layer-id="114"]')).toBeTruthy());
    commit('Position X', '140');
    await waitFor(() =>
      expect(container.querySelector('[data-layer-id="114"]')?.getAttribute('transform')).toContain(
        'translate(140 200)',
      ),
    );
    expect(callsOf('preview').length).toBe(0);
  });

  test('the inline preview is the allowlist rebuild, never the raw forge SVG', async () => {
    sceneSvg = SVG.replace(
      '<g data-layer-id="70">',
      '<script>window.injected=1</script><g data-layer-id="70" onclick="alert(1)">',
    );
    const { container } = editor();
    await waitFor(() => expect(container.querySelector('[data-layer-id="70"]')).toBeTruthy());
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
  });

  test('a scene the rebuild refuses falls back to an image', async () => {
    sceneSvg = '<html><body>not an svg</body></html>';
    editor();
    const image = (await screen.findByRole('img', {
      name: 'Layout preview of template edits',
    })) as HTMLImageElement;
    expect(image.tagName).toBe('IMG');
    expect(image.src.startsWith('data:image/svg+xml')).toBe(true);
  });

  test('opening the tab asks for the layer list and the scene only; fields load when opened', async () => {
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    expect(callsOf('inventory').length).toBe(1);
    expect(callsOf('scene').length).toBe(1);
    expect(callsOf('fields').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /Template defaults and render fields/ }));
    await waitFor(() => expect(callsOf('fields').length).toBe(1));
  });

  test('the shell stands in until the layer list lands, and the scene can arrive first', async () => {
    let land: (value: TemplateLayerInventory) => void = () => {};
    readInventory = () => new Promise((resolve) => (land = resolve));
    const { container } = editor();
    expect(await screen.findByRole('status', { name: 'Reading template layers…' })).toBeTruthy();
    await waitFor(() => expect(container.querySelector('[data-layer-id="114"]')).toBeTruthy());
    expect(
      (screen.getByRole('button', { name: 'Save as new variant' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    land(inventory);
    expect(await screen.findByRole('list', { name: 'Layers' })).toBeTruthy();
  });

  test('an output row’s Edit opens the editor on that composition, not the template’s first', async () => {
    const headline = (compId: number, comp: string, layerId: number) =>
      layer({
        compId,
        comp,
        layerId,
        kind: 'text',
        name: `${comp} headline`,
        text: `${comp} headline`,
      });
    inventory = {
      compId: 3,
      comps: [
        { id: 3, name: 'Main 1x1' },
        { id: 9, name: 'Story 9x16' },
      ],
      layers: [headline(3, 'Main 1x1', 1), headline(9, 'Story 9x16', 2)],
      warnings: [],
    };
    editor({ initialComp: 'Story 9x16' });
    const list = await screen.findByRole('list', { name: 'Layers' });
    expect((screen.getByLabelText('Composition') as HTMLSelectElement).value).toBe('9');
    expect(within(list).getByRole('button', { name: /^Story 9x16 headline/ })).toBeTruthy();
    expect(within(list).queryByRole('button', { name: /^Main 1x1 headline/ })).toBeNull();
    await waitFor(() =>
      expect(callsOf<[string, string, string, number | null]>('scene')[0]?.[3]).toBe(9),
    );
  });

  test('an upload with no registered revision says so instead of reading forever', async () => {
    spies.catalog?.mockRestore();
    spies.catalog = spyOn(templateSources, 'fetchTemplateRevisionVariants').mockRejectedValue(
      new Error('Template revision variants: template_revision_source_missing'),
    );
    editor();
    expect(await screen.findByText(/not registered as a template revision/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Layers' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
