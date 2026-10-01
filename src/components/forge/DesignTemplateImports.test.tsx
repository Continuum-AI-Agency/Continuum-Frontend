import { afterEach, expect, mock, test } from 'bun:test';
import type { DesignImportResponse } from '@continuum/contracts';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';

const importDesign = mock(
  async (): Promise<DesignImportResponse> => ({
    assetId: 'template-asset',
    parseState: 'parsed',
    status: 'created',
  }),
);
const api = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...api,
  importDesignTemplate: importDesign,
}));
const { DesignTemplateImports, useDesignTemplateImports } = await import('./DesignTemplateImports');
afterEach(() => {
  cleanup();
  importDesign.mockClear();
});

test('conversion stays visible after upload completion and retries the saved asset', async () => {
  importDesign.mockRejectedValueOnce(new Error('Could not contact Forge. Try again.'));
  const completed = mock(async () => undefined);
  function Imports() {
    const { imports, start } = useDesignTemplateImports('brand', completed);
    return (
      <>
        <button type="button" onClick={() => void start('art.ai', 'saved-source')}>
          Uploaded
        </button>
        <DesignTemplateImports imports={imports} onRetry={start} />
      </>
    );
  }
  render(<Imports />);
  fireEvent.click(screen.getByRole('button', { name: 'Uploaded' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('Could not contact Forge');
  fireEvent.click(screen.getByRole('button', { name: 'Retry art.ai' }));
  await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
  expect(importDesign.mock.calls).toEqual([
    ['brand', 'saved-source'],
    ['brand', 'saved-source'],
  ]);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('in-flight conversion is visible and repeated callbacks do not duplicate it', async () => {
  let resolve!: (value: DesignImportResponse) => void;
  importDesign.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result } = renderHook(() => useDesignTemplateImports('brand', () => undefined));
  await act(async () => {
    void result.current.start('art.psd', 'saved-source');
    void result.current.start('art.psd', 'saved-source');
  });
  expect(result.current.imports[0]?.state).toBe('importing');
  expect(importDesign).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ assetId: 'template', parseState: 'pending', status: 'created' }));
  expect(result.current.imports[0]?.result?.assetId).toBe('template');
});

test('a completed import from another brand cannot refresh the current brand', async () => {
  let resolve!: (value: DesignImportResponse) => void;
  importDesign.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const completed = mock(() => undefined);
  const { result, rerender } = renderHook(
    ({ brand }) => useDesignTemplateImports(brand, completed),
    { initialProps: { brand: 'one' } },
  );
  await act(async () => {
    void result.current.start('art.ai', 'saved-source');
  });
  rerender({ brand: 'two' });
  await act(async () => resolve({ assetId: 'template', parseState: 'parsed', status: 'created' }));
  expect(result.current.imports).toEqual([]);
  expect(completed).not.toHaveBeenCalled();
  rerender({ brand: 'one' });
  expect(result.current.imports[0]?.state).toBe('imported');
});
