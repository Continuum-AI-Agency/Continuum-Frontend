import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let finishUpload!: (value: { documentId: string }) => void;
const upload = mock(
  () =>
    new Promise<{ documentId: string }>((resolve) => {
      finishUpload = resolve;
    }),
);
const previewImport = mock(async () => ({
  sourceName: 'rows.csv',
  sheetName: null,
  headers: ['Headline'],
  rows: [{ Headline: 'Hello' }],
  rowCount: 1,
}));

mock.module('@/lib/documents/uploadBrandDocument', () => ({ uploadBrandDocument: upload }));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { previewImport, snapshotDriveFolder: async () => ({ files: [] }) },
}));

const { RenderRowsImport } = await import('./RenderRowsImport');
afterEach(cleanup);

describe('RenderRowsImport scope', () => {
  test('discards an upload result after the brand changes', async () => {
    const props = { variables: [], existingRows: 0, onImport: mock(() => undefined) };
    const view = render(<RenderRowsImport brandId="brand-a" {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const file = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(file).toBeTruthy();
    fireEvent.change(file!, { target: { files: [new File(['x'], 'rows.csv')] } });
    view.rerender(<RenderRowsImport brandId="brand-b" {...props} />);
    finishUpload({ documentId: 'doc-1' });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(previewImport).toHaveBeenCalledTimes(0);
    expect(props.onImport).toHaveBeenCalledTimes(0);
  });
});
