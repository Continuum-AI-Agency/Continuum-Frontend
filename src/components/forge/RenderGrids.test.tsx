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
  // The SAME binding the saved sets below carry: a set belongs to the binding its template
  // lives in, and the grid now reads the binding off the chosen template.
  bindingId: '44444444-4444-4444-8444-444444444444',
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
const DRAFT_ROOT = '88888888-8888-4888-8888-888888888881';
const suggestRowsMock = mock(async (_input: unknown) => ({
  rows: [
    { id: DRAFT_ROOT, parentId: null, label: 'Drafted', overrides: { headline: 'Summer sale' } },
    {
      id: '88888888-8888-4888-8888-888888888882',
      parentId: DRAFT_ROOT,
      label: 'Drafted · cheaper',
      overrides: { price: 9 },
    },
  ],
  assets: [],
  dropped: [],
  unfilled: [],
}));
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
  bindingId: '00000000-0000-4000-8000-0000000000b1',
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
    suggestRows: suggestRowsMock,
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

// The grid reads the person's brand role from the brand provider; outside one, this file is an
// owner. Spread, and falling through to the real hook, because mock.module outlives this file.
const activeBrand = await import('@/components/providers/ActiveBrandProvider');
const realActiveBrandContext = activeBrand.useActiveBrandContext;
let brandRole = 'owner';
mock.module('@/components/providers/ActiveBrandProvider', () => ({
  ...activeBrand,
  useActiveBrandContext: () => {
    try {
      return realActiveBrandContext();
    } catch {
      return { permissions: [{ brand_profile_id: BRAND, role: brandRole }] };
    }
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
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
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

// Base UI waits on a MutationObserver when a menu or radio opens; happy-dom's, lifted per file
// the way the review tray's own test does.
installPickerDomGlobals();

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
  suggestRowsMock.mockClear();
  batchPreflightMock.mockClear();
  extraTemplates = [];
  contractOverrides = {};
  brandRole = 'owner';
});

const confirmDialog = async (answer: 'Keep editing' | 'Discard' | 'Cancel' | 'Delete') => {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: answer }));
  // A length, not toBeNull: a failing element assert inside waitFor pretty-prints the fiber graph.
  await waitFor(() => expect(screen.queryAllByRole('alertdialog')).toHaveLength(0));
};

/** The tray's one primary button, pressed once it is enabled. */
const press = async (name: string) => {
  const button = await screen.findByRole<HTMLButtonElement>('button', { name });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};

/**
 * Shuts every open menu level. A closed Base UI menu stays in the DOM with `data-closed` while it
 * animates out, so this waits on `[data-open]`; a submenu needs one Escape per level, and a menu
 * left open portals into the body and outlives `cleanup()`.
 */
const closeAnyMenu = async () => {
  for (let level = 0; level < 3; level += 1) {
    if (document.querySelectorAll('[role="menu"][data-open]').length === 0) break;
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() =>
      expect(document.querySelectorAll('[role="menu"][data-open]').length).toBeLessThan(3 - level),
    );
  }
  await waitFor(() =>
    expect(document.querySelectorAll('[role="menu"][data-open]').length).toBe(0),
  );
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
    // A value the server refuses is wrong, not missing.
    expect(screen.getByText('Invalid')).toBeTruthy();
    // And it says WHY: the badge names the field and the reason the server gave. Without this
    // the row is red with nothing to act on, so the reason gets retyped instead of read.
    expect(screen.getByText('Invalid').getAttribute('title')).toBe(
      'Headline: Use a permitted brand color.',
    );
  });

  test('a blank required field reads Needs input, muted; only a wrong value reads Invalid', async () => {
    contractOverrides = {
      variables: [
        ...VARIABLES,
        variable({ key: 'ref_price_text', label: 'ref_price_text', kind: 'text' }),
        variable({ key: 'watermark_logo', label: 'Logo', kind: 'image', reserved: true }),
      ],
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    const headline = await screen.findByLabelText('Headline');
    // Raw After Effects layer names read as words in the header, never as the key.
    expect(screen.getByRole('columnheader', { name: 'Price text' })).toBeTruthy();
    expect(screen.getByText('Continuum fills this')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy(), { timeout: 3000 });

    fireEvent.change(headline, { target: { value: '' } });
    const status = await screen.findByText('Needs input');
    expect(status.getAttribute('title')).toBe('Fill in Headline');
    expect(screen.queryAllByText('Invalid')).toHaveLength(0);
    // The blank cell is not painted as an error; the row says what it waits for.
    expect(headline.classList.contains('border-destructive')).toBe(false);
    expect(screen.getByText('0 of 1 row ready to render · 1 needs input')).toBeTruthy();
  });

  test('a frame placement cannot settle reads "AI check after render", and says why', async () => {
    preflightMock.mockImplementation(async () => ({
      ...READY_RESPONSE,
      fit: {
        comp: null,
        escalate: true,
        why: '1 slot could not be measured — the finished frame goes to the judge',
        slots: [{ key: 'hero', state: 'unknown', why: 'placed by a rig' }],
      },
    }));
    render(<RenderRequestsGrid brandId={BRAND} />);
    const status = await screen.findByText('AI check after render', undefined, { timeout: 3000 });
    expect(screen.queryAllByText('Needs judge')).toHaveLength(0);
    const trigger = status.closest('button')!;
    fireEvent.mouseEnter(trigger);
    fireEvent.focus(trigger);
    expect(
      await screen.findByText(
        'An AI model checks the finished frame after it renders, because where an image lands couldn’t be measured.',
      ),
    ).toBeTruthy();
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
    expect(name.value).toBe('Base — the summer launch');
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
    fireEvent.click(screen.getByRole('button', { name: 'Row actions for Base' }));
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

    const variation = (await screen.findByDisplayValue('Base · B')) as HTMLInputElement;
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
    await openMenu('Row actions for Base', 'Add variation');
    expect(await screen.findByDisplayValue('Base · C')).toBeTruthy();
  });

  test('"Save as inputs" on a fork saves what it renders with, inherited values included', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Row actions for Base', 'Add variation');
    await screen.findByDisplayValue('Base · B');
    fireEvent.change(screen.getAllByLabelText('Price')[1]!, { target: { value: '9.5' } });
    await openMenu('Row actions for Base · B', 'Save as inputs');
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Spain' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save inputs' }));
    await waitFor(() => expect(createInputSetMock).toHaveBeenCalledTimes(1));
    expect(createInputSetMock.mock.calls[0]?.[0]).toMatchObject({
      name: 'Spain',
      variables: { headline: 'Hola mundo', price: 9.5 },
    });
  });

  test('a new set saves the edits on screen first, and is named in a dialog, not a prompt', async () => {
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

      // Nothing is lost by moving on: the edits go into an "Untitled set" before the new one opens.
      fireEvent.click(screen.getByRole('button', { name: 'New set' }));
      const dialog = await screen.findByRole('dialog', { name: 'New render set' });
      expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
      expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({ name: 'Untitled set' });
      expect(
        (createRenderSetMock.mock.calls[0]?.[0] as { rows: Array<{ overrides: unknown }> }).rows[0]
          ?.overrides,
      ).toMatchObject({ headline: 'Edited' });
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Summer' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(createRenderSetMock).toHaveBeenCalledTimes(2));
      expect(createRenderSetMock.mock.calls[1]?.[0]).toMatchObject({ name: 'Summer' });
      await waitFor(() => expect(openSetName()).toBe('Summer'));
      expect(screen.getByDisplayValue('Hola mundo')).toBeTruthy();
      expect(screen.queryByText('(unsaved edits)')).toBeNull();
    } finally {
      window.prompt = originalPrompt;
    }
  });

  test('keeps the draft row after submitting its immutable set snapshot, saved as Untitled set', async () => {
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
    // No set yet: it is saved as "Untitled set" without a question, then reviewed under the grid.
    const tray = await screen.findByRole('region', { name: 'Review and render' });
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(within(tray).getByText('Render 1 row')).toBeTruthy();
    expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({ name: 'Untitled set' });
    // The grid is still there to read and edit while the tray reviews it.
    expect(screen.getByDisplayValue('Hola mundo')).toBeTruthy();
    // No Meta target: Deliver folds its defaults to one line and renders from there.
    await press('Next: delivery');
    expect(within(tray).getByRole('button', { name: 'Change delivery' })).toBeTruthy();
    expect(within(tray).getByRole('radio', { name: 'Final' }).hasAttribute('data-disabled')).toBe(
      false,
    );
    await press('Render 1 file');
    // Queued, the tray follows the job; only the ledger link leaves the Render tab.
    const fired = await within(tray).findByRole('list', { name: 'Fired renders' });
    expect(within(fired).getByText('Root / Spain')).toBeTruthy();
    expect(onFired).not.toHaveBeenCalled();
    expect(batchPreflightMock).toHaveBeenCalledTimes(2);
    fireEvent.click(within(tray).getByRole('button', { name: 'Open Render ledger' }));
    expect(onFired).toHaveBeenCalledWith([JOB.id]);
    await waitFor(() => expect(screen.getByDisplayValue('Base')).toBeTruthy());
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
    await openMenu('Row actions for Base', 'Add variation');
    await screen.findByDisplayValue('Base · B');
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

  test('a new intent saves the edits on screen, then loads its set, and is handed back', async () => {
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
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
    expect(onIntentConsumed).toHaveBeenCalledTimes(1);
    expect(updateRenderSetMock.mock.calls[0]?.[0]).toBe(NEWEST.id);
    expect(
      (updateRenderSetMock.mock.calls[0]?.[1] as { rows: Array<{ label: string }> }).rows[0]?.label,
    ).toBe('Edited row');
  });

  test('choosing another template saves the edits on screen first', async () => {
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
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain(
        'Summer Promo',
      ),
    );
    expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
    expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({
      name: 'Untitled set',
      templateKey: '133',
    });
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

  test('switching to another saved set saves the edits on screen, then opens it', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    fireEvent.change(await screen.findByDisplayValue('Newest row'), {
      target: { value: 'Edited row' },
    });

    // The rail lists every set at once: a switch is one click, never a menu.
    fireEvent.click(screen.getByRole('button', { name: 'Open Older' }));
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(openSetName()).toBe('Older');
    expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
    expect(updateRenderSetMock).toHaveBeenCalledTimes(1);
    expect(updateRenderSetMock.mock.calls[0]?.[1]).toMatchObject({ expectedRevision: 1 });
  });

  test('an edit saves itself once, a moment after typing stops, at the revision it was read at', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    const name = await screen.findByDisplayValue('Newest row');
    fireEvent.change(name, { target: { value: 'Edited' } });
    fireEvent.change(name, { target: { value: 'Edited row' } });
    expect(updateRenderSetMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Save status' }).textContent).toBe('Unsaved changes');
    await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(updateRenderSetMock.mock.calls[0]?.[1]).toMatchObject({ expectedRevision: 1 });
    expect(
      (updateRenderSetMock.mock.calls[0]?.[1] as { rows: Array<{ label: string }> }).rows[0]?.label,
    ).toBe('Edited row');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Save status' }).textContent).toMatch(/^Saved · /),
    );
    // Leaving now asks nothing: there is nothing unsaved.
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(false);
  });

  test('leaving with an edit not saved yet asks the browser to ask', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    fireEvent.change(await screen.findByDisplayValue('Newest row'), {
      target: { value: 'Edited row' },
    });
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
  });

  test('the same row changed elsewhere pauses autosave behind a choice, and overwrites nothing', async () => {
    withSavedSets();
    const theirs = {
      ...NEWEST,
      revision: 2,
      rows: [{ ...NEWEST.rows[0]!, label: 'Their row' }],
    };
    updateRenderSetMock.mockImplementationOnce(async () => {
      throw new Error('render_set_revision_conflict');
    });
    const getRenderSet = (await import('@/StudioCanvas/nodes/api-render/apiRendersApi'))
      .apiRendersApi.getRenderSet as unknown as ReturnType<typeof mock>;
    const real = getRenderSet.getMockImplementation?.();
    render(<RenderRequestsGrid brandId={BRAND} />);
    fireEvent.change(await screen.findByDisplayValue('Newest row'), {
      target: { value: 'My row' },
    });
    SAVED_SETS[0] = theirs as typeof NEWEST;
    try {
      const banner = await screen.findByRole(
        'region',
        { name: 'Changed elsewhere' },
        { timeout: 4000 },
      );
      expect(within(banner).getByRole('button', { name: 'Load their version' })).toBeTruthy();
      expect(screen.getByDisplayValue('My row')).toBeTruthy();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      expect(updateRenderSetMock).toHaveBeenCalledTimes(1);
      fireEvent.click(within(banner).getByRole('button', { name: 'Load their version' }));
      expect(await screen.findByDisplayValue('Their row')).toBeTruthy();
    } finally {
      SAVED_SETS[0] = NEWEST;
      if (real) getRenderSet.mockImplementation(real);
    }
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

  test('a set saved for an earlier template opens fitted to this one, says what it drops, and Update set moves it', async () => {
    const olderTemplate = {
      ...NEWEST,
      contractHash: 'old-hash',
      rows: [{ ...NEWEST.rows[0]!, overrides: { headline: 'Hola mundo', subtitle: 'Gone now' } }],
    };
    listRenderSetsMock.mockImplementation(async () => ({
      items: [olderTemplate],
      nextCursor: null,
    }));
    updateRenderSetMock.mockImplementationOnce(async (_id, input) => ({
      ...olderTemplate,
      contractHash: input.contractHash as string,
      rows: input.rows as typeof olderTemplate.rows,
      revision: 2,
    }));
    render(<RenderRequestsGrid brandId={BRAND} />);

    const banner = await screen.findByRole('region', { name: 'Older template' });
    expect(banner.textContent).toContain('subtitle field');
    expect(
      within(screen.getByRole('list', { name: 'Render sets' })).getByText('Older template'),
    ).toBeTruthy();
    // The drop is the person's call: Render stays shut until the set is updated.
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Render 1/ }).disabled).toBe(true);

    fireEvent.click(within(banner).getByRole('button', { name: 'Update set' }));
    await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1));
    const sent = updateRenderSetMock.mock.calls[0]![1] as {
      contractHash: string;
      rows: Array<{ overrides: Record<string, unknown> }>;
    };
    expect(sent.contractHash).toBe('hash');
    expect(sent.rows[0]!.overrides).toEqual({ headline: 'Hola mundo' });
    await waitFor(() =>
      expect(screen.queryAllByRole('region', { name: 'Older template' })).toHaveLength(0),
    );
  });

  test('a set from an earlier template that loses nothing needs no banner; its next save moves it', async () => {
    listRenderSetsMock.mockImplementation(async () => ({
      items: [{ ...NEWEST, contractHash: 'old-hash' }],
      nextCursor: null,
    }));
    updateRenderSetMock.mockImplementationOnce(async (_id, input) => ({
      ...NEWEST,
      contractHash: input.contractHash as string,
      revision: 2,
    }));
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    expect(screen.queryAllByRole('region', { name: 'Older template' })).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Save (unsaved edits)' }));
    await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1));
    expect(updateRenderSetMock.mock.calls[0]![1]).toMatchObject({ contractHash: 'hash' });
  });

  test('emptying a fork’s cell blanks it instead of bringing the parent’s value back', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '9.5' } });
    await openMenu('Row actions for Base', 'Add variation');
    await screen.findByDisplayValue('Base · B');
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

  test('delete is instant and says what went, variations included; Undo on its toast brings the rows back', async () => {
    const toasts: Array<{ title: string; undo?: () => void }> = [];
    const unregister = registerToastSink(({ title, action }) => {
      toasts.push({ title: String(title), undo: action?.onClick });
    });
    toasts.length = 0;
    try {
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Hola mundo');
      await openMenu('Add', 'Blank row');
      await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(2));
      for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);
      const selection = screen.getByRole('region', { name: 'Selected rows' });
      fireEvent.click(within(selection).getByRole('button', { name: 'Delete' }));
      expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
      await waitFor(() => expect(screen.queryAllByLabelText('Row name')).toHaveLength(0));
      expect(toasts.at(-1)?.title).toBe('Deleted 2 rows');

      act(() => toasts.at(-1)?.undo?.());
      await waitFor(() => expect(screen.getAllByLabelText('Row name')).toHaveLength(2));
      expect(screen.getByDisplayValue('Base')).toBeTruthy();

      await openMenu('Row actions for Base', 'Add variation');
      await screen.findByDisplayValue('Base · B');
      await openMenu('Row actions for Base', 'Delete');
      await waitFor(() => expect(screen.getAllByLabelText('Row name')).toHaveLength(1));
      expect(toasts.at(-1)?.title).toBe('Deleted 1 row, 1 variation included');
    } finally {
      unregister();
    }
  });

  test('right-click on a row offers exactly its ⋯ menu; a header hides and shows columns', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const labels = async () =>
      (await screen.findAllByRole('menuitem')).map((item) => item.textContent?.trim());

    fireEvent.click(screen.getByRole('button', { name: 'Row actions for Base' }));
    const dotMenu = await labels();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));

    const baseRow = screen.getByDisplayValue('Base').closest('tr')!;
    fireEvent.contextMenu(within(baseRow).getByRole('button', { name: 'Drag Base' }));
    expect(await labels()).toEqual(dotMenu);
    expect(dotMenu).toEqual([
      'Rename',
      'Add variation',
      'Add row below',
      'Generate with AI',
      'Copy',
      'Save as inputs',
      'Delete',
    ]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));

    fireEvent.contextMenu(screen.getByRole('columnheader', { name: /Price/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide column' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('columnheader', { name: /Price/ })).toHaveLength(0),
    );
    fireEvent.contextMenu(screen.getByRole('columnheader', { name: /Headline/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show all columns (1 hidden)' }));
    await waitFor(() =>
      expect(screen.getAllByRole('columnheader', { name: /Price/ })).toHaveLength(1),
    );
  });

  test('“Generate with AI” drafts straight from the menu: no dialog, and pictures stay put', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');

    fireEvent.click(screen.getByRole('button', { name: 'Row actions for Base' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Generate with AI' }));
    const presets = (await screen.findAllByRole('menuitem')).map((item) => item.textContent?.trim());
    expect(presets).toEqual(
      expect.arrayContaining(['3 variations', '6 variations', '12 variations', 'With a brief…']),
    );

    fireEvent.click(await screen.findByRole('menuitem', { name: '6 variations' }));
    await waitFor(() => expect(suggestRowsMock).toHaveBeenCalled());
    const sent = suggestRowsMock.mock.calls.at(-1)![0] as {
      count: number;
      varyKeys: string[];
      prompt: string;
      forksPerRow: number;
      parent: { label: string };
    };
    expect(sent.count).toBe(6);
    expect(sent.forksPerRow).toBe(0);
    expect(sent.parent.label).toBe('Base');
    // Nothing was typed, and a real brief still went out — an empty one would leave the model a
    // bare "BRIEF:" header and the Library search nothing to go on.
    expect(sent.prompt.trim().length).toBeGreaterThan(0);
    // The picture slot is never in a no-typing draft: with no brief the Library search falls back
    // to the slot's own label and returns arbitrary assets that pass every downstream check.
    expect(sent.varyKeys).toEqual(['headline', 'price']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('right-click a cell varies only that cell’s own key', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');

    fireEvent.contextMenu(document.querySelector<HTMLElement>('td[data-column-id="headline"]')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Vary Headline' }));
    // Picking a preset closes the menu itself, so nothing is left portalled into the body.
    fireEvent.click(await screen.findByRole('menuitem', { name: '3 variations' }));
    await waitFor(() => expect(suggestRowsMock).toHaveBeenCalled());
    // The cursor is the detection: one key, the one it was on.
    expect((suggestRowsMock.mock.calls.at(-1)![0] as { varyKeys: string[] }).varyKeys).toEqual([
      'headline',
    ]);
  });

  test('a picture cell offers the brief instead of the presets', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');

    fireEvent.contextMenu(document.querySelector<HTMLElement>('td[data-column-id="hero"]')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Vary Hero' }));
    // Disabled with the reason, never hidden — and the brief beneath it is the way through.
    expect(
      (await screen.findByRole('menuitem', { name: '3 variations' })).getAttribute('title'),
    ).toBe('Pick pictures with a brief');
    expect(
      (await screen.findByRole('menuitem', { name: 'With a brief…' })).getAttribute('title'),
    ).not.toBe('Pick pictures with a brief');
    await closeAnyMenu();
    expect(suggestRowsMock).not.toHaveBeenCalled();
  });

  test('a field already being typed in keeps the browser’s own menu', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    const headline = await screen.findByDisplayValue('Hola mundo');
    headline.focus();
    fireEvent.mouseDown(headline, { button: 2 });
    fireEvent.contextMenu(headline);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  test('one value to the selected rows is one step: ⌘Z takes it back, ⇧⌘Z puts it again', async () => {
    const { container } = render(<RenderRequestsGrid brandId={BRAND} active />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Add', 'Blank row');
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Headline')).toHaveLength(3));
    fireEvent.change(screen.getAllByLabelText('Headline')[0]!, { target: { value: 'Summer' } });
    fireEvent.change(screen.getAllByLabelText('Headline')[1]!, { target: { value: 'Winter' } });
    for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);

    fireEvent.contextMenu(screen.getAllByLabelText('Headline')[0]!.closest('td')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Apply to 2 selected rows' }));
    await waitFor(() =>
      expect(
        screen.getAllByLabelText<HTMLInputElement>('Headline').map((input) => input.value),
      ).toEqual(['Summer', 'Summer', 'Summer']),
    );

    // A closing menu hands focus to the grid's nearest focusable ancestor — the tab's panel. The
    // shortcut is still the grid's there.
    container.tabIndex = 0;
    container.focus();
    fireEvent.keyDown(container, { key: 'z', metaKey: true });
    await waitFor(() =>
      expect(
        screen.getAllByLabelText<HTMLInputElement>('Headline').map((input) => input.value),
      ).toEqual(['Summer', 'Winter', 'Hola mundo']),
    );
    // A toast is a non-modal dialog that arrives any time; it must not swallow the shortcut.
    const toastLike = document.createElement('div');
    toastLike.setAttribute('role', 'dialog');
    toastLike.setAttribute('aria-modal', 'false');
    toastLike.setAttribute('data-open', '');
    document.body.appendChild(toastLike);
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
    toastLike.remove();
    await waitFor(() =>
      expect(
        screen.getAllByLabelText<HTMLInputElement>('Headline').map((input) => input.value),
      ).toEqual(['Summer', 'Summer', 'Summer']),
    );
  });

  test('Enter moves down a column, Shift+Enter up; ⌘D fills a cell from the row above', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Headline')).toHaveLength(2));
    const [first, second] = screen.getAllByLabelText<HTMLInputElement>('Headline');
    fireEvent.change(first!, { target: { value: 'Summer' } });

    first!.focus();
    fireEvent.keyDown(first!, { key: 'Enter' });
    expect(document.activeElement).toBe(second!);
    fireEvent.keyDown(second!, { key: 'Enter', shiftKey: true });
    expect(document.activeElement).toBe(first!);

    fireEvent.keyDown(second!, { key: 'd', metaKey: true });
    await waitFor(() =>
      expect(screen.getAllByLabelText<HTMLInputElement>('Headline')[1]!.value).toBe('Summer'),
    );
  });

  test('rows drafted with AI arrive proposed: not saved, not renderable, until kept', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    await openMenu('Add', 'Draft with AI…');
    const dialog = await screen.findByRole('dialog', { name: 'Draft rows with AI' });
    fireEvent.change(within(dialog).getByLabelText('Brief'), { target: { value: 'Summer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Draft' }));

    const banner = await screen.findByRole('region', { name: 'Proposed rows' });
    expect(banner.textContent).toContain('2 proposed rows');
    expect(screen.getByDisplayValue('Drafted · cheaper')).toBeTruthy();
    // Proposed rows make nothing to save: no edit timer, nothing written.
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(updateRenderSetMock).not.toHaveBeenCalled();
    // Selected, a proposed row cannot be rendered.
    const drafted = screen.getByDisplayValue('Drafted').closest('tr')!;
    fireEvent.click(within(drafted).getByLabelText('Select row'));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Render 1/ }).disabled).toBe(
      true,
    );

    fireEvent.click(within(banner).getByRole('button', { name: 'Keep all' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('region', { name: 'Proposed rows' })).toHaveLength(0),
    );
    await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const saved = updateRenderSetMock.mock.calls[0]?.[1] as { rows: Array<{ label: string }> };
    expect(saved.rows.map((row) => row.label)).toEqual([
      'Newest row',
      'Drafted',
      'Drafted · cheaper',
    ]);
  });

  test('Discard all takes the proposed rows back and leaves the set as it was', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    await openMenu('Add', 'Draft with AI…');
    const dialog = await screen.findByRole('dialog', { name: 'Draft rows with AI' });
    fireEvent.change(within(dialog).getByLabelText('Brief'), { target: { value: 'Summer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Draft' }));
    const banner = await screen.findByRole('region', { name: 'Proposed rows' });
    fireEvent.click(within(banner).getByRole('button', { name: 'Discard all' }));
    await waitFor(() => expect(screen.queryAllByDisplayValue('Drafted')).toHaveLength(0));
    expect(screen.getAllByLabelText('Row name')).toHaveLength(1);
    expect(screen.queryByText('(unsaved edits)')).toBeNull();
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
    const rootRow = screen.getByDisplayValue('Base').closest('tr')!;

    fireEvent.click(within(rootRow).getByRole('button', { name: 'Add variation' }));
    const variation = (await screen.findByDisplayValue('Base · B')) as HTMLInputElement;
    const variationRow = variation.closest('tr')!;
    expect(within(variationRow).getByText('inherits · 0 changed')).toBeTruthy();
    expect(variationRow.querySelectorAll('[data-guide]')).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(variation));
    const checked = (row: HTMLElement) =>
      within(row).getByLabelText('Select row').getAttribute('aria-checked');
    expect([checked(rootRow), checked(variationRow)]).toEqual(['true', 'false']);

    // Beside the variation: another variation of the same parent, at the same depth.
    fireEvent.click(within(variationRow).getByRole('button', { name: 'Row below' }));
    const sibling = (await screen.findByDisplayValue('Base · C')) as HTMLInputElement;
    expect(within(sibling.closest('tr')!).getByText('inherits · 0 changed')).toBeTruthy();
    expect(sibling.closest('tr')!.querySelectorAll('[data-guide]')).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(sibling));

    // Beside the root: a new root after its whole subtree.
    fireEvent.click(within(rootRow).getByRole('button', { name: 'Row below' }));
    await screen.findByDisplayValue('Render 4');
    expect(
      screen.getAllByLabelText<HTMLInputElement>('Row name').map((input) => input.value),
    ).toEqual(['Base', 'Base · B', 'Base · C', 'Render 4']);
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(checked(rootRow)).toBe('true');

    // What the variation changes is counted as it changes.
    fireEvent.change(within(variationRow).getByLabelText('Price'), { target: { value: '9.5' } });
    expect(within(variationRow).getByText('inherits · 1 changed')).toBeTruthy();
  });

  test('Add variation says why it is unavailable three levels down', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    let label = 'Base';
    for (const next of ['Base · B', 'Base · B · B', 'Base · B · B · B']) {
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

    await openMenu('Row actions for Base', 'Add variation');
    await screen.findByDisplayValue('Base · B');
    const inherited = screen.getByRole('button', {
      name: 'Formats 16:9, 1:1, 9:16, inherited from Base',
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
    await press('Next: delivery');
    expect(within(tray).getByRole('button', { name: 'Render 1 file' })).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Newest row'), { target: { value: 'Renamed row' } });
    expect(await within(tray).findByText('Rows changed since review')).toBeTruthy();
    expect(within(tray).queryAllByRole('button', { name: /^Render/ })).toHaveLength(0);
    // Nothing to press: the row is still being checked, so the tray waits for it.
    expect(within(tray).queryAllByRole('button', { name: 'Re-check' })).toHaveLength(0);

    // The rename re-checks the row; once it is Ready the tray saves the edit and reviews again.
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(2), { timeout: 5000 });
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
    expect(screen.queryAllByRole('columnheader', { name: 'Output' })).toHaveLength(0);
    cleanup();

    contractOverrides = { encode: { stored: null, defaults: { mp4: {}, mov: {} } } };
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    expect(screen.getByRole('columnheader', { name: 'Output' })).toBeTruthy();
  });
});
