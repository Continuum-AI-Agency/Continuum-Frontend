import { afterEach, expect, mock, test } from 'bun:test';
import { templateVariantSchema } from '@continuum/contracts';
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

test('variant branches stay in one family; deletion targets only the chosen child', () => {
  const items = [
    variant(root, null, 'Original'),
    variant(child, root, 'Blue'),
    variant(grandchild, child, 'Blue copy'),
  ];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(forgeQueryKeys.templateVariants(brandId), items);
  client.setQueryData(forgeQueryKeys.workspaceTemplates(brandId), []);
  const onDelete = mock(() => undefined);
  const onInspect = mock(() => undefined);
  const onRender = mock(() => undefined);
  render(
    <QueryClientProvider client={client}>
      <VariantsPanel
        brandId={brandId}
        assetId={grandchild}
        expectedVersionId={versionId}
        onDelete={onDelete}
        onInspect={onInspect}
        onRender={onRender}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Original')).toBeTruthy();
  expect(screen.getByText('Blue')).toBeTruthy();
  expect(screen.getByText('Blue copy')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Delete variant Original' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Delete variant Blue' }));
  expect(onDelete).toHaveBeenCalledWith(items[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Render this variant' }));
  expect(onRender).toHaveBeenCalledWith({ templateKey: '401', bindingId: undefined });
  fireEvent.click(screen.getAllByRole('button', { name: 'Inspect' })[0]!);
  expect(onInspect).toHaveBeenCalledWith(root);
});
