import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { ApiRenderVariable } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ApiError } from '@/lib/api/errors';
import type { RequestRow } from './renderRequestRows';

let finishUpload!: (value: { documentId: string }) => void;
const upload = mock(
  () =>
    new Promise<{ documentId: string }>((resolve) => {
      finishUpload = resolve;
    }),
);
const previewImport = mock(async () => ({
  sourceName: 'rows.xlsx',
  sheetName: null,
  headers: ['Headline'],
  rows: [{ Headline: 'Hello' }],
  rowCount: 1,
}));

mock.module('@/lib/documents/uploadBrandDocument', () => ({ uploadBrandDocument: upload }));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { previewImport },
}));

const { RenderRowsImport, downloadTemplateCsv } = await import('./RenderRowsImport');

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  upload.mockClear();
  previewImport.mockClear();
  mock.restore();
});

const variable = (over: Partial<ApiRenderVariable>): ApiRenderVariable => ({
  key: 'headline',
  label: 'Headline',
  kind: 'text',
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  role: null,
  roleSource: null,
  charBudget: null,
  comps: [],
  sample: null,
  placement: null,
  ...over,
});

const contract = {
  variables: [
    variable({}),
    variable({ key: 'price', label: 'Price', kind: 'number' }),
    variable({ key: 'hero', label: 'Hero', kind: 'image' }),
  ],
  outputs: [{ id: 'sq', label: 'Square', ratio: '1:1' }],
};

const KNOWN = '11111111-1111-4111-8111-111111111111';
const UNKNOWN = '22222222-2222-4222-8222-222222222222';
const VIDEO = '33333333-3333-4333-8333-333333333333';

const heroImage = {
  id: KNOWN,
  brandId: 'brand-a',
  kind: 'image',
  bucket: 'media',
  storagePath: 'brand-a/hero.jpg',
  fileName: 'hero.jpg',
  mimeType: 'image/jpeg',
  width: 1080,
  height: 1350,
  source: 'upload',
  status: 'ready',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  thumbnailUrl: 'https://cdn.test/hero-thumb.jpg',
};

/** The Library lookup route, answering only for KNOWN (an image) and VIDEO. */
function stubLibrary() {
  const fetchMock = mock(async (input: RequestInfo | URL) => {
    const assetId = new URL(String(input), 'http://localhost').searchParams.get('assetId');
    const items =
      assetId === KNOWN
        ? [heroImage]
        : assetId === VIDEO
          ? [{ ...heroImage, id: VIDEO, kind: 'video', mimeType: 'video/mp4' }]
          : [];
    return new Response(JSON.stringify({ items }), { status: 200 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderImport(overrides: { existingRows?: number; brandId?: string } = {}) {
  const onImport = mock((_rows: RequestRow[]) => undefined);
  const onOpenChange = mock((_open: boolean) => undefined);
  const props = {
    brandId: 'brand-a',
    contract,
    existingRows: 0,
    open: true,
    onOpenChange,
    onImport,
    ...overrides,
  };
  const view = render(<RenderRowsImport {...props} />);
  return { view, props, onImport, onOpenChange };
}

function chooseFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('The dialog rendered no file input');
  fireEvent.change(input, { target: { files: [file] } });
}

const csv = (text: string, name = 'rows.csv') => new File([text], name, { type: 'text/csv' });
const importButton = () => screen.getByRole('button', { name: 'Import reviewed rows' });

describe('RenderRowsImport', () => {
  test('discards an XLSX upload result after the brand changes', async () => {
    const { view, props } = renderImport();
    chooseFile(new File(['x'], 'rows.xlsx'));
    view.rerender(<RenderRowsImport {...props} brandId="brand-b" />);
    finishUpload({ documentId: 'doc-1' });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(previewImport).toHaveBeenCalledTimes(0);
    expect(props.onImport).toHaveBeenCalledTimes(0);
  });

  test('parses a quoted CSV client-side, auto-maps every column and imports a replacing fork', async () => {
    stubLibrary();
    const { onImport, onOpenChange } = renderImport();
    chooseFile(
      csv(
        'Name,Parent,Formats,Headline,Price,Hero,Replace ad ID\n' +
          `Root,,Square,"Hola, mundo",9.99,${KNOWN},\n` +
          'Spain,Root,,Adiós,,,238500\n',
      ),
    );
    await waitFor(() => expect(screen.getByText('rows.csv · 2 rows')).toBeTruthy());
    expect(upload).toHaveBeenCalledTimes(0);
    expect(screen.getByLabelText('Map Name').textContent).toStartWith('Name');
    expect(screen.getByLabelText('Map Parent').textContent).toStartWith('Parent');
    expect(screen.getByLabelText('Map Formats').textContent).toStartWith('Formats');
    expect(screen.getByLabelText('Map Replace ad ID').textContent).toStartWith('Replace ad ID');
    expect(screen.getByLabelText('Map Price').textContent).toStartWith('Price');
    expect(screen.getByLabelText('Map Hero').textContent).toStartWith('Hero');

    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());
    expect(onImport).toHaveBeenCalledTimes(1);
    const [root, spain] = onImport.mock.calls[0]?.[0] as [RequestRow, RequestRow];
    expect(root.label).toBe('Root');
    expect(root.values).toEqual({ headline: 'Hola, mundo', price: 9.99, hero: { assetId: KNOWN } });
    expect(root.media.hero).toEqual({
      w: 1080,
      h: 1350,
      thumbnailUrl: 'https://cdn.test/hero-thumb.jpg',
      name: 'hero.jpg',
    });
    expect(root.outputIds).toEqual(['sq']);
    expect(spain.parentId).toBe(root.id);
    expect(spain.delivery).toEqual({ action: 'replace', adId: '238500' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('names each unusable cell, blocks Import, and fills a resolved Library thumbnail', async () => {
    const fetchMock = stubLibrary();
    renderImport();
    chooseFile(csv(`Name,Price,Hero\nA,cheap,${UNKNOWN}\nB,3,${KNOWN}\n`));
    await waitFor(() =>
      expect(screen.getByText('Row 1 · Hero: No Library asset with this id')).toBeTruthy(),
    );
    expect(screen.getByText('Row 1 · Price: Not a number')).toBeTruthy();
    expect(document.querySelector('td[title="Not a number"]')?.textContent).toBe('cheap');
    expect(document.querySelector('td[title="No Library asset with this id"]')?.textContent).toBe(
      UNKNOWN,
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/hero-thumb.jpg',
    );
    expect(importButton().hasAttribute('disabled')).toBe(true);
    // One lookup per id, not per render.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('refuses an asset of the wrong kind for its column', async () => {
    stubLibrary();
    renderImport();
    chooseFile(csv(`Name,Hero\nA,${VIDEO}\n`));
    await waitFor(() =>
      expect(
        screen.getByText('Row 1 · Hero: This Library asset is a video, not an image'),
      ).toBeTruthy(),
    );
    expect(importButton().hasAttribute('disabled')).toBe(true);
  });

  test('a failed Library lookup blocks Import as unchecked, never loops, and retries on the next load', async () => {
    const fetchMock = stubLibrary();
    fetchMock.mockImplementationOnce(async () => new Response('', { status: 500 }));
    renderImport();
    const sheet = `Name,Hero\nA,${KNOWN}\n`;
    chooseFile(csv(sheet));
    await waitFor(() =>
      expect(screen.getByText('Row 1 · Hero: Could not check this id')).toBeTruthy(),
    );
    expect(screen.queryByText('Row 1 · Hero: No Library asset with this id')).toBeNull();
    expect(importButton().hasAttribute('disabled')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    chooseFile(csv(sheet));
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('says how many rows an XLSX has when the server refuses it past the cap', async () => {
    render(<ToastProvider>{null}</ToastProvider>);
    renderImport();
    previewImport.mockImplementationOnce(async () => {
      throw new ApiError('render_import_too_many_rows', 422, undefined, {
        error: 'render_import_too_many_rows',
        rowCount: 72,
      });
    });
    chooseFile(new File(['x'], 'rows.xlsx'));
    finishUpload({ documentId: 'doc-1' });
    await waitFor(() =>
      expect(
        screen.getByText('This sheet has 72 rows. A render set holds at most 50.'),
      ).toBeTruthy(),
    );

    previewImport.mockImplementationOnce(async () => {
      throw new ApiError('render_import_duplicate_headers', 422, undefined, {
        error: 'render_import_duplicate_headers',
      });
    });
    chooseFile(new File(['x'], 'rows.xlsx'));
    finishUpload({ documentId: 'doc-2' });
    await waitFor(() =>
      expect(
        screen.getByText('Two columns share a header. Rename one and upload again.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('render_import_duplicate_headers')).toBeNull();
  });

  test('saves the template CSV with a UTF-8 BOM and does not revoke it during the click', async () => {
    const blobs: Blob[] = [];
    spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:template';
    });
    const revoke = spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    downloadTemplateCsv(contract, 'template.csv');
    expect(revoke).toHaveBeenCalledTimes(0);
    // Bytes, not text(): decoding may strip the very BOM under test.
    const bytes = new Uint8Array(await (blobs[0] as Blob).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  test('refuses a sheet past the render-set cap and names the counts', async () => {
    renderImport();
    const rows = Array.from({ length: 51 }, (_, index) => `Row ${index}`).join('\n');
    chooseFile(csv(`Name\n${rows}\n`));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'This sheet has 51 rows. A render set holds at most 50.',
      ),
    );
    expect(importButton().hasAttribute('disabled')).toBe(true);

    cleanup();
    renderImport({ existingRows: 49 });
    chooseFile(csv('Name\nA\nB\n'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'This sheet has 2 rows. A render set holds at most 50 (49 already here).',
      ),
    );
    expect(importButton().hasAttribute('disabled')).toBe(true);
  });
});
