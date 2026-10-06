import { afterEach, expect, mock, test } from 'bun:test';
import { type TemplateRevisionVariant, templateVariantSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forgeQueryKeys } from './queryKeys';
import { VariantsPanel } from './VariantsPanel';

afterEach(cleanup);
const brandId = '22222222-2222-4222-8222-222222222222';
const root = '33333333-3333-4333-8333-333333333333';
const child = '44444444-4444-4444-8444-444444444444';
const grandchild = '55555555-5555-4555-8555-555555555555';
const versionId = '66666666-6666-4666-8666-666666666666';
const variant = (id: string, parentAssetId: string | null, name: string) =>
  templateVariantSchema.parse({
    assetId: id,
    rootAssetId: root,
    parentAssetId,
    parentVersionId: parentAssetId ? versionId : null,
    name,
    sourceKind: 'illustrator',
    originalAssetId: root,
    originalVersionId: versionId,
    originalFileName: 'Artboard.ai',
    source: {
      assetId: id,
      brandId,
      versionId,
      family: 'after_effects_package',
      parseState: 'parsed',
      parser: null,
      parse: null,
      fonts: [],
      ratios: ['1:1'],
      slotCount: 1,
      forgeRunId: null,
      forgeState: null,
      templateKey: id === child ? '401' : null,
      displayName: name,
      parseError: null,
      parsedAt: null,
      createdAt: '2026-10-02T00:00:00Z',
      updatedAt: null,
    },
  });

const registry = (sourceKind: TemplateRevisionVariant['sourceKind']) => {
  const originals = [
    variant(root, null, 'Original'),
    variant(child, root, 'Blue'),
    variant(grandchild, child, 'Blue copy'),
  ];
  const items: TemplateRevisionVariant[] = originals.map((item, index) => ({
    templateId: root,
    variantId: item.assetId,
    name: item.name,
    original: index === 0,
    parentRevisionId: index ? root : null,
    draftHeadRevisionId: item.assetId,
    publishedHeadRevisionId: index === 1 ? item.assetId : null,
    archivedAt: null,
    sourceKind,
    revisions: [
      {
        templateId: root,
        variantId: item.assetId,
        id: item.assetId,
        number: 1,
        parentRevisionId: index ? root : null,
        sourceAssetId: item.assetId,
        sourceVersionId: versionId,
        checksum: 'a'.repeat(64),
        edits: { layers: [], slots: [] },
        source: item.source,
        publications:
          index === 1
            ? [{ templateKey: '401', bindingId: brandId, workspace: 'test', contractHash: 'hash' }]
            : [],
        createdAt: '2026-10-02T00:00:00Z',
        createdBy: null,
        nativeCommitId: null,
        dependencies: null,
      },
    ],
  }));
  return items;
};

test('named variants retain draft and published revisions and render the exact publication', () => {
  const items = registry('illustrator');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(forgeQueryKeys.revisionVariants(brandId, grandchild), items);
  const onInspect = mock(() => undefined);
  const onRender = mock(() => undefined);
  render(
    <QueryClientProvider client={client}>
      <VariantsPanel
        brandId={brandId}
        assetId={grandchild}
        expectedVersionId={versionId}
        onInspect={onInspect}
        onRender={onRender}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Original')).toBeTruthy();
  expect(screen.getByText('Blue')).toBeTruthy();
  expect(screen.getByText('Blue copy')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Archive' })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'Archive' })[0]!);
  expect(screen.getByRole('alertdialog', { name: 'Archive template variant' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Render Blue · Revision 1' }));
  expect(onRender).toHaveBeenCalledWith({
    templateKey: '401',
    bindingId: brandId,
    templateRevision: { templateId: root, variantId: child, revisionId: child },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Inspect draft' })[0]!);
  expect(onInspect).toHaveBeenCalledWith(root);
});

const renderPanel = (sourceKind: TemplateRevisionVariant['sourceKind']) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(forgeQueryKeys.revisionVariants(brandId, grandchild), registry(sourceKind));
  const onEditLayers = mock(() => undefined);
  render(
    <QueryClientProvider client={client}>
      <VariantsPanel
        brandId={brandId}
        assetId={grandchild}
        expectedVersionId={versionId}
        onEditLayers={onEditLayers}
      />
    </QueryClientProvider>,
  );
  return onEditLayers;
};

test('a design import makes variants from its layers, never from an uploaded After Effects project', () => {
  const onEditLayers = renderPanel('illustrator');
  expect(screen.getByText(/built from an Illustrator file/)).toBeTruthy();
  expect(screen.queryByLabelText('Upload After Effects variant')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit layers' }));
  expect(onEditLayers).toHaveBeenCalledTimes(1);
});

test('an After Effects template still takes an authored project upload', () => {
  renderPanel('after_effects');
  expect(screen.getByLabelText('Upload After Effects variant')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit layers' })).toBeNull();
});
