/**
 * The render-requests grid against a mocked render API.
 *
 * What this guards is the wiring, not the pixels: a template is discovered and its contract
 * seeds a row from the designer's samples; the row's dry-run lands and the status reads Ready;
 * typing never loses focus; rows fork, save and render through dialogs. The pure row logic has
 * its own test, and the Renders ledger (RenderJobsGrid) has its own file.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';

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
    listTemplates: async () => ({ items: [TEMPLATE], nextCursor: null }),
    getContract: async () => ({
      template: TEMPLATE,
      variables: VARIABLES,
      outputs: [],
      fonts: [],
      layout: null,
      divergence: [],
    }),
    listInputSets: async () => ({ items: [], nextCursor: null }),
    createInputSet: createInputSetMock,
    listRenderSets: listRenderSetsMock,
    createRenderSet: createRenderSetMock,
    batchPreflight: async () => ({
      confirmationToken: 'batch-token',
      readiness: {
        state: 'READY',
        totalRows: 1,
        readyRows: 1,
        blockedRows: 0,
        unknownRows: 0,
        findings: [],
      },
    }),
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
// The Library picker drags the whole media stack in; the cell only needs its anchor.
mock.module('@/components/organic/primitives/MediaSelectPopover', () => ({
  MediaSelectPopover: ({ anchor }: { anchor: React.ReactNode }) => <>{anchor}</>,
}));

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { ApiError } from '@/lib/api/errors';
import { RenderRequestsGrid } from './RenderRequestsGrid';

const BRAND = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  cleanup();
  localStorage.clear();
  preflightMock.mockReset();
  preflightMock.mockImplementation(async () => READY_RESPONSE);
  listRenderSetsMock.mockClear();
  createRenderSetMock.mockClear();
  createInputSetMock.mockClear();
});

const openMenu = async (trigger: string | RegExp, item: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: trigger }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
};

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
    await waitFor(() => expect(screen.getByText(/BLOCKED · 0 ready · 1 blocked/)).toBeTruthy());
    expect(
      screen.getByLabelText('Headline').closest('[title="Use a permitted brand color."]'),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Render 1/ }).disabled).toBe(true);
  });

  test('refuses a whole paste above the fifty-row cap', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const paste = (count: number) =>
      fireEvent.paste(screen.getByRole('table'), {
        clipboardData: {
          getData: () =>
            ['headline', ...Array.from({ length: count }, (_, index) => `Row ${index}`)].join('\n'),
        },
      });
    paste(50);
    expect(screen.getAllByLabelText('Select row')).toHaveLength(1);
    paste(49);
    expect(screen.getAllByLabelText('Select row')).toHaveLength(50);
    paste(1);
    expect(screen.getAllByLabelText('Select row')).toHaveLength(50);
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
    for (const item of [/Blank row/, /Fork selected/, /Duplicate selected/, /From saved inputs/])
      expect(await screen.findByRole('menuitem', { name: item })).toBeTruthy();
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
    for (const item of ['Rename', 'Fork', 'Duplicate', 'Save as inputs', 'Delete'])
      expect(await screen.findByRole('menuitem', { name: item })).toBeTruthy();
  });

  test('forks a selected row with a readable name and distinguishes clear from reset to inheritance', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
    expect(screen.getByText('1 selected')).toBeTruthy();
    const selection = screen.getByRole('region', { name: 'Selected rows' });
    fireEvent.click(within(selection).getByRole('button', { name: 'Fork' }));

    expect(await screen.findByDisplayValue('Root · B')).toBeTruthy();
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(2);
    expect(screen.getByText('1 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear inherited Headline' }));
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Headline to inherited' }));
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(2);

    // A second fork of the same parent takes the next letter.
    await openMenu('Row actions for Root', 'Fork');
    expect(await screen.findByDisplayValue('Root · C')).toBeTruthy();
  });

  test('"Save as inputs" on a fork saves what it renders with, inherited values included', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Row actions for Root', 'Fork');
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

      await openMenu('Render set', /New set/);
      const confirm = await screen.findByRole('alertdialog');
      expect(within(confirm).getByText('Discard unsaved edits?')).toBeTruthy();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));

      const dialog = await screen.findByRole('dialog', { name: 'New render set' });
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Summer' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(createRenderSetMock).toHaveBeenCalledTimes(1));
      expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({ name: 'Summer' });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Render set' }).textContent).toContain('Summer'),
      );
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
    expect(screen.getByText(/READY · 1 ready · 0 blocked · 0 incomplete/)).toBeTruthy();
    expect(
      screen.getByText(/New fields, hierarchy, or unexposed layout changes require/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Render 1/ }));
    // No set yet: it is named first, then saved, then handed to the pre-flight dialog.
    const naming = await screen.findByRole('dialog', { name: 'Name this render set' });
    fireEvent.change(within(naming).getByLabelText('Name'), { target: { value: 'Campaign set' } });
    fireEvent.click(within(naming).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Render 1 row')).toBeTruthy();
    expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({ name: 'Campaign set' });
    expect(onFired).not.toHaveBeenCalled();
    const next = async () => {
      const button = await screen.findByRole<HTMLButtonElement>('button', { name: 'Next' });
      await waitFor(() => expect(button.disabled).toBe(false));
      fireEvent.click(button);
    };
    await next();
    await next();
    fireEvent.click(await screen.findByRole('button', { name: /Confirm 1 render/ }));
    await waitFor(() => expect(onFired).toHaveBeenCalledWith([JOB.id]));
    await waitFor(() => expect(screen.getByDisplayValue('Root')).toBeTruthy());
  });

  test('an intent loads its render set over the newest one', async () => {
    const savedSet = (id: string, name: string, label: string) => ({
      id,
      brandId: BRAND,
      bindingId: '44444444-4444-4444-8444-444444444444',
      name,
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
    const newest = savedSet('55555555-5555-4555-8555-555555555551', 'Newest', 'Newest row');
    const older = savedSet('55555555-5555-4555-8555-555555555552', 'Older', 'Older row');
    listRenderSetsMock.mockImplementation(async () => ({
      items: [newest, older],
      nextCursor: null,
    }));

    const { rerender } = render(<RenderRequestsGrid brandId={BRAND} />);
    expect(await screen.findByDisplayValue('Newest row')).toBeTruthy();

    rerender(
      <RenderRequestsGrid brandId={BRAND} intent={{ templateKey: '133', renderSetId: older.id }} />,
    );
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(screen.queryByDisplayValue('Newest row')).toBeNull();
    listRenderSetsMock.mockImplementation(async () => ({ items: [], nextCursor: null }));
  });
});
