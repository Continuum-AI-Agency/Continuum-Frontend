import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { ApiRenderVariable, ForgeImportMapping } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
import { registerToastSink } from '@/components/ui/toast-imperative';
import type { RequestRow } from './renderRequestRows';

const importMedia = mock(async () => ({
  assetId: '11111111-1111-4111-8111-111111111111',
  versionId: '44444444-4444-4444-8444-444444444444',
}));
let savedMapping: ForgeImportMapping | null = null;
const getImportMapping = mock(async () => savedMapping);
const saveImportMapping = mock(async (input: { mapping: ForgeImportMapping | null }) => ({
  mapping: input.mapping,
}));
const suggestRows = mock(async (_input: unknown) => ({
  rows: [],
  assets: [],
  dropped: [],
  unfilled: [],
  sourceWarnings: [],
  ops: [] as unknown[],
}));
const uploadMediaAsset = mock(async ({ file }: { file: File }) => ({
  assetId: '99999999-9999-4999-8999-999999999999',
  versionId: '98999999-9999-4999-8999-999999999999',
  signedUrl: `https://cdn.test/${file.name}`,
}));

mock.module('@/lib/library/uploadMediaAsset', () => ({ uploadMediaAsset }));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { importMedia, getImportMapping, saveImportMapping, suggestRows },
}));

const { RenderRowsImport, downloadTemplateCsv } = await import('./RenderRowsImport');

// Base UI waits on a MutationObserver as a popup or dialog animates; happy-dom's, lifted per file
// (a global shim in the shared setup drops other files' tests).
installPickerDomGlobals();

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  importMedia.mockClear();
  getImportMapping.mockClear();
  saveImportMapping.mockClear();
  suggestRows.mockClear();
  uploadMediaAsset.mockClear();
  savedMapping = null;
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

function renderImport(
  overrides: { existingRows?: number; brandId?: string; contract?: unknown } = {},
) {
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
const importButton = () => screen.getByRole('button', { name: /^Import (\d+ )?rows$/ });

describe('RenderRowsImport', () => {
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
    // No template on this contract: nothing is saved or asked of a model.
    expect(suggestRows).toHaveBeenCalledTimes(0);
    expect(screen.getByLabelText('Map Name').textContent).toStartWith('Name');
    expect(screen.getByLabelText('Map Parent').textContent).toStartWith('Parent');
    expect(screen.getByLabelText('Map Formats').textContent).toStartWith('Formats');
    expect(screen.getByLabelText('Map Replace ad ID').textContent).toStartWith('Replace ad ID');
    expect(screen.getByLabelText('Map Price').textContent).toStartWith('Price');
    expect(screen.getByLabelText('Map Hero').textContent).toStartWith('Hero');

    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
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

  test('refuses an empty CSV; a repeated header is told apart instead of refused', async () => {
    const toasts: string[] = [];
    const unregister = registerToastSink(({ title }) => toasts.push(String(title)));
    const { onImport } = renderImport();
    chooseFile(csv('Name,Hero\n'));
    await waitFor(() => expect(toasts).toContain('This spreadsheet has no rows to import.'));
    chooseFile(csv('Name,Name\nA,B'));
    await waitFor(() => expect(screen.getByLabelText('Map Name (2)')).toBeTruthy());
    expect(onImport).toHaveBeenCalledTimes(0);
    unregister();
  });

  test('imports a mapped HTTPS image and pins its Library version on the row', async () => {
    stubLibrary();
    const { onImport } = renderImport();
    chooseFile(csv('Name,Hero URL\nAd A,https://cdn.example/hero.jpg'));
    await waitFor(() =>
      expect(importMedia).toHaveBeenCalledWith({
        brandId: 'brand-a',
        kind: 'image',
        url: 'https://cdn.example/hero.jpg',
      }),
    );
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0]?.[0][0]?.values.hero).toEqual({
      assetId: KNOWN,
      versionId: '44444444-4444-4444-8444-444444444444',
    });
  });

  test('retries a failed linked image without asking for another spreadsheet', async () => {
    stubLibrary();
    importMedia.mockImplementationOnce(async () => {
      throw new Error('media_url_unavailable');
    });
    renderImport();
    chooseFile(csv('Name,Hero URL\nAd A,https://cdn.example/hero.jpg'));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry linked media' }));
    await waitFor(() => expect(importMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
  });

  test('names each unusable cell and imports it empty; fills a resolved Library thumbnail', async () => {
    const fetchMock = stubLibrary();
    const { onImport } = renderImport();
    chooseFile(csv(`Name,Price,Hero\nA,cheap,${UNKNOWN}\nB,3,${KNOWN}\n`));
    await waitFor(() =>
      expect(
        screen.getByText('Row 1 · Hero: No Library asset with this id — imported empty'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Row 1 · Price: Not a number — imported empty')).toBeTruthy();
    expect(document.querySelector('td[title="Not a number"]')?.textContent).toBe('cheap');
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/hero-thumb.jpg',
    );
    // One lookup per id, not per render.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [first, second] = onImport.mock.calls[0]?.[0] as [RequestRow, RequestRow];
    expect(first.values).toEqual({});
    expect(second.values).toEqual({ price: 3, hero: { assetId: KNOWN } });
  });

  test('an asset of the wrong kind for its column is named and left out', async () => {
    stubLibrary();
    const { onImport } = renderImport();
    chooseFile(csv(`Name,Hero\nA,${VIDEO}\n`));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Row 1 · Hero: This Library asset is a video, not an image — imported empty',
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect((onImport.mock.calls[0]?.[0] as RequestRow[])[0]?.values).toEqual({});
  });

  test('a failed Library lookup is named, never loops, and retries on the next load', async () => {
    const fetchMock = stubLibrary();
    fetchMock.mockImplementationOnce(async () => new Response('', { status: 500 }));
    renderImport();
    const sheet = `Name,Hero\nA,${KNOWN}\n`;
    chooseFile(csv(sheet));
    await waitFor(() =>
      expect(
        screen.getByText('Row 1 · Hero: Could not check this id — imported empty'),
      ).toBeTruthy(),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    chooseFile(csv(sheet));
    // The file is read asynchronously; the second lookup follows it.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Could not check this id/)).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a Drive folder link in a picture column is skipped, never a reason to stop', async () => {
    stubLibrary();
    const { onImport } = renderImport();
    chooseFile(
      csv(
        'Name,Hero\nA,https://drive.google.com/drive/folders/166l3B3BNd0FFBsbvLSpLmN7KAOF14S8Q\n',
      ),
    );
    await waitFor(() => expect(screen.getByText(/hold a Drive folder link/)).toBeTruthy());
    expect(importMedia).toHaveBeenCalledTimes(0);
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect((onImport.mock.calls[0]?.[0] as RequestRow[])[0]?.label).toBe('A');
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

  test('takes a dropped CSV exactly as a chosen one', async () => {
    renderImport();
    const zone = screen.getByText(/Drop a file here or choose one/).parentElement!;
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [csv('Headline\nDropped\n')] } });
    // The auto-mapped preview means the drop reached the same review path as the picker.
    await waitFor(() => expect(screen.getByText('Dropped')).toBeTruthy());
  });

  test('offers a blank template download inside the dialog', () => {
    const create = spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:template');
    spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Download blank template' }));
    expect(create).toHaveBeenCalledTimes(1);
  });
});

// The owner's own Fecha 10 workbook: three tabs, notes above the data, a colour legend under it.
const workbookFile = () =>
  new File(
    [
      readFileSync(
        new URL(
          '../../../packages/contracts/src/ai-studio/fixtures/caliente/cuotas-fecha-10.xlsx',
          import.meta.url,
        ),
      ),
    ],
    'Cuotas_Caliente_Fecha_10_Liga_1.xlsx',
  );

const CARD_B = {
  template: {
    key: '207',
    bindingId: '55555555-5555-4555-8555-555555555555',
    name: 'Caliente Card B Halftime',
    displayName: 'Caliente Card B Halftime',
    contractHash: 'hash-207',
  },
  outputs: [
    { id: 'btts', label: 'RENDER Card B (Ambos Equipos Anotan)', ratio: null },
    { id: 'halftime', label: 'RENDER Card B (Halftime)', ratio: null },
  ],
  variables: [
    ['template_field_1', 'Right Odds (Menos de 2.5 / No)', 'text'],
    ['template_field_2', 'Left Odds (Más de 2.5 / Si)', 'text'],
    ['template_field_3', 'Right Box Color', 'color'],
    ['template_field_4', 'Left Box Color', 'color'],
    ['template_field_5', 'Left Text Color', 'color'],
    ['template_field_6', 'Right Text Color', 'color'],
    ['template_field_7', 'Match', 'text'],
    ['template_field_8', 'Bet Amount', 'text'],
    ['template_field_9', 'Win Amount', 'text'],
  ].map(([key, label, kind]) => variable({ key, label, kind: kind as ApiRenderVariable['kind'] })),
};
const CARD_B_MAPPING: ForgeImportMapping = {
  sheet: 'Card B ',
  headerRow: 2,
  headers: [
    'Partido',
    'Equipo A',
    'Equipo B',
    'Mercado',
    'Cuota A',
    'Texto A',
    'Color Cuota A',
    'Color Texto A',
    'Cuota B',
    'Texto B',
    'Color Cuota B',
    'Color Texto B',
    'Si Apuestas',
    'Ganarias',
  ],
  columns: {
    Partido: 'template_field_7',
    'Equipo A': '__skip__',
    'Equipo B': '__skip__',
    Mercado: '@formats',
    'Cuota A': 'template_field_2',
    'Texto A': '__skip__',
    'Color Cuota A': 'template_field_4',
    'Color Texto A': 'template_field_5',
    'Cuota B': 'template_field_1',
    'Texto B': '__skip__',
    'Color Cuota B': 'template_field_3',
    'Color Texto B': 'template_field_6',
    'Si Apuestas': 'template_field_8',
    Ganarias: 'template_field_9',
  },
  label: '{Partido}',
  outputs: { 'ambos equipos anotan': 'btts', 'mas menos 2 5 goles': 'halftime' },
  decimals: { template_field_1: 2, template_field_2: 2 },
  kits: {},
};

describe('RenderRowsImport: the Caliente workbook', () => {
  test('week one: reads every tab here, picks Card B, asks for a mapping, imports exact rows, saves it', async () => {
    const { columns, label, outputs, decimals, kits } = CARD_B_MAPPING;
    suggestRows.mockImplementationOnce(async () => ({
      rows: [],
      assets: [],
      dropped: [],
      unfilled: [],
      sourceWarnings: [],
      ops: [{ op: 'map', mapping: { columns, label, outputs, decimals, kits } }],
    }));
    const { onImport } = renderImport({ contract: CARD_B } as never);
    chooseFile(workbookFile());

    await waitFor(() => expect(suggestRows).toHaveBeenCalledTimes(1));
    const asked = suggestRows.mock.calls[0]?.[0] as {
      grid: {
        mapColumns: boolean;
        tables: Array<{ name: string; headers: string[]; notes: string[] }>;
      };
    };
    expect(asked.grid.mapColumns).toBe(true);
    expect(asked.grid.tables[0]?.name).toBe('Card B ');
    expect(asked.grid.tables[0]?.notes.join(' ')).toContain('2 decimales');
    expect((screen.getByLabelText('Header row') as HTMLInputElement).value).toBe('3');
    expect(screen.getByLabelText('Sheet').textContent).toContain('Card B');
    await waitFor(() =>
      expect(screen.getByLabelText('Map Cuota B').textContent).toContain('Right Odds'),
    );
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const rows = onImport.mock.calls[0]?.[0] as RequestRow[];
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({
      label: 'Alianza Atletico vs Comerciantes Unidos',
      outputIds: ['btts'],
      values: {
        template_field_1: '1.90',
        template_field_2: '1.75',
        template_field_3: '#d72828',
        template_field_4: '#ffffff',
        template_field_5: '#000000',
        template_field_6: '#ffffff',
        template_field_7: 'Alianza Atletico vs Comerciantes Unidos',
        template_field_8: '100',
        template_field_9: '190',
      },
    });
    expect(rows[1]?.outputIds).toEqual(['halftime']);
    expect(rows[8]?.values.template_field_1).toBe('2.00');
    await waitFor(() => expect(saveImportMapping).toHaveBeenCalledTimes(1));
    expect(saveImportMapping.mock.calls[0]?.[0]).toMatchObject({
      templateKey: '207',
      bindingId: CARD_B.template.bindingId,
      mapping: { sheet: 'Card B ', headerRow: 2, label: '{Partido}' },
    });
  });

  test('week two: the saved mapping applies to the new sheet with nothing asked', async () => {
    savedMapping = CARD_B_MAPPING;
    const { onImport } = renderImport({ contract: CARD_B } as never);
    await waitFor(() => expect(getImportMapping).toHaveBeenCalledTimes(1));
    chooseFile(workbookFile());
    await waitFor(() => expect(screen.getByText(/mapped as last time/)).toBeTruthy());
    expect(suggestRows).toHaveBeenCalledTimes(0);
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect((onImport.mock.calls[0]?.[0] as RequestRow[])[4]?.values.template_field_2).toBe('2.15');
  });

  test('a sheet chosen before last week\'s mapping arrives still imports with it', async () => {
    let answer!: (mapping: ForgeImportMapping) => void;
    getImportMapping.mockImplementationOnce(
      () =>
        new Promise<ForgeImportMapping | null>((resolve) => {
          answer = resolve;
        }),
    );
    const { onImport } = renderImport({ contract: CARD_B } as never);
    chooseFile(workbookFile());
    await new Promise((resolve) => setTimeout(resolve, 50));
    answer(CARD_B_MAPPING);
    await waitFor(() => expect(screen.getByText(/mapped as last time/)).toBeTruthy());
    expect(suggestRows).toHaveBeenCalledTimes(0);
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect((onImport.mock.calls[0]?.[0] as RequestRow[])[0]?.values.template_field_1).toBe('1.90');
  });

  test('a web component neither reads nor saves a column mapping', async () => {
    savedMapping = CARD_B_MAPPING;
    const web = {
      ...CARD_B,
      template: { ...CARD_B.template, key: 'web:99999999-9999-4999-8999-999999999999' },
    };
    const { onImport } = renderImport({ contract: web } as never);
    chooseFile(csv('Match\nAlianza vs Cienciano\n'));
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false));
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect((onImport.mock.calls[0]?.[0] as RequestRow[])[0]?.values.template_field_7).toBe(
      'Alianza vs Cienciano',
    );
    expect(getImportMapping).not.toHaveBeenCalled();
    expect(saveImportMapping).not.toHaveBeenCalled();
  });

  test('pictures by name: each team finds its jersey in the Library; the ones that do not are listed', async () => {
    const jersey = (id: string, title: string) => ({
      ...heroImage,
      id,
      title,
      fileName: `${title}.png`,
    });
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const items =
        url.searchParams.get('kind') === 'image'
          ? [
              jersey('a1111111-1111-4111-8111-111111111111', 'Alianza Atletico'),
              jersey('a2222222-2222-4222-8222-222222222222', 'Comerciantes Unidos'),
            ]
          : [];
      return new Response(JSON.stringify({ items }), { status: 200 });
    }) as unknown as typeof fetch;
    const contractA = {
      outputs: [],
      variables: [
        variable({ key: 'left_team', label: 'Left Team' }),
        variable({ key: 'right_team', label: 'Right Team' }),
        variable({ key: 'left_jersey', label: 'Left Jersey', kind: 'image' }),
        variable({ key: 'right_jersey', label: 'Right Jersey', kind: 'image' }),
      ],
    };
    const { onImport } = renderImport({ contract: contractA } as never);
    chooseFile(csv('Left Team,Right Team\nAlianza Atletico ,Comerciantes Unidos\nADT,Cienciano\n'));
    await waitFor(() =>
      expect(screen.getByText(/2 of 4 found — not found: adt, cienciano/)).toBeTruthy(),
    );
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [first, second] = onImport.mock.calls[0]?.[0] as [RequestRow, RequestRow];
    expect(first.values.left_jersey).toEqual({ assetId: 'a1111111-1111-4111-8111-111111111111' });
    expect(first.values.right_jersey).toEqual({ assetId: 'a2222222-2222-4222-8222-222222222222' });
    expect(second.values.left_jersey).toBeUndefined();
  });
});

describe('RenderRowsImport: a dropped folder of pictures', () => {
  test('only the files a team names are uploaded, and each lands on its rows', async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const contractA = {
      outputs: [],
      variables: [
        variable({ key: 'left_team', label: 'Left Team' }),
        variable({ key: 'left_jersey', label: 'Left Jersey', kind: 'image' }),
      ],
    };
    const { onImport } = renderImport({ contract: contractA } as never);
    chooseFile(csv('Left Team\nFBC Melgar\nUTC\nMelgar\n'));
    await screen.findByText(/0 of 3 found — not found: fbc melgar, utc, melgar/);
    const png = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose a folder of pictures'), {
      target: { files: [png('melgar.png'), png('unrelated.png')] },
    });
    await screen.findByText(/2 of 3 found — not found: utc/);
    fireEvent.click(importButton());
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(uploadMediaAsset).toHaveBeenCalledTimes(1);
    expect((uploadMediaAsset.mock.calls[0]?.[0] as { file: File }).file.name).toBe('melgar.png');
    const rows = onImport.mock.calls[0]?.[0] as RequestRow[];
    const pin = {
      assetId: '99999999-9999-4999-8999-999999999999',
      versionId: '98999999-9999-4999-8999-999999999999',
    };
    expect(rows[0]?.values.left_jersey).toEqual(pin);
    expect(rows[1]?.values.left_jersey).toBeUndefined();
    expect(rows[2]?.values.left_jersey).toEqual(pin);
  });
});
