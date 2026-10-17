import { afterEach, expect, mock, test } from 'bun:test';
import { type TemplateRevisionVariant, templateVariantSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forgeQueryKeys } from './queryKeys';
import { VariantsPanel } from './VariantsPanel';

afterEach(cleanup);
const seed = (
  client: QueryClient,
  items: TemplateRevisionVariant[],
  defaults: Array<{ templateId: string; variantId: string }> = [],
) => {
  client.setQueryData([...forgeQueryKeys.revisionVariants(brandId, grandchild), 'history'], items);
  client.setQueryData(forgeQueryKeys.variantDefaults(brandId), defaults);
};
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
    tags: [],
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
        edits: { layers: [], slots: [], orders: [] },
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
  seed(client, items);
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Open to publish' })[0]!);
  expect(onInspect).toHaveBeenCalledWith(root);
});

const renderPanel = (sourceKind: TemplateRevisionVariant['sourceKind']) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client, registry(sourceKind));
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

// Inyogo Card B: one template, two After Effects files. The panel names both, never one as "the" file.
test('a revision whose outputs run different files lists each output with its file', () => {
  const items = registry('after_effects');
  const published = items[1]!.revisions[0]!;
  items[1]!.revisions[0] = {
    ...published,
    sources: [
      { fileId: 11, outputs: ['Halftime'], assetId: child, versionId, checksum: 'a'.repeat(64) },
      {
        fileId: 12,
        outputs: ['Ambos Equipos Anotan'],
        assetId: root,
        versionId: grandchild,
        checksum: 'b'.repeat(64),
      },
    ],
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client, items);
  render(
    <QueryClientProvider client={client}>
      <VariantsPanel brandId={brandId} assetId={grandchild} expectedVersionId={versionId} />
    </QueryClientProvider>,
  );
  const files = screen.getByRole('list', { name: 'Blue source files' });
  expect(files.textContent).toContain('Halftime · worker file 11');
  expect(files.textContent).toContain('Ambos Equipos Anotan · worker file 12');
  expect(screen.queryByRole('list', { name: 'Original source files' })).toBeNull();
});

test('a variant made by Apply my design system wears its Brand-aligned tag', () => {
  const items = registry('after_effects');
  items[2] = { ...items[2]!, tags: ['brand_aligned'] };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client, items);
  render(
    <QueryClientProvider client={client}>
      <VariantsPanel brandId={brandId} assetId={grandchild} expectedVersionId={versionId} />
    </QueryClientProvider>,
  );
  expect(screen.getAllByText('Brand-aligned')).toHaveLength(1);
  expect(screen.getByText('Brand-aligned').closest('li')?.textContent).toContain('Blue copy');
});

// Blue copy branched from Blue, not from the Original: a grandchild, drawn under its parent.
const family = () => {
  const items = registry('after_effects');
  items[2] = {
    ...items[2]!,
    parentRevisionId: child,
    revisions: [{ ...items[2]!.revisions[0]!, parentRevisionId: child }],
  };
  return items;
};
const renderFamily = (
  items: TemplateRevisionVariant[],
  defaults: Array<{ templateId: string; variantId: string }> = [],
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client, items, defaults);
  const onBranch = mock(() => undefined);
  render(
    <QueryClientProvider client={client}>
      <VariantsPanel
        brandId={brandId}
        assetId={grandchild}
        expectedVersionId={versionId}
        onInspect={() => undefined}
        onBranch={onBranch}
        onRender={() => undefined}
      />
    </QueryClientProvider>,
  );
  return onBranch;
};

test('a variant of a variant hangs under its parent and says where it came from', () => {
  renderFamily(family());
  const underBlue = screen.getByRole('list', { name: 'Variants of Blue' });
  expect(underBlue.textContent).toContain('Blue copy');
  expect(underBlue.textContent).toContain('From Blue · Revision 1');
  expect(screen.getByRole('list', { name: 'Variants of Original' }).textContent).toContain(
    'From Original · Revision 1',
  );
});

test('Branch from here opens the variant head for Edit layers', () => {
  const onBranch = renderFamily(family());
  const blue = screen.getByText('Blue').closest('[data-variant]') as HTMLElement;
  fireEvent.click(within(blue).getByRole('button', { name: 'Branch from here' }));
  expect(onBranch).toHaveBeenCalledWith(child);
});

test('the Original is the default until a published variant is made the default', () => {
  renderFamily(family());
  const node = (name: string) => screen.getByText(name).closest('[data-variant]') as HTMLElement;
  expect(within(node('Original')).getByText('Default')).toBeTruthy();
  expect(within(node('Blue')).getByRole('button', { name: 'Make default' })).toBeTruthy();
  // A draft cannot be what a family opens on.
  expect(within(node('Blue copy')).queryByRole('button', { name: 'Make default' })).toBeNull();
  cleanup();
  renderFamily(family(), [{ templateId: root, variantId: child }]);
  expect(within(node('Blue')).getByText('Default')).toBeTruthy();
  expect(within(node('Original')).getByRole('button', { name: 'Make default' })).toBeTruthy();
});

test('an archived variant stays in the family, dimmed, and can be restored', () => {
  const items = family();
  items[1] = { ...items[1]!, archivedAt: '2026-10-10T00:00:00Z' };
  renderFamily(items);
  const blue = screen.getByText('Blue').closest('[data-variant]') as HTMLElement;
  expect(within(blue).getByText('Archived')).toBeTruthy();
  expect(within(blue).getByRole('button', { name: 'Restore' })).toBeTruthy();
  expect(within(blue).queryByRole('button', { name: /^Render / })).toBeNull();
});

test('the graph view lists every revision as a button, newest first', () => {
  renderFamily(family());
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
  const revisions = screen.getByRole('list', { name: 'Template revisions' });
  expect(
    within(revisions)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Original · Revision 1', 'Blue · Revision 1', 'Blue copy · Revision 1']);
});
