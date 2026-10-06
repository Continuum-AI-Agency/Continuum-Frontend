import { afterEach, expect, spyOn, test } from 'bun:test';
import {
  type TemplateEditableLayer,
  type TemplateLayerEdit,
  type TemplateRevisionVariant,
  templateSourceSummarySchema,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import * as templateSources from '@/lib/library/templateSources';
import { LayerControls, TemplateLayerEditor } from './TemplateLayerEditor';

afterEach(cleanup);
const layer: TemplateEditableLayer = {
  compId: 7,
  comp: 'Square',
  layerId: 1,
  name: 'Text',
  kind: 'text',
  text: 'Client text',
  font: 'ClientFont-Regular',
  fontSize: 20,
  visible: true,
  visibilitySlotKeys: [],
  slotKeys: [],
  textReason: null,
  visibilityReason: null,
  geometryReason: null,
  x: 4,
  y: 5,
  width: null,
  height: null,
};
function Controls({ reason = null }: { reason?: string | null }) {
  const [edit, setEdit] = useState<TemplateLayerEdit>({ compId: 7, layerId: 1 });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  return (
    <>
      <LayerControls
        layer={{ ...layer, geometryReason: reason }}
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
test('point text permits position edits while unsupported resize stays disabled', () => {
  render(<Controls />);
  expect(screen.getByLabelText('x').hasAttribute('disabled')).toBe(false);
  expect(screen.getByLabelText('width').hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('x'), { target: { value: '17' } });
  expect(screen.getByRole('status').textContent).toContain('"x":17');
});
test('blank geometry remains invalid when another field changes', () => {
  render(<Controls />);
  fireEvent.change(screen.getByLabelText('x'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Text size (pt)'), { target: { value: '24' } });
  expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  expect((screen.getByLabelText('x') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('x'), { target: { value: '0' } });
  expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);
});
test('native unsafe geometry reason disables position controls', () => {
  render(<Controls reason="Animated position cannot be changed safely." />);
  expect(screen.getByLabelText('x').hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('y').hasAttribute('disabled')).toBe(true);
});

test('an output row’s Edit opens the editor on that composition, not the template’s first', async () => {
  const brandId = '22222222-2222-4222-8222-222222222222';
  const assetId = '33333333-3333-4333-8333-333333333333';
  const versionId = '66666666-6666-4666-8666-666666666666';
  const revisionId = '77777777-7777-4777-8777-777777777777';
  const variant: TemplateRevisionVariant = {
    templateId: assetId,
    variantId: assetId,
    name: 'Original',
    original: true,
    parentRevisionId: null,
    draftHeadRevisionId: revisionId,
    publishedHeadRevisionId: null,
    archivedAt: null,
    sourceKind: 'after_effects',
    revisions: [
      {
        templateId: assetId,
        variantId: assetId,
        id: revisionId,
        number: 1,
        parentRevisionId: null,
        sourceAssetId: assetId,
        sourceVersionId: versionId,
        checksum: 'a'.repeat(64),
        edits: { layers: [], slots: [] },
        source: templateSourceSummarySchema.parse({
          assetId,
          brandId,
          versionId,
          family: 'after_effects_package',
          parseState: 'parsed',
          createdAt: '2026-10-06T00:00:00Z',
        }),
        publications: [],
        createdAt: '2026-10-06T00:00:00Z',
        createdBy: null,
        nativeCommitId: null,
        dependencies: null,
      },
    ],
  };
  const textLayer = (compId: number, comp: string, layerId: number): TemplateEditableLayer => ({
    ...layer,
    compId,
    comp,
    layerId,
    name: `${comp} headline`,
    text: `${comp} headline`,
  });
  const spies = [
    spyOn(templateSources, 'fetchTemplateRevisionVariants').mockResolvedValue([variant]),
    spyOn(templateSources, 'editableTemplateFonts').mockResolvedValue([]),
    spyOn(templateSources, 'fetchTemplateVariables').mockResolvedValue({
      variables: [],
      edits: [],
    } as unknown as Awaited<ReturnType<typeof templateSources.fetchTemplateVariables>>),
    spyOn(templateSources, 'previewTemplateRevision').mockResolvedValue({
      compId: 3,
      comps: [
        { id: 3, name: 'Main 1x1' },
        { id: 9, name: 'Story 9x16' },
      ],
      layers: [textLayer(3, 'Main 1x1', 1), textLayer(9, 'Story 9x16', 2)],
      svg: '<svg/>',
      warnings: [],
    }),
  ];
  try {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TemplateLayerEditor
          brandId={brandId}
          assetId={assetId}
          versionId={versionId}
          name="Promo"
          active
          onSaved={async () => undefined}
          initialComp="Story 9x16"
        />
      </QueryClientProvider>,
    );
    const select = (await screen.findByLabelText('Composition')) as HTMLSelectElement;
    expect(select.value).toBe('9');
    expect(screen.getByRole('button', { name: /^Story 9x16 headline/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Main 1x1 headline/ })).toBeNull();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});

test('an upload with no registered revision says so instead of reading forever', async () => {
  const spies = [
    spyOn(templateSources, 'fetchTemplateRevisionVariants').mockRejectedValue(
      new Error('Template revision variants: template_revision_source_missing'),
    ),
    spyOn(templateSources, 'editableTemplateFonts').mockResolvedValue([]),
    spyOn(templateSources, 'fetchTemplateVariables').mockResolvedValue({
      variables: [],
      edits: [],
    } as unknown as Awaited<ReturnType<typeof templateSources.fetchTemplateVariables>>),
  ];
  try {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TemplateLayerEditor
          brandId="22222222-2222-4222-8222-222222222222"
          assetId="33333333-3333-4333-8333-333333333333"
          versionId="66666666-6666-4666-8666-666666666666"
          name="Card"
          active
          onSaved={async () => undefined}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/not registered as a template revision/)).toBeTruthy();
    expect(screen.queryByText('Reading editable layers…')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});
