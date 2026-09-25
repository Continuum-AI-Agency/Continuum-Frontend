import { afterEach, expect, mock, test } from 'bun:test';
import type { ApiRenderTemplateContract } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const getContract = mock(async () => ({ template: { contractHash: 'hash' } }) as ApiRenderTemplateContract);
mock.module('./apiRendersApi', () => ({ apiRendersApi: { getContract } }));
mock.module('@/components/forge/RenderPreviewPanel', () => ({
  RenderPreviewPanel: ({ rows }: { rows: Array<{ values: Record<string, unknown> }> }) => (
    <output>{JSON.stringify(rows[0]?.values)}</output>
  ),
}));

const { CanvasRenderPreview } = await import('./CanvasRenderPreview');

afterEach(() => {
  cleanup();
  getContract.mockClear();
});

test('Canvas previews the selected variation with its current mapped values', async () => {
  const onContract = mock((_contract: ApiRenderTemplateContract) => undefined);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CanvasRenderPreview
        brandId="brand"
        bindingId="binding"
        templateKey="template"
        contractHash="hash"
        nodeId="node"
        onContract={onContract}
        cases={[
          { key: 'one', label: 'Variation 1', values: { headline: 'First' } },
          { key: 'two', label: 'Variation 2', values: { headline: 'Second' } },
        ]}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('{"headline":"First"}')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Preview' }), { target: { value: 'two' } });
  expect(await screen.findByText('{"headline":"Second"}')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
  expect(screen.getByRole('dialog').textContent).toContain('Second');
  expect(getContract).toHaveBeenCalledWith('brand', 'template', 'binding');
  expect(onContract).toHaveBeenCalledTimes(1);
});

test('a changed template does not overwrite the node or preview stale values', async () => {
  const onContract = mock((_contract: ApiRenderTemplateContract) => undefined);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CanvasRenderPreview
        brandId="brand"
        bindingId="binding"
        templateKey="template"
        contractHash="old-hash"
        nodeId="node"
        cases={[{ key: 'current', label: 'Current', values: { headline: 'Stale' } }]}
        onContract={onContract}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('The template changed. Choose it again to preview the current version.')).toBeTruthy();
  expect(onContract).toHaveBeenCalledTimes(0);
});
