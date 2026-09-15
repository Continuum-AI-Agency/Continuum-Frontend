/**
 * The render-requests grid against a mocked render API.
 *
 * What this guards is the wiring, not the pixels: a template is discovered and its contract
 * seeds a row from the designer's samples; the row's dry-run lands and the status reads Ready;
 * typing never loses focus; rows gain variations and rows below without touching the selection;
 * sets save through dialogs and render through the review tray docked under the grid. The pure
 * row logic has its own test, the tray its own, and the Render ledger (RenderJobsGrid) its own.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { useEffect } from 'react';

const TEMPLATE = {
  key: '133',
  name: 'forge_bench_starcraft',
  environment: 'Continuum_app',
  contractVersion: '1',
  contractHash: 'hash',
  contractSource: 'template_forge' as const,
  outputKinds: ['image' as const],
  variableCount: 3,
  previewUrl: null,
  updatedAt: null,
  ratios: ['1:1'],
  sourceAssetId: null,
  fontsMissing: [],
  displayName: 'StarCraft Promo',
};

const READY_RESPONSE = {
  confirmationToken: 't',
  confirmationHash: 'a'.repeat(64),
  expiresAt: new Date().toISOString(),
  template: TEMPLATE,
  target: null,
  inputKeys: ['headline'],
  effects: 'none' as const,
  test: true,
  watermarkLogo: null,
  fit: null,
};

const batchPreflightMock = mock(async (_input: { records: unknown[] }) => ({
  confirmationToken: 'batch-token',
  readiness: {
    state: 'READY',
    totalRows: 1,
    readyRows: 1,
    blockedRows: 0,
    unknownRows: 0,
    findings: [],
  },
}));
const preflightMock = mock(
  async (_input: { variables: Record<string, unknown> }): Promise<unknown> => READY_RESPONSE,
);
const listRenderSetsMock = mock(async () => ({ items: [] as unknown[], nextCursor: null }));
const createRenderSetMock = mock(async (input: Record<string, unknown>) => ({
  ...input,
  id: '33333333-3333-4333-8333-333333333333',
  revision: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const updateRenderSetMock = mock(async (id: string, input: Record<string, unknown>) => {
  const current = SAVED_SETS.find((set) => set.id === id)!;
  return { ...current, name: input.name ?? current.name, revision: current.revision + 1 };
});
const deleteRenderSetMock = mock(async (_brandId: string, _setId: string) => undefined);
const createInputSetMock = mock(async (input: Record<string, unknown>) => ({
  ...input,
  id: '66666666-6666-4666-8666-666666666666',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

const variable = (over: Record<string, unknown>) => ({
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  role: null,
  roleSource: 'declared' as const,
  charBudget: null,
  comps: [],
  sample: null,
  placement: null,
  ...over,
});

const VARIABLES = [
  variable({
    key: 'headline',
    label: 'Headline',
    kind: 'text',
    required: true,
    role: 'name',
    charBudget: 12,
    sample: 'Hola mundo',
  }),
  variable({ key: 'price', label: 'Price', kind: 'number', role: 'price' }),
  variable({ key: 'hero', label: 'Hero', kind: 'image', role: 'product_image' }),
];

const BRAND = '22222222-2222-4222-8222-222222222222';

const savedSet = (id: string, name: string, label: string) => ({
  id,
  brandId: BRAND,
  bindingId: '44444444-4444-4444-8444-444444444444',
  name,
  description: null as string | null,
  templateKey: '133',
  contractHash: 'hash',
  revision: 1,
  rows: [
    {
      id: `${id.slice(0, -1)}9`,
      parentId: null,
      label,
      overrides: {},
      clearedKeys: [],
      outputIds: [],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const NEWEST = savedSet('55555555-5555-4555-8555-555555555551', 'Newest', 'Newest row');
const OLDER = savedSet('55555555-5555-4555-8555-555555555552', 'Older', 'Older row');
const SAVED_SETS = [NEWEST, OLDER];
const withSavedSets = () =>
  listRenderSetsMock.mockImplementation(async () => ({ items: SAVED_SETS, nextCursor: null }));

/** Per-test additions to the one template list and contract the API mock answers with. */
let renamedTo: string | null = null;
let extraTemplates: Array<typeof TEMPLATE> = [];
let contractOverrides: Record<string, unknown> = {};

const JOB = {
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  templateKey: '133',
  templateName: 'forge_bench_starcraft',
  contractHash: 'hash',
  taskUid: 'T1',
  status: 'finished' as const,
  test: true,
  outputs: [],
  delivery: [],
  error: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  environment: 'Continuum_app',
  fit: null,
  judge: null,
  renderSetName: 'Campaign set',
  labelPath: ['Root', 'Spain'],
};

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listEnvironments: async () => ({
      items: [
        {
          bindingId: '44444444-4444-4444-8444-444444444444',
          workspace: 'Continuum_app',
          isDefault: true,
        },
      ],
    }),
    listTemplates: async () => ({
      // Fresh objects per call, like the wire: a rename is only visible to a caller that re-lists.
      items: [{ ...TEMPLATE, ...(renamedTo ? { displayName: renamedTo } : {}) }, ...extraTemplates],
      nextCursor: null,
    }),
    getContract: async (_brandId: string, templateKey: string) => ({
      template: [TEMPLATE, ...extraTemplates].find((item) => item.key === templateKey) ?? TEMPLATE,
      variables: VARIABLES,
      outputs: [],
      fonts: [],
      layout: null,
      divergence: [],
      ...contractOverrides,
    }),
    listInputSets: async () => ({ items: [], nextCursor: null }),
    createInputSet: createInputSetMock,
    listRenderSets: listRenderSetsMock,
    createRenderSet: createRenderSetMock,
    updateRenderSet: updateRenderSetMock,
    deleteRenderSet: deleteRenderSetMock,
    getRenderSet: async (_brandId: string, id: string) => SAVED_SETS.find((set) => set.id === id),
    batchPreflight: batchPreflightMock,
    listDeliveryDestinations: async () => ({
      slack: { state: 'not_connected', workspaceName: null, destinations: [] },
      meta: { connected: false, adAccountId: null, adAccountName: null },
    }),
    createBatch: async () => ({ jobs: [JOB] }),
    preflight: preflightMock,
    listJobs: async () => ({ items: [JOB], nextCursor: null }),
    getJob: async () => JOB,
  },
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ realtime: { setAuth: async () => undefined } }),
}));
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: () => () => undefined,
}));
/** What the stand-in Library hands back: a long file name, no title. */
const HERO_ASSET = {
  id: '77777777-7777-4777-8777-777777777777',
  fileName: 'launch-week-hero-final-export-v3.png',
  title: null,
  width: 1080,
  height: 1080,
  thumbnailUrl: 'https://cdn.test/hero.png',
  headVersionId: null,
};
// The Library picker drags the whole media stack in; the cell only needs its anchor, and opening
// it picks HERO_ASSET the way a person choosing one would.
mock.module('@/components/organic/primitives/MediaSelectPopover', () => ({
  MediaSelectPopover: ({
    anchor,
    open,
    onAttachAssets,
  }: {
    anchor: React.ReactNode;
    open: boolean;
    onAttachAssets: (assets: unknown[]) => void;
  }) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: a pick per opening, like the real picker.
    useEffect(() => {
      if (open) onAttachAssets([HERO_ASSET]);
    }, [open]);
    return <>{anchor}</>;
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  render as testingRender,
  waitFor,
  within,
} from '@testing-library/react';
import type React from 'react';
import { registerToastSink } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { forgeQueryKeys } from './queryKeys';
import { RenderRequestsGrid } from './RenderRequestsGrid';

const render = (
  ui: React.ReactNode,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) => {
  return testingRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  preflightMock.mockReset();
  preflightMock.mockImplementation(async () => READY_RESPONSE);
  listRenderSetsMock.mockReset();
  listRenderSetsMock.mockImplementation(async () => ({ items: [], nextCursor: null }));
  createRenderSetMock.mockClear();
  updateRenderSetMock.mockClear();
  deleteRenderSetMock.mockClear();
  createInputSetMock.mockClear();
  batchPreflightMock.mockClear();
  extraTemplates = [];
  contractOverrides = {};
});

const confirmDialog = async (answer: 'Keep editing' | 'Discard' | 'Cancel' | 'Delete') => {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: answer }));
  // A length, not toBeNull: a failing element assert inside waitFor pretty-prints the fiber graph.
  await waitFor(() => expect(screen.queryAllByRole('alertdialog')).toHaveLength(0));
};

const next = async () => {
  const button = await screen.findByRole<HTMLButtonElement>('button', { name: 'Next' });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};

const openMenu = async (trigger: string | RegExp, item: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: trigger }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
};

/** The set the rows on screen came from, as the sets rail marks it. */
const openSetName = () =>
  within(screen.getByRole('list', { name: 'Render sets' }))
    .getAllByRole('button', { name: /^Open / })
    .find((button) => button.getAttribute('aria-current') === 'true')
    ?.getAttribute('aria-label')
    ?.replace(/^Open /, '');

describe('RenderRequestsGrid', () => {
  test('associates an authoritative guardrail refusal with its row and cell', async () => {
    preflightMock.mockImplementationOnce(async () => {
      throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
        detail: 'Use a permitted brand color.',
        guardrails: [
          {
            code: 'BRAND_COLOR_OUTSIDE_PALETTE',
            severity: 'block',
            variableKey: 'headline',
            message: 'Use a permitted brand color.',
          },
        ],
      });
    });
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByLabelText('Headline');
    await waitFor(() =>
      expect(screen.getByText('0 of 1 row ready to render · 1 needs fixing')).toBeTruthy(),
    );
    expect(
      screen.getByLabelText('Headline').closest('[title="Use a permitted brand color."]'),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Render 1/ }).disabled).toBe(true);
  });

  test('a paste onto the grid is reviewed like a sheet: its fields, its errors, its row cap', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const paste = async (text: string) => {
      fireEvent.paste(screen.getByRole('table'), { clipboardData: { getData: () => text } });
      return screen.findByRole('dialog', { name: 'Import render rows' });
    };
    const importButton = (dialog: HTMLElement) =>
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Import reviewed rows' });

    const rows = (count: number) =>
      ['headline', ...Array.from({ length: count }, (_, index) => `Row ${index}`)].join('\n');
    let dialog = await paste(rows(50));
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'This sheet has 50 rows. A render set holds at most 50 (1 already here).',
    );
    expect(importButton(dialog).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
    expect(screen.getAllByLabelText('Select row')).toHaveLength(1);

    // Parent and Formats are columns a paste understands too, and a bad cell is named.
    dialog = await paste(
      'Name\tParent\tHeadline\tPrice\nSpain\t\tHola\tcheap\nSale\tSpain\tRebajas\t\n',
    );
    expect(within(dialog).getByText('Row 1 · Price: Not a number')).toBeTruthy();
    expect(importButton(dialog).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));

    dialog = await paste(
      'Name\tParent\tHeadline\tPrice\nSpain\t\tHola\t9.5\nSale\tSpain\tRebajas\t\n',
    );
    await waitFor(() => expect(importButton(dialog).disabled).toBe(false));
    fireEvent.click(importButton(dialog));
    await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(3));
    const sale = screen.getByDisplayValue('Sale');
    expect(within(sale.closest('td')!).getByText('Spain')).toBeTruthy();
  });

  test('discovers the one template, seeds a row from the samples, and dry-runs it to Ready', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    const cell = await screen.findByLabelText('Headline');
    expect((cell as HTMLInputElement).value).toBe('Hola mundo');
    // The template picker names the template, never its build name.
    expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain(
      'StarCraft Promo',
    );
    // The counter reads against the designer's budget.
    expect(screen.getByText('10/12')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy(), { timeout: 3000 });
    expect(preflightMock).toHaveBeenCalledTimes(1);
    expect(preflightMock.mock.calls[0]?.[0].variables).toEqual({ headline: 'Hola mundo' });
    // A media cell offers the Library and is not a text input.
    expect(screen.getByLabelText('Choose Hero')).toBeTruthy();
  });

  test('a rename made on Templates reaches the kept-mounted picker when the Render tab returns', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(<RenderRequestsGrid brandId={BRAND} active />, client);
    const picker = () => screen.getByRole('button', { name: 'Template' });
    await waitFor(() => expect(picker().textContent).toContain('StarCraft Promo'));
    try {
      // Renamed elsewhere while the tab was hidden; the grid stayed mounted and kept its rows.
      rerender(<RenderRequestsGrid brandId={BRAND} active={false} />);
      renamedTo = 'Protoss Promo';
      await client.invalidateQueries({ queryKey: forgeQueryKeys.templates(BRAND) });
      rerender(<RenderRequestsGrid brandId={BRAND} active />);
      await waitFor(() => expect(picker().textContent).toContain('Protoss Promo'));
      expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe('Hola mundo');
    } finally {
      renamedTo = null;
    }
  });

  test('typing 20 characters keeps focus in text, number and name cells while dry-runs land', async () => {
    const inFlight: Array<{ headline: unknown; resolve: (value: unknown) => void }> = [];
    preflightMock.mockImplementation(
      (input) =>
        new Promise((resolve) => inFlight.push({ headline: input.variables.headline, resolve })),
    );
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    // A second row, so a dry-run can land for REAL — a state update, a re-render — while the
    // first row is being typed in.
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Row name')).toHaveLength(2));
    const second = () => screen.getAllByLabelText('Headline')[1] as HTMLInputElement;

    const typeWhileALandedCheckArrives = async (
      input: HTMLInputElement,
      text: string,
      tag: string,
    ) => {
      fireEvent.change(second(), { target: { value: tag } });
      await waitFor(() => expect(inFlight.some((call) => call.headline === tag)).toBe(true), {
        timeout: 3000,
      });
      input.focus();
      let typed = input.value;
      for (const [index, char] of [...text].entries()) {
        typed += char;
        fireEvent.change(input, { target: { value: typed } });
        if (index === 9) {
          // Every pending dry-run resolves mid-word: the first row's is stale by now (a no-op),
          // the second row's is current and flips it to Ready.
          await act(async () => {
            for (const call of inFlight.splice(0)) call.resolve(READY_RESPONSE);
          });
          expect(within(input.closest('tbody')!).getAllByText('Ready').length).toBeGreaterThan(0);
        }
        expect(document.activeElement).toBe(input);
        expect(input.isConnected).toBe(true);
      }
      expect(input.value).toBe(typed);
    };

    const text = screen.getAllByLabelText('Headline')[0] as HTMLInputElement;
    await typeWhileALandedCheckArrives(text, ' and twenty more ch', 'Second');
    expect(text.value).toBe('Hola mundo and twenty more ch');

    const number = screen.getAllByLabelText('Price')[0] as HTMLInputElement;
    await typeWhileALandedCheckArrives(number, '-1234567.89012345678', 'Third');
    // The draft kept the half-typed `-` and `.` on screen the whole way.
    expect(number.value).toBe('-1234567.89012345678');

    const name = screen.getAllByLabelText('Row name')[0] as HTMLInputElement;
    await typeWhileALandedCheckArrives(name, ' — the summer launch', 'Fourth');
    expect(name.value).toBe('Root — the summer launch');
  });

  test('has at most five top-level toolbar controls, and every row capability is still reachable', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const toolbar = screen.getByRole('toolbar', { name: 'Render' });
    expect(toolbar.querySelectorAll('[data-toolbar-control]').length).toBeLessThanOrEqual(5);
    expect(screen.queryByRole('button', { name: /Fill with AI/ })).toBeNull();

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Add' }));
    for (const item of [/Blank row/, /From saved inputs/])
      expect(await screen.findByRole('menuitem', { name: item })).toBeTruthy();
    // Variations and copies are made from a row or the selection, not the toolbar.
    expect(
      screen.queryAllByRole('menuitem', { name: /Fork|Duplicate|variation|Copy/ }),
    ).toHaveLength(0);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    cleanup();

    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('menuitem', { name: /Upload CSV or XLSX/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Download spreadsheet template/ })).toBeTruthy();
    expect(screen.getByText(/paste rows onto the grid/)).toBeTruthy();
    cleanup();

    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click(screen.getByRole('button', { name: 'Row actions for Root' }));
    for (const item of ['Rename', 'Add variation', 'Copy', 'Save as inputs', 'Delete'])
      expect(await screen.findByRole('menuitem', { name: item })).toBeTruthy();
  });

  test('adds a variation of a selected row with a readable name, keeps the selection, and distinguishes clear from reset', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
    expect(screen.getByText('1 selected')).toBeTruthy();
    const selection = screen.getByRole('region', { name: 'Selected rows' });
    fireEvent.click(within(selection).getByRole('button', { name: 'Add variation' }));

    const variation = (await screen.findByDisplayValue('Root · B')) as HTMLInputElement;
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(2);
    // The parent is still what renders; the new variation is only named next.
    const [rootBox, variationBox] = screen.getAllByLabelText<HTMLButtonElement>('Select row');
    expect(rootBox?.getAttribute('aria-checked')).toBe('true');
    expect(variationBox?.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('1 selected')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(variation));

    fireEvent.click(screen.getByRole('button', { name: 'Clear inherited Headline' }));
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Headline to inherited' }));
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(2);

    // A second fork of the same parent takes the next letter.
    await openMenu('Row actions for Root', 'Add variation');
    expect(await screen.findByDisplayValue('Root · C')).toBeTruthy();
  });

  test('"Save as inputs" on a fork saves what it renders with, inherited values included', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Row actions for Root', 'Add variation');
    await screen.findByDisplayValue('Root · B');
    fireEvent.change(screen.getAllByLabelText('Price')[1]!, { target: { value: '9.5' } });
    await openMenu('Row actions for Root · B', 'Save as inputs');
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Spain' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save inputs' }));
    await waitFor(() => expect(createInputSetMock).toHaveBeenCalledTimes(1));
    expect(createInputSetMock.mock.calls[0]?.[0]).toMatchObject({
      name: 'Spain',
      variables: { headline: 'Hola mundo', price: 9.5 },
    });
  });

  test('a new set asks before discarding unsaved edits, and is named in a dialog, not a prompt', async () => {
    const originalPrompt = window.prompt;
    window.prompt = () => {
      throw new Error('window.prompt is not a render-set dialog');
    };
    try {
      render(<RenderRequestsGrid brandId={BRAND} />);
      const headline = (await screen.findByDisplayValue('Hola mundo')) as HTMLInputElement;
      expect(screen.queryByText('(unsaved edits)')).toBeNull();
      fireEvent.change(headline, { target: { value: 'Edited' } });
      expect(screen.getByText('(unsaved edits)')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'New set' }));
      const confirm = await screen.findByRole('alertdialog');
      expect(within(confirm).getByText('Discard unsaved edits?')).toBeTruthy();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));

      const dialog = await screen.findByRole('dialog', { name: 'New render set' });
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Summer' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(createRenderSetMock).toHaveBeenCalledTimes(1));
      expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({ name: 'Summer' });
      await waitFor(() => expect(openSetName()).toBe('Summer'));
      expect(screen.getByDisplayValue('Hola mundo')).toBeTruthy();
      expect(screen.queryByText('(unsaved edits)')).toBeNull();
    } finally {
      window.prompt = originalPrompt;
    }
  });

  test('keeps the named draft row after submitting its immutable set snapshot', async () => {
    const onFired = mock((_jobIds: string[]) => undefined);
    render(<RenderRequestsGrid brandId={BRAND} onFired={onFired} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
    expect(screen.getByText('1 selected')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
    expect(screen.getByText('The row is ready to render')).toBeTruthy();
    expect(
      screen.getByText(
        'To add a field or change the layout, ask a designer to update the template.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Render 1 row · 1 file' }));
    // No set yet: it is named first, then saved, then reviewed in the tray under the grid.
    const naming = await screen.findByRole('dialog', { name: 'Name this render set' });
    fireEvent.change(within(naming).getByLabelText('Name'), { target: { value: 'Campaign set' } });
    fireEvent.click(within(naming).getByRole('button', { name: 'Save' }));
    const tray = await screen.findByRole('region', { name: 'Review and render' });
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
    expect(within(tray).getByText('Render 1 row')).toBeTruthy();
    expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({ name: 'Campaign set' });
    // The grid is still there to read and edit while the tray reviews it.
    expect(screen.getByDisplayValue('Hola mundo')).toBeTruthy();
    await next();
    await next();
    fireEvent.click(await within(tray).findByRole('button', { name: 'Confirm 1 file' }));
    // Queued, the tray follows the job; only the ledger link leaves the Render tab.
    const fired = await within(tray).findByRole('list', { name: 'Fired renders' });
    expect(within(fired).getByText('Root / Spain')).toBeTruthy();
    expect(onFired).not.toHaveBeenCalled();
    expect(batchPreflightMock).toHaveBeenCalledTimes(2);
    fireEvent.click(within(tray).getByRole('button', { name: 'Open Render ledger' }));
    expect(onFired).toHaveBeenCalledWith([JOB.id]);
    await waitFor(() => expect(screen.getByDisplayValue('Root')).toBeTruthy());
  });

  test('Render saves only a set with edits, and silently; Save is what says “Saved”, once', async () => {
    // The newest set, with the headline a row needs to be Ready.
    const renderable = {
      ...NEWEST,
      rows: [{ ...NEWEST.rows[0]!, overrides: { headline: 'Hola mundo' } }],
    };
    listRenderSetsMock.mockImplementation(async () => ({ items: [renderable], nextCursor: null }));
    const saved: string[] = [];
    const unregister = registerToastSink(({ title }) => {
      if (String(title).startsWith('Saved')) saved.push(String(title));
    });
    // Registering flushes toasts earlier tests raised with no sink mounted; those are not ours.
    saved.length = 0;
    try {
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Newest row');
      await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
      fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
      const openThenCancel = async () => {
        await waitFor(() =>
          expect(screen.getByRole<HTMLButtonElement>('button', { name: /Render 1/ }).disabled).toBe(
            false,
          ),
        );
        fireEvent.click(screen.getByRole('button', { name: /Render 1/ }));
        const tray = await screen.findByRole('region', { name: 'Review and render' });
        fireEvent.click(within(tray).getByRole('button', { name: 'Close review' }));
        await waitFor(() =>
          expect(screen.queryAllByRole('region', { name: 'Review and render' })).toHaveLength(0),
        );
      };

      // D14: Render, back out, Render again. Nothing was edited, so nothing is written.
      await openThenCancel();
      await openThenCancel();
      expect(updateRenderSetMock).not.toHaveBeenCalled();

      fireEvent.change(screen.getByDisplayValue('Newest row'), { target: { value: 'Edited row' } });
      await openThenCancel();
      expect(updateRenderSetMock).toHaveBeenCalledTimes(1);
      expect(saved).toEqual([]);

      fireEvent.change(screen.getByDisplayValue('Edited row'), {
        target: { value: 'Edited again' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save (unsaved edits)' }));
      await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(saved).toEqual(['Saved “Newest”']));
    } finally {
      unregister();
    }
  });

  test('a picked asset reads by name on one line with its clear control; a fork keeps both', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click(screen.getByRole('button', { name: 'Choose Hero' }));
    const change = await screen.findByRole('button', { name: 'Change Hero' });
    // The name is the label, cut to the anchor's width, and whole in its tooltip.
    const name = within(change).getByText(HERO_ASSET.fileName);
    expect(name.className).toContain('truncate');
    expect(change.getAttribute('title')).toBe(HERO_ASSET.fileName);
    const row = change.parentElement!;
    expect(row.className).toContain('flex');
    expect(within(row).getByRole('button', { name: 'Clear Hero' })).toBeTruthy();

    // A fork adds the inheritance control; it joins the same line instead of wrapping under it.
    await openMenu('Row actions for Root', 'Add variation');
    await screen.findByDisplayValue('Root · B');
    const forkClear = screen.getByRole('button', { name: 'Clear inherited Hero' });
    const forkChange = screen.getAllByRole('button', { name: 'Change Hero' })[1]!;
    const cell = forkClear.parentElement!;
    expect(cell.className).toContain('flex');
    expect(cell.contains(forkChange)).toBe(true);
  });

  test('the handle, checkbox and name stay in view; variables scroll', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const stuck = screen
      .getAllByRole('columnheader')
      .filter((header) => header.dataset.sticky === 'left')
      .map((header) => header.dataset.columnId);
    expect(stuck).toEqual(['drag', 'select', 'label']);
    const nameCell = screen.getByRole('textbox', { name: 'Row name' }).closest('td');
    expect(nameCell?.dataset.sticky).toBe('left');
    expect(screen.getByRole('textbox', { name: 'Headline' }).closest('td')?.dataset.sticky).toBe(
      undefined,
    );
  });

  test('an intent loads its render set over the newest one', async () => {
    withSavedSets();
    const { rerender } = render(<RenderRequestsGrid brandId={BRAND} />);
    expect(await screen.findByDisplayValue('Newest row')).toBeTruthy();

    rerender(
      <RenderRequestsGrid brandId={BRAND} intent={{ templateKey: '133', renderSetId: OLDER.id }} />,
    );
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(screen.queryByDisplayValue('Newest row')).toBeNull();
  });

  test('a new intent asks before replacing unsaved edits, and is handed back either way', async () => {
    withSavedSets();
    const onIntentConsumed = mock(() => undefined);
    const grid = (intent?: { templateKey: string; renderSetId?: string }) => (
      <RenderRequestsGrid brandId={BRAND} intent={intent} onIntentConsumed={onIntentConsumed} />
    );
    const { rerender } = render(grid());
    fireEvent.change(await screen.findByDisplayValue('Newest row'), {
      target: { value: 'Edited row' },
    });

    rerender(grid({ templateKey: '133', renderSetId: OLDER.id }));
    expect(
      within(await screen.findByRole('alertdialog')).getByText('Discard unsaved edits?'),
    ).toBeTruthy();
    expect(onIntentConsumed).toHaveBeenCalledTimes(1);
    await confirmDialog('Keep editing');
    expect(screen.getByDisplayValue('Edited row')).toBeTruthy();

    rerender(grid({ templateKey: '133', renderSetId: OLDER.id }));
    await confirmDialog('Discard');
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(onIntentConsumed).toHaveBeenCalledTimes(2);
  });

  test('choosing another template asks before replacing unsaved edits', async () => {
    extraTemplates = [{ ...TEMPLATE, key: '134', displayName: 'Summer Promo' }];
    // A radio item keeps its menu open, so the trigger is only pressed when the menu is closed.
    const pickTemplate = async (name: RegExp) => {
      if (!screen.queryByRole('menu'))
        fireEvent.click(screen.getByRole('button', { name: 'Template' }));
      fireEvent.click(await screen.findByRole('menuitemradio', { name }));
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByText('Choose a template');
    await pickTemplate(/StarCraft Promo/);
    fireEvent.change(await screen.findByDisplayValue('Hola mundo'), {
      target: { value: 'Edited' },
    });

    await pickTemplate(/Summer Promo/);
    await confirmDialog('Keep editing');
    expect(screen.getByDisplayValue('Edited')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain(
      'StarCraft Promo',
    );

    await pickTemplate(/Summer Promo/);
    await confirmDialog('Discard');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain(
        'Summer Promo',
      ),
    );
    expect(await screen.findByDisplayValue('Hola mundo')).toBeTruthy();
  });

  test('loading a saved set leaves the unsaved browser draft on offer, not overwritten', async () => {
    withSavedSets();
    const key = `forge:render-drafts:${BRAND}:133`;
    localStorage.setItem(
      key,
      JSON.stringify({
        rows: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            parentId: null,
            label: 'Draft row',
            values: { headline: 'From the draft' },
            clearedKeys: [],
            outputIds: [],
            media: {},
            check: { state: 'idle' },
          },
        ],
      }),
    );
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    await act(async () => {});
    expect(localStorage.getItem(key)).toContain('Draft row');

    fireEvent.click(screen.getByRole('button', { name: 'Import browser draft' }));
    expect(await screen.findByDisplayValue('From the draft')).toBeTruthy();
  });

  test('switching to another saved set while dirty: Keep editing stays, Discard loads it', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    fireEvent.change(await screen.findByDisplayValue('Newest row'), {
      target: { value: 'Edited row' },
    });

    // The rail lists every set at once: a switch is one click, never a menu.
    fireEvent.click(screen.getByRole('button', { name: 'Open Older' }));
    await confirmDialog('Keep editing');
    expect(screen.getByDisplayValue('Edited row')).toBeTruthy();
    expect(openSetName()).toBe('Newest');

    fireEvent.click(screen.getByRole('button', { name: 'Open Older' }));
    await confirmDialog('Discard');
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(openSetName()).toBe('Older');
  });

  test('renames the set without touching unsaved rows, then deletes it and lands on the next', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    fireEvent.change(await screen.findByDisplayValue('Newest row'), {
      target: { value: 'Edited row' },
    });

    await openMenu('Actions for Newest', /Rename/);
    const dialog = await screen.findByRole('dialog', { name: 'Rename render set' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Summer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1));
    expect(updateRenderSetMock.mock.calls[0]).toEqual([
      NEWEST.id,
      { brandId: BRAND, expectedRevision: 1, name: 'Summer' },
    ]);
    await waitFor(() => expect(openSetName()).toBe('Summer'));
    expect(screen.getByDisplayValue('Edited row')).toBeTruthy();
    expect(screen.getByText('(unsaved edits)')).toBeTruthy();

    await openMenu('Actions for Summer', /Delete/);
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Delete “Summer”?')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteRenderSetMock).toHaveBeenCalledWith(BRAND, NEWEST.id));
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(openSetName()).toBe('Older');
  });

  test('a set that is not open renames inline and deletes without replacing the rows on screen', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    fireEvent.change(await screen.findByDisplayValue('Newest row'), {
      target: { value: 'Edited row' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Older' }));
    const field = screen.getByRole('textbox', { name: 'Rename Older' });
    fireEvent.change(field, { target: { value: 'Autumn' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1));
    expect(updateRenderSetMock.mock.calls[0]).toEqual([
      OLDER.id,
      { brandId: BRAND, expectedRevision: 1, name: 'Autumn' },
    ]);
    expect(await screen.findByRole('button', { name: 'Open Autumn' })).toBeTruthy();
    expect(openSetName()).toBe('Newest');

    await openMenu('Actions for Autumn', /Delete/);
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(deleteRenderSetMock).toHaveBeenCalledWith(BRAND, OLDER.id));
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: 'Open Autumn' })).toHaveLength(0),
    );
    expect(openSetName()).toBe('Newest');
    expect(screen.getByDisplayValue('Edited row')).toBeTruthy();
    expect(screen.getByText('(unsaved edits)')).toBeTruthy();
  });

  test('a description saves alone at the revision its set was read at; a conflict says so and changes nothing', async () => {
    withSavedSets();
    const toasts: string[] = [];
    const unregister = registerToastSink(({ title }) => {
      toasts.push(String(title));
    });
    // Registering flushes toasts earlier tests raised with no sink mounted; those are not ours.
    toasts.length = 0;
    try {
      render(<RenderRequestsGrid brandId={BRAND} />);
      fireEvent.change(await screen.findByDisplayValue('Newest row'), {
        target: { value: 'Edited row' },
      });
      const setItem = (name: string) =>
        within(screen.getByRole('list', { name: 'Render sets' }))
          .getAllByRole('listitem')
          .find((item) => within(item).queryByRole('button', { name: `Open ${name}` }))!;

      updateRenderSetMock.mockImplementationOnce(async (_id, input) => ({
        ...NEWEST,
        description: input.description as string,
        revision: 2,
      }));
      fireEvent.click(within(setItem('Newest')).getByRole('button', { name: 'Add a description' }));
      const field = within(setItem('Newest')).getByRole('textbox', {
        name: 'Description of Newest',
      });
      fireEvent.change(field, { target: { value: '  Spain first, then Portugal  ' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1));
      expect(updateRenderSetMock.mock.calls[0]).toEqual([
        NEWEST.id,
        { brandId: BRAND, expectedRevision: 1, description: 'Spain first, then Portugal' },
      ]);
      expect(
        await within(setItem('Newest')).findByRole('button', {
          name: 'Spain first, then Portugal',
        }),
      ).toBeTruthy();
      // Only the description moved: the rows on screen are still the unsaved edit.
      expect(screen.getByDisplayValue('Edited row')).toBeTruthy();
      expect(screen.getByText('(unsaved edits)')).toBeTruthy();

      updateRenderSetMock.mockImplementationOnce(async () => {
        throw new Error('render_set_revision_conflict');
      });
      fireEvent.click(within(setItem('Older')).getByRole('button', { name: 'Add a description' }));
      const older = within(setItem('Older')).getByRole('textbox', { name: 'Description of Older' });
      fireEvent.change(older, { target: { value: 'Autumn cut' } });
      fireEvent.keyDown(older, { key: 'Enter' });
      await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(2));
      expect(updateRenderSetMock.mock.calls[1]?.[1]).toEqual({
        brandId: BRAND,
        expectedRevision: 1,
        description: 'Autumn cut',
      });
      await waitFor(() =>
        expect(toasts).toContain('This set changed elsewhere. Reload it before saving again.'),
      );
      expect(
        await within(setItem('Older')).findByRole('button', { name: 'Add a description' }),
      ).toBeTruthy();
      expect(openSetName()).toBe('Newest');
    } finally {
      unregister();
    }
  });

  test('emptying a fork’s cell blanks it instead of bringing the parent’s value back', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '9.5' } });
    await openMenu('Row actions for Root', 'Add variation');
    await screen.findByDisplayValue('Root · B');
    const forkHeadline = () => screen.getAllByLabelText('Headline')[1] as HTMLInputElement;
    const forkPrice = () => screen.getAllByLabelText('Price')[1] as HTMLInputElement;
    expect(forkHeadline().value).toBe('Hola mundo');

    fireEvent.change(forkHeadline(), { target: { value: '' } });
    expect(forkHeadline().value).toBe('');
    fireEvent.change(forkHeadline(), { target: { value: 'M' } });
    expect(forkHeadline().value).toBe('M');

    fireEvent.change(forkPrice(), { target: { value: '7' } });
    fireEvent.change(forkPrice(), { target: { value: '' } });
    expect(forkPrice().value).toBe('');
    // Back to inherited is still one click, and only that button does it.
    fireEvent.click(screen.getByRole('button', { name: 'Reset Price to inherited' }));
    expect(forkPrice().value).toBe('9.5');
  });

  test('the delete confirm names forks only when it takes rows nobody picked', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(2));
    for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);
    const selection = screen.getByRole('region', { name: 'Selected rows' });
    fireEvent.click(within(selection).getByRole('button', { name: 'Delete' }));
    expect(
      within(await screen.findByRole('alertdialog')).getByText(
        '2 rows will be deleted. Saved renders stay in Render ledger.',
      ),
    ).toBeTruthy();
    await confirmDialog('Cancel');

    await openMenu('Row actions for Root', 'Add variation');
    await screen.findByDisplayValue('Root · B');
    await openMenu('Row actions for Root', 'Delete');
    expect(
      within(await screen.findByRole('alertdialog')).getByText(
        '2 rows will be deleted, including every fork under them.',
      ),
    ).toBeTruthy();
    await confirmDialog('Delete');
    expect(screen.getAllByLabelText('Row name')).toHaveLength(1);
  });

  test('the focused row’s own dry-run landing mid-word keeps focus and the typed text', async () => {
    const inFlight: Array<{ headline: unknown; resolve: (value: unknown) => void }> = [];
    preflightMock.mockImplementation(
      (input) =>
        new Promise((resolve) => inFlight.push({ headline: input.variables.headline, resolve })),
    );
    render(<RenderRequestsGrid brandId={BRAND} />);
    const input = (await screen.findByDisplayValue('Hola mundo')) as HTMLInputElement;
    input.focus();
    let typed = input.value;
    const type = (text: string) => {
      for (const char of text) {
        typed += char;
        fireEvent.change(input, { target: { value: typed } });
        expect(document.activeElement).toBe(input);
      }
    };
    type(' otra');
    // A pause long enough for this row's own debounce to fire for exactly what is on screen.
    await waitFor(() => expect(inFlight.some((call) => call.headline === typed)).toBe(true), {
      timeout: 3000,
    });
    await act(async () => {
      for (const call of inFlight.splice(0)) call.resolve(READY_RESPONSE);
    });
    expect(within(input.closest('tr')!).getByText('Ready')).toBeTruthy();
    expect(document.activeElement).toBe(input);
    type(' vez');
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('Hola mundo otra vez');
  });

  test('Add variation and Row below add beside a row, take focus, and never touch the selection', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    const rootRow = screen.getByDisplayValue('Root').closest('tr')!;

    fireEvent.click(within(rootRow).getByRole('button', { name: 'Add variation' }));
    const variation = (await screen.findByDisplayValue('Root · B')) as HTMLInputElement;
    const variationRow = variation.closest('tr')!;
    expect(within(variationRow).getByText('inherits · 0 changed')).toBeTruthy();
    expect(variationRow.querySelectorAll('[data-guide]')).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(variation));
    const checked = (row: HTMLElement) =>
      within(row).getByLabelText('Select row').getAttribute('aria-checked');
    expect([checked(rootRow), checked(variationRow)]).toEqual(['true', 'false']);

    // Beside the variation: another variation of the same parent, at the same depth.
    fireEvent.click(within(variationRow).getByRole('button', { name: 'Row below' }));
    const sibling = (await screen.findByDisplayValue('Root · C')) as HTMLInputElement;
    expect(within(sibling.closest('tr')!).getByText('inherits · 0 changed')).toBeTruthy();
    expect(sibling.closest('tr')!.querySelectorAll('[data-guide]')).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(sibling));

    // Beside the root: a new root after its whole subtree.
    fireEvent.click(within(rootRow).getByRole('button', { name: 'Row below' }));
    await screen.findByDisplayValue('Render 4');
    expect(
      screen.getAllByLabelText<HTMLInputElement>('Row name').map((input) => input.value),
    ).toEqual(['Root', 'Root · B', 'Root · C', 'Render 4']);
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(checked(rootRow)).toBe('true');

    // What the variation changes is counted as it changes.
    fireEvent.change(within(variationRow).getByLabelText('Price'), { target: { value: '9.5' } });
    expect(within(variationRow).getByText('inherits · 1 changed')).toBeTruthy();
  });

  test('Add variation says why it is unavailable three levels down', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    let label = 'Root';
    for (const next of ['Root · B', 'Root · B · B', 'Root · B · B · B']) {
      const row = screen.getByDisplayValue(label).closest('tr')!;
      fireEvent.click(within(row).getByRole('button', { name: 'Add variation' }));
      await screen.findByDisplayValue(next);
      label = next;
    }
    const deepest = screen.getByDisplayValue(label).closest('tr')!;
    expect(deepest.querySelectorAll('[data-guide]')).toHaveLength(3);
    const blocked = within(deepest).getByRole('button', { name: 'Add variation' });
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(blocked);
    expect(screen.getAllByLabelText('Row name')).toHaveLength(4);
  });

  test('Formats show the ratios each row renders, and Render counts every file', async () => {
    // TEMPLATE publishes no outputs: it renders the ratios its source ships, all together.
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const together = screen.getByLabelText(
      'Formats 1:1. This template renders every format together',
    );
    const chips = (element: Element) =>
      [...element.querySelectorAll<HTMLElement>('[data-ratio]')].map((chip) => chip.dataset.ratio);
    expect(chips(together)).toEqual(['1:1']);
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    expect(screen.getByRole('button', { name: 'Render 1 row · 1 file' })).toBeTruthy();
    cleanup();

    contractOverrides = {
      template: { ...TEMPLATE, ratios: ['16:9', '1:1', '9:16'] },
      outputs: [
        { id: 'wide', label: 'Wide', ratio: '16:9' },
        { id: 'square', label: 'Square', ratio: '1:1' },
        { id: 'story', label: 'Story', ratio: '9:16' },
      ],
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const own = screen.getByRole('button', { name: 'Formats 16:9, 1:1, 9:16' });
    expect(chips(own)).toEqual(['16:9', '1:1', '9:16']);
    expect(own.querySelector('[data-formats]')?.getAttribute('data-formats')).toBe('own');

    await openMenu('Row actions for Root', 'Add variation');
    await screen.findByDisplayValue('Root · B');
    const inherited = screen.getByRole('button', {
      name: 'Formats 16:9, 1:1, 9:16, inherited from Root',
    });
    expect(inherited.querySelector('[data-formats]')?.getAttribute('data-formats')).toBe(
      'inherited',
    );

    // Narrowing the variation to 1:1 makes the formats its own; the root still renders all three.
    fireEvent.click(inherited);
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Wide/ }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Story/ }));
    const narrowed = await screen.findByRole('button', { name: 'Formats 1:1' });
    expect(chips(narrowed)).toEqual(['1:1']);
    expect(narrowed.querySelector('[data-formats]')?.getAttribute('data-formats')).toBe('own');
    expect(screen.getByRole('button', { name: 'Formats 16:9, 1:1, 9:16' })).toBeTruthy();

    for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);
    expect(screen.getByRole('button', { name: 'Render 2 rows · 4 files' })).toBeTruthy();
  });

  test('an edit after review sends the tray back to Review; Re-check saves it and reviews again', async () => {
    const renderable = {
      ...NEWEST,
      rows: [{ ...NEWEST.rows[0]!, overrides: { headline: 'Hola mundo' } }],
    };
    listRenderSetsMock.mockImplementation(async () => ({ items: [renderable], nextCursor: null }));
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Render 1 row · 1 file' }));
    const tray = await screen.findByRole('region', { name: 'Review and render' });
    await next();
    await next();
    expect(within(tray).getByRole('button', { name: 'Confirm 1 file' })).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Newest row'), { target: { value: 'Renamed row' } });
    expect(await within(tray).findByText('Rows changed since review')).toBeTruthy();
    expect(within(tray).queryAllByRole('button', { name: /Confirm/ })).toHaveLength(0);

    // The rename re-checks the row; Re-check waits for Ready, saves the edit and reviews again.
    const recheck = within(tray).getByRole<HTMLButtonElement>('button', { name: 'Re-check' });
    await waitFor(() => expect(recheck.disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(recheck);
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(2));
    expect(updateRenderSetMock).toHaveBeenCalledTimes(1);
    expect(within(tray).queryByText('Rows changed since review')).toBeNull();
    expect(batchPreflightMock.mock.calls[1]?.[0].records).toMatchObject([
      { label: 'Renamed row', expectedRenderSetRevision: 2 },
    ]);
  });

  test('the per-row Output settings column exists only when the template publishes settings', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('columnheader', { name: /Output settings/ })).toHaveLength(0);
    cleanup();

    contractOverrides = { encode: { stored: null, defaults: { mp4: {}, mov: {} } } };
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    expect(screen.getByRole('columnheader', { name: /Output settings/ })).toBeTruthy();
  });
});
