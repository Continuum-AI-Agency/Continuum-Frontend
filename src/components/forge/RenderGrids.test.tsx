/**
 * The render-requests grid against a mocked render API.
 *
 * What this guards is the wiring, not the pixels: a template is discovered and its contract
 * seeds a row from the designer's samples; an edit asks the server nothing and the row reads Ready;
 * typing never loses focus; rows gain variations and rows below without touching the selection;
 * sets save through dialogs and render through the review tray docked under the grid. The pure
 * row logic has its own test, the tray its own, and the Render ledger (RenderJobsGrid) its own.
 */

import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { WEB_COMPONENT_BINDING_ID } from '@continuum/contracts';
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

const BATCH_READY = {
  confirmationToken: 'batch-token',
  readiness: {
    state: 'READY',
    totalRows: 1,
    readyRows: 1,
    blockedRows: 0,
    unknownRows: 0,
    findings: [],
  },
};
const batchPreflightMock = mock(
  async (_input: { records: unknown[] }): Promise<unknown> => BATCH_READY,
);
const preflightMock = mock(
  async (_input: { variables: Record<string, unknown> }): Promise<unknown> => READY_RESPONSE,
);
// The Live kit: none by default, so the readiness line says the fit isn't measured. A kit with
// nothing to place measures everything there is, and the row reads Ready.
const EMPTY_KIT = {
  scene: { ok: true, comp: { name: 'Main', width: 1080, height: 1080 }, at: 0, layers: [] },
  variables: [],
  brandMark: null,
  comp: 'Main',
  at: 0,
  notes: [],
};
const noKit = async (): Promise<unknown> => {
  throw new Error('no live kit');
};
const livePreviewMock = mock(noKit);
/** The readiness line's one note for a template no kit measures. */
const FIT_NOTE = /Layout fit isn’t measured for this template — rows can still render/;
const listRenderSetsMock = mock(async (_brandId: string, _templateKey: string) => ({
  items: [] as unknown[],
  nextCursor: null,
}));
const listInputSetsMock = mock(async () => ({ items: [] as unknown[], nextCursor: null }));
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
const changeRevisionMock = mock(async (..._args: unknown[]): Promise<unknown> => {
  throw new Error('not in this test');
});
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
const createBatchMock = mock(
  async (_input: { confirmationToken: string }): Promise<unknown> => ({
    jobs: [JOB],
  }),
);
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
      layerSwitchesNotAsked: [],
      ...contractOverrides,
    }),
    listInputSets: listInputSetsMock,
    createInputSet: createInputSetMock,
    listRenderSets: listRenderSetsMock,
    createRenderSet: createRenderSetMock,
    updateRenderSet: updateRenderSetMock,
    deleteRenderSet: deleteRenderSetMock,
    changeRenderSetTemplateRevision: (...args: unknown[]) => changeRevisionMock(...args),
    listRenderSetRevisions: async () => ({
      items: [{ revision: 1, savedAt: new Date().toISOString(), contractHash: 'hash', rows: [] }],
    }),
    suggestRows: suggestRowsMock,
    getImportMapping: async () => null,
    saveImportMapping: async () => ({ mapping: null }),
    getRenderSet: async (_brandId: string, id: string) => SAVED_SETS.find((set) => set.id === id),
    batchPreflight: batchPreflightMock,
    listDeliveryDestinations: async () => ({
      slack: { state: 'not_connected', workspaceName: null, destinations: [] },
      meta: { connected: false, adAccountId: null, adAccountName: null },
    }),
    createBatch: (input: { confirmationToken: string }) => createBatchMock(input),
    preflight: preflightMock,
    livePreview: livePreviewMock,
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
/** What the stand-in picker hands back next; HERO_ASSET unless a test says otherwise. */
let pickedAsset: Record<string, unknown> = HERO_ASSET;
// The Library picker drags the whole media stack in; the cell only needs its anchor, and opening
// it picks `pickedAsset` the way a person choosing one would.
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
      if (open) onAttachAssets([pickedAsset]);
    }, [open]);
    return <>{anchor}</>;
  },
}));

// Spread over the real module for the same reason: only the save the Render tab makes is faked.
const templateSources = await import('@/lib/library/templateSources');
const saveTemplateVariablesMock = mock(
  async (
    _brandId: string,
    _assetId: string,
    _slots: Array<{ slotKey: string; exposed?: boolean | null }>,
  ) => {},
);
/** Published variants for the set's revision controls: the real read unless a test sets some. */
let revisionVariants: unknown[] = [];
const realRevisionVariants = templateSources.fetchTemplateRevisionVariants;
mock.module('@/lib/library/templateSources', () => ({
  ...templateSources,
  saveTemplateVariables: saveTemplateVariablesMock,
  fetchTemplateRevisionVariants: (
    ...args: Parameters<typeof templateSources.fetchTemplateRevisionVariants>
  ) =>
    revisionVariants.length
      ? Promise.resolve(args[1] ? revisionVariants : [])
      : realRevisionVariants(...args),
}));

// The grid reads the person's brand role from the brand provider; outside one, this file is an
// owner. Spread, and falling through to the real hook, because mock.module outlives this file.
const activeBrand = await import('@/components/providers/ActiveBrandProvider');
const realActiveBrandContext = activeBrand.useActiveBrandContext;
let brandRole = 'owner';
const USER = '77777777-7777-4777-8777-777777777777';
/** The signed-in user the brand context names; null is a session with no user id. */
let signedIn: string | null = USER;
mock.module('@/components/providers/ActiveBrandProvider', () => ({
  ...activeBrand,
  useActiveBrandContext: () => {
    try {
      return realActiveBrandContext();
    } catch {
      return {
        permissions: [{ brand_profile_id: BRAND, role: brandRole }],
        user: signedIn ? { id: signedIn } : null,
      };
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
import { forgetPageSession, HELD_SET, holdKeyOf } from './renderHold';

const render = (
  ui: React.ReactNode,
  // No wait between retries: the Live kit's read is retried twice before the grid says it is gone.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } }),
) => {
  return testingRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

const flushAsyncState = async () =>
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

// Base UI waits on a MutationObserver when a menu or radio opens; happy-dom's, lifted per file
// the way the review tray's own test does.
installPickerDomGlobals();

afterEach(() => {
  cleanup();
  // A held batch lives in renderHold's module memory: each test starts a fresh page session.
  forgetPageSession();
  localStorage.clear();
  preflightMock.mockReset();
  preflightMock.mockImplementation(async () => READY_RESPONSE);
  livePreviewMock.mockReset();
  livePreviewMock.mockImplementation(noKit);
  listRenderSetsMock.mockReset();
  listRenderSetsMock.mockImplementation(async () => ({ items: [], nextCursor: null }));
  listInputSetsMock.mockReset();
  listInputSetsMock.mockImplementation(async () => ({ items: [], nextCursor: null }));
  createRenderSetMock.mockClear();
  updateRenderSetMock.mockClear();
  deleteRenderSetMock.mockClear();
  createInputSetMock.mockClear();
  suggestRowsMock.mockClear();
  batchPreflightMock.mockReset();
  batchPreflightMock.mockImplementation(async () => BATCH_READY);
  createBatchMock.mockReset();
  createBatchMock.mockImplementation(async () => ({ jobs: [JOB] }));
  extraTemplates = [];
  contractOverrides = {};
  pickedAsset = HERO_ASSET;
  brandRole = 'owner';
  signedIn = USER;
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
  await waitFor(() => expect(document.querySelectorAll('[role="menu"][data-open]').length).toBe(0));
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
  test('keeps outage edits when render-set and input-set lists fail, then retries without auto-creating Untitled', async () => {
    listRenderSetsMock.mockImplementationOnce(async () => {
      throw new Error('render sets offline');
    });
    listRenderSetsMock.mockImplementationOnce(async () => ({ items: [NEWEST], nextCursor: null }));
    listInputSetsMock.mockImplementationOnce(async () => {
      throw new Error('input sets offline');
    });
    render(<RenderRequestsGrid brandId={BRAND} />);
    const headline = (await screen.findByDisplayValue('Hola mundo')) as HTMLInputElement;
    expect(await screen.findByText('Saved render sets could not be loaded')).toBeTruthy();
    expect(await screen.findByText('Input sets could not be loaded')).toBeTruthy();

    fireEvent.change(headline, { target: { value: 'Outage edit' } });
    await act(async () => await new Promise((resolve) => setTimeout(resolve, 1700)));
    expect(createRenderSetMock).not.toHaveBeenCalled();

    const setAlert = screen
      .getByText('Saved render sets could not be loaded')
      .closest('[role="alert"]')!;
    fireEvent.click(within(setAlert).getByRole('button', { name: 'Retry' }));
    await flushAsyncState();
    expect(screen.queryByText('Saved render sets could not be loaded')).toBeNull();
    const inputAlert = screen
      .getByText('Input sets could not be loaded')
      .closest('[role="alert"]')!;
    fireEvent.click(within(inputAlert).getByRole('button', { name: 'Retry' }));
    await flushAsyncState();
    expect(screen.queryByText('Input sets could not be loaded')).toBeNull();
    expect(screen.getByDisplayValue('Outage edit')).toBeTruthy();
    await act(async () => await new Promise((resolve) => setTimeout(resolve, 1700)));
    expect(createRenderSetMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'New set' }));
    await confirmDialog('Discard');
    const dialog = await screen.findByRole('dialog', { name: 'New render set' });
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Recovered work' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(createRenderSetMock).toHaveBeenCalledTimes(1));
    expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({
      name: 'Recovered work',
      rows: [{ overrides: { headline: 'Outage edit' } }],
    });
    expect(screen.getByDisplayValue('Outage edit')).toBeTruthy();
  }, 10_000);

  test('a failed explicitly named set creation leaves the outage draft on screen', async () => {
    listRenderSetsMock.mockImplementationOnce(async () => {
      throw new Error('render sets offline');
    });
    createRenderSetMock.mockImplementationOnce(async () => {
      throw new Error('create failed');
    });
    render(<RenderRequestsGrid brandId={BRAND} />);
    const headline = (await screen.findByDisplayValue('Hola mundo')) as HTMLInputElement;
    await screen.findByText('Saved render sets could not be loaded');
    fireEvent.change(headline, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save (unsaved edits)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save render set' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Named draft' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save set' }));
    await waitFor(() => expect(createRenderSetMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog', { name: 'Save render set' })).toBeTruthy();
    expect(screen.getByDisplayValue('Keep this draft')).toBeTruthy();
  });

  test('a successful empty retry restores first-use autosave', async () => {
    listRenderSetsMock.mockImplementationOnce(async () => {
      throw new Error('render sets offline');
    });
    render(<RenderRequestsGrid brandId={BRAND} />);
    const headline = (await screen.findByDisplayValue('Hola mundo')) as HTMLInputElement;
    const alert = await screen.findByText('Saved render sets could not be loaded');
    fireEvent.change(headline, { target: { value: 'Recovered empty list' } });
    fireEvent.click(
      within(alert.closest('[role="alert"]')!).getByRole('button', { name: 'Retry' }),
    );

    await flushAsyncState();
    expect(screen.queryByText('Saved render sets could not be loaded')).toBeNull();
    await waitFor(() => expect(createRenderSetMock).toHaveBeenCalledTimes(1), { timeout: 4_000 });
    expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({ name: 'Untitled set' });
    expect(screen.getByDisplayValue('Recovered empty list')).toBeTruthy();
  }, 10_000);

  test('a pristine retry opens the requested inventory set', async () => {
    listRenderSetsMock.mockImplementationOnce(async () => {
      throw new Error('render sets offline');
    });
    listRenderSetsMock.mockImplementationOnce(async () => ({ items: [NEWEST], nextCursor: null }));
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const alert = await screen.findByText('Saved render sets could not be loaded');
    fireEvent.click(
      within(alert.closest('[role="alert"]')!).getByRole('button', { name: 'Retry' }),
    );

    expect(await screen.findByDisplayValue('Newest row')).toBeTruthy();
    expect(openSetName()).toBe('Newest');
    expect(screen.queryByText('Saved render sets could not be loaded')).toBeNull();
  });

  test('a typed draft survives retry when saved sets exist and requires an explicit choice', async () => {
    listRenderSetsMock.mockImplementationOnce(async () => {
      throw new Error('render sets offline');
    });
    listRenderSetsMock.mockImplementationOnce(async () => ({ items: [NEWEST], nextCursor: null }));
    render(<RenderRequestsGrid brandId={BRAND} />);
    const headline = (await screen.findByDisplayValue('Hola mundo')) as HTMLInputElement;
    const alert = await screen.findByText('Saved render sets could not be loaded');
    fireEvent.change(headline, { target: { value: 'Typed during outage' } });
    fireEvent.click(
      within(alert.closest('[role="alert"]')!).getByRole('button', { name: 'Retry' }),
    );

    expect(
      await screen.findByText('Your edited rows are not assigned to a saved set'),
    ).toBeTruthy();
    expect(screen.getByDisplayValue('Typed during outage')).toBeTruthy();
    expect(screen.queryByDisplayValue('Newest row')).toBeNull();
    expect(createRenderSetMock).not.toHaveBeenCalled();
  });

  test('a successful named create does not hide the failed inventory retry', async () => {
    listRenderSetsMock.mockImplementationOnce(async () => {
      throw new Error('render sets offline');
    });
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const alert = await screen.findByText('Saved render sets could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'New set' }));
    const dialog = await screen.findByRole('dialog', { name: 'New render set' });
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Explicit while offline' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createRenderSetMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Saved render sets could not be loaded')).toBeTruthy();
    expect(
      within(alert.closest('[role="alert"]')!).getByRole('button', { name: 'Retry' }),
    ).toBeTruthy();
  });

  test('a delayed retry after a template switch cannot replace the new template inventory', async () => {
    const secondTemplate = {
      ...TEMPLATE,
      key: '222',
      name: 'forge_bench_other',
      displayName: 'Other template',
    };
    const secondSet = {
      ...savedSet('55555555-5555-4555-8555-555555555553', 'Other set', 'Other row'),
      templateKey: '222',
    };
    extraTemplates = [];
    let resolveDelayed!: (response: { items: unknown[]; nextCursor: null }) => void;
    const delayed = new Promise<{ items: unknown[]; nextCursor: null }>((resolve) => {
      resolveDelayed = resolve;
    });
    let firstTemplateRead = true;
    listRenderSetsMock.mockImplementation(async (_brandId, key) => {
      if (key === '133') {
        if (firstTemplateRead) {
          firstTemplateRead = false;
          throw new Error('render sets offline');
        }
        return delayed;
      }
      return { items: [secondSet], nextCursor: null };
    });
    const view = render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const alert = await screen.findByText('Saved render sets could not be loaded');
    fireEvent.click(
      within(alert.closest('[role="alert"]')!).getByRole('button', { name: 'Retry' }),
    );

    extraTemplates = [secondTemplate];
    view.rerender(
      <RenderRequestsGrid
        brandId={BRAND}
        intent={{ templateKey: '222', bindingId: TEMPLATE.bindingId }}
      />,
    );
    expect(await screen.findByDisplayValue('Other row')).toBeTruthy();
    resolveDelayed({ items: [NEWEST], nextCursor: null });
    await waitFor(() => expect(screen.getByDisplayValue('Other row')).toBeTruthy());
    expect(screen.queryByDisplayValue('Newest row')).toBeNull();
    expect(openSetName()).toBe('Other set');
  });

  test('Render reviews the selected rows that can render; an invalid one is skipped, with why', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(2));
    fireEvent.change(screen.getAllByLabelText('Headline')[1]!, { target: { value: '' } });
    for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);
    expect(
      await screen.findByText('1 selected row can’t render and is skipped; the review lists why'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Render 1 row · 1 file' }));
    const skipped = await screen.findByRole('list', { name: 'Rows skipped from this batch' });
    expect(skipped.textContent).toContain('Required');
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalled());
    expect(
      (batchPreflightMock.mock.calls.at(-1)?.[0] as { records: unknown[] }).records,
    ).toHaveLength(1);
    // Still said at Deliver, where the person decides to render without it.
    await press('Next: delivery');
    expect(
      (await screen.findByRole('list', { name: 'Rows skipped from this batch' })).textContent,
    ).toContain('Required');
    expect(
      screen
        .getAllByLabelText('Select row')
        .every((box) => box.getAttribute('aria-checked') === 'true'),
    ).toBe(true);
  });

  test('a refused review asks each row once which one refuses; it reads Won’t render and is skipped', async () => {
    const palette = 'Use a permitted brand color.';
    const fonts = 'Card A requires Brand Sans. Upload it in Library → Typography.';
    // Today's batch preflight refuses the whole batch and names no row; without the off-palette
    // row it refuses on the missing face alone, until the person accepts substitutes.
    batchPreflightMock.mockImplementation(async (input) => {
      const { records, acceptMissingFonts } = input as {
        records: unknown[];
        acceptMissingFonts?: boolean;
      };
      if (acceptMissingFonts) return BATCH_READY;
      throw records.length === 3
        ? new ApiError('render_brand_guardrail_blocked', 422, undefined, {
            guardrails: [
              { code: 'BRAND_COLOR_OUTSIDE_PALETTE', severity: 'block', message: palette },
            ],
          })
        : new ApiError('render_fonts_missing', 422, undefined, {
            guardrails: [{ code: 'TEMPLATE_FONT_MISSING', severity: 'block', message: fonts }],
          });
    });
    preflightMock.mockImplementation(async (input) => {
      if (input.variables.headline === 'Off palette')
        throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
          guardrails: [
            {
              code: 'BRAND_COLOR_OUTSIDE_PALETTE',
              severity: 'block',
              variableKey: 'headline',
              message: palette,
            },
          ],
        });
      if (input.variables.headline === 'Missing face')
        throw new ApiError('render_fonts_missing', 422, undefined, { detail: fonts });
      return READY_RESPONSE;
    });
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(2));
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(3));
    const headline = (index: number) => screen.getAllByLabelText('Headline')[index]!;
    fireEvent.change(headline(1), { target: { value: 'Off palette' } });
    fireEvent.change(headline(2), { target: { value: 'Missing face' } });
    for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: /^Render 3 rows/ }));

    // One pass over the refused batch, one preflight per row.
    await waitFor(() => expect(preflightMock).toHaveBeenCalledTimes(3));
    const offPalette = () => headline(1).closest('tr')!;
    expect(await within(offPalette()).findByText('Won’t render')).toBeTruthy();
    // The reason is read on the row, not only on hover.
    expect(within(offPalette()).getByText(palette)).toBeTruthy();
    // Missing faces still render, in substitutes, once Render anyway is pressed: the row says so.
    const fontRow = () => headline(2).closest('tr')!;
    expect(within(fontRow()).getByText('Fonts missing')).toBeTruthy();
    expect(within(fontRow()).getByText(/Needs Render anyway in the review/)).toBeTruthy();
    // The review goes on with the rows that render, and lists the one that will not: one line.
    const skippedLines = async () =>
      within(
        await screen.findByRole('list', { name: 'Rows skipped from this batch' }),
      ).getAllByRole('listitem');
    let lines = await skippedLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toContain(palette);
    expect(lines[0]?.textContent).not.toContain('Won’t render');
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(2));
    expect(
      (batchPreflightMock.mock.calls.at(-1)?.[0] as { records: unknown[] }).records,
    ).toHaveLength(2);

    // Render itself does the same from the toolbar: the 2 that can render, the refused 1 skipped.
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('region', { name: 'Review and render' })).toHaveLength(0),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Render 2 rows · 2 files' }));
    await screen.findByRole('region', { name: 'Review and render' });
    lines = await skippedLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toContain(palette);
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(3));
    expect(
      (batchPreflightMock.mock.calls.at(-1)?.[0] as { records: unknown[] }).records,
    ).toHaveLength(2);
    // A font refusal names no row to find; the tray's own override is the way past it.
    expect(preflightMock).toHaveBeenCalledTimes(3);
    expect(within(fontRow()).getByText('Fonts missing')).toBeTruthy();
    // Once a review passes for that row, what the pass found about it is out of date.
    await press('Render anyway');
    // Lengths, not toBeNull: a failing element assert inside waitFor pretty-prints the fiber graph.
    await waitFor(() => expect(within(fontRow()).queryAllByText('Fonts missing')).toHaveLength(0), {
      timeout: 5000,
    });

    // An edit retires what was found about that row, and asks the server nothing.
    fireEvent.change(headline(1), { target: { value: 'On palette' } });
    await waitFor(() =>
      expect(within(offPalette()).queryAllByText(/Won’t render/)).toHaveLength(0),
    );
    await act(async () => await new Promise((resolve) => setTimeout(resolve, 1000)));
    expect(preflightMock).toHaveBeenCalledTimes(3);
  }, 30_000);

  describe('a refused review that its rows’ own checks cannot pin on a row', () => {
    const palette = 'Use a permitted brand color.';
    /** `refuse` is each row's own preflight answer for the 'Missing face' row: null passes. */
    const setup = async (refuse: (() => ApiError) | null) => {
      // Refused whole, every time: the per-row pass can never make it pass.
      batchPreflightMock.mockImplementation(async () => {
        throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
          guardrails: [
            { code: 'BRAND_COLOR_OUTSIDE_PALETTE', severity: 'block', message: palette },
          ],
        });
      });
      preflightMock.mockImplementation(async (input) => {
        if (refuse && input.variables.headline === 'Missing face') throw refuse();
        return READY_RESPONSE;
      });
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Hola mundo');
      await openMenu('Add', 'Blank row');
      await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(2));
      await openMenu('Add', 'Blank row');
      await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(3));
      const headline = (index: number) => screen.getAllByLabelText('Headline')[index]!;
      // A font row, and an invalid one the review skips.
      fireEvent.change(headline(1), { target: { value: 'Missing face' } });
      fireEvent.change(headline(2), { target: { value: '' } });
      for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);
      fireEvent.click(await screen.findByRole('button', { name: 'Render 2 rows · 2 files' }));
      const tray = await screen.findByRole('region', { name: 'Review and render' });
      await waitFor(() => expect(preflightMock).toHaveBeenCalledTimes(2));
      // Long enough for any reopen, re-review and second pass to have happened.
      await act(async () => await new Promise((resolve) => setTimeout(resolve, 1500)));
      return { tray, headline };
    };

    test('every row passes on its own: nothing is found, nothing reopens, the refusal stays', async () => {
      const { tray, headline } = await setup(null);
      expect(preflightMock).toHaveBeenCalledTimes(2);
      expect(batchPreflightMock).toHaveBeenCalledTimes(1);
      expect(await within(tray).findByText(palette)).toBeTruthy();
      // Every row passes alone, and alone is with no delivery: the batch's delivery was refused,
      // with the server's reason. No row is blamed; Change delivery leads, Check again stays.
      expect(
        await within(tray).findByText(/^The render service refused this batch’s delivery: /),
      ).toBeTruthy();
      expect(within(tray).getByRole('button', { name: 'Change delivery' })).toBeTruthy();
      expect(within(tray).getByRole('button', { name: 'Check again' })).toBeTruthy();
      expect(within(tray).queryAllByRole('button', { name: 'Retry' })).toHaveLength(0);
      expect(tray.textContent).not.toContain('nothing in the grid is marked');
      expect(
        within(headline(1).closest('tr')!).queryAllByText(/Fonts missing|Won’t render/),
      ).toHaveLength(0);
    }, 30_000);

    test('a row its own check could not reach is said so, never as passing; Check again asks again', async () => {
      const { tray, headline } = await setup(
        () => new ApiError('Service Unavailable', 503, undefined, { error: 'Service Unavailable' }),
      );
      expect(await within(tray).findByText('Couldn’t check 1 row.')).toBeTruthy();
      expect(within(tray).queryAllByRole('button', { name: 'Change delivery' })).toHaveLength(0);
      expect(
        within(headline(1).closest('tr')!).queryAllByText(/Fonts missing|Won’t render/),
      ).toHaveLength(0);
      fireEvent.click(within(tray).getByRole('button', { name: 'Check again' }));
      await waitFor(() => expect(preflightMock).toHaveBeenCalledTimes(4));
    }, 30_000);

    test('one refused row: the review goes on with the others by itself, Next open, 1 skipped', async () => {
      batchPreflightMock.mockImplementation(async (input) => {
        if ((input as { records: unknown[] }).records.length > 1)
          throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
            guardrails: [
              { code: 'BRAND_COLOR_OUTSIDE_PALETTE', severity: 'block', message: 'Off.' },
            ],
          });
        return BATCH_READY;
      });
      preflightMock.mockImplementation(async (input) => {
        if (input.variables.headline === 'Off palette')
          throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
            guardrails: [
              { code: 'BRAND_COLOR_OUTSIDE_PALETTE', severity: 'block', message: 'Off.' },
            ],
          });
        return READY_RESPONSE;
      });
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Hola mundo');
      await openMenu('Add', 'Blank row');
      await waitFor(() => expect(screen.getAllByLabelText('Select row')).toHaveLength(2));
      fireEvent.change(screen.getAllByLabelText('Headline')[1]!, {
        target: { value: 'Off palette' },
      });
      for (const box of screen.getAllByLabelText('Select row')) fireEvent.click(box);
      fireEvent.click(screen.getByRole('button', { name: /^Render 2 rows/ }));
      const tray = await screen.findByRole('region', { name: 'Review and render' });
      // No toolbar step: the refused row is found and left out, and the review of the other passes.
      await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(
          within(tray).getByRole<HTMLButtonElement>('button', { name: 'Next: delivery' }).disabled,
        ).toBe(false),
      );
      const skipped = within(tray).getByRole('list', { name: 'Rows skipped from this batch' });
      expect(within(skipped).getAllByRole('listitem')).toHaveLength(1);
      expect(preflightMock).toHaveBeenCalledTimes(2);
    }, 30_000);

    test('a 422 about the set, not the row, marks no row and says to reload the set', async () => {
      const { tray, headline } = await setup(
        () =>
          new ApiError('render_set_revision_conflict', 422, undefined, {
            error: 'render_set_revision_conflict',
            message: 'The set changed since this review.',
          }),
      );
      expect(
        await within(tray).findByText(
          'This set changed somewhere else. Reload it, then Check again.',
        ),
      ).toBeTruthy();
      expect(tray.textContent).not.toMatch(/Couldn’t check/);
      // The set moved: that line alone, not the batch's headline or its findings as well.
      expect(within(tray).queryAllByRole('button', { name: 'Change delivery' })).toHaveLength(0);
      expect(tray.textContent).not.toContain('refused this batch');
      expect(tray.textContent).not.toContain(palette);
      expect(
        within(headline(1).closest('tr')!).queryAllByText(/Fonts missing|Won’t render/),
      ).toHaveLength(0);
    }, 30_000);

    test('a font row found on its own reopens nothing: the rows under review are the same', async () => {
      const { tray, headline } = await setup(
        () =>
          new ApiError('render_fonts_missing', 422, undefined, {
            detail: 'Card A requires Brand Sans.',
          }),
      );
      expect(await within(headline(1).closest('tr')!).findByText('Fonts missing')).toBeTruthy();
      // One pass, one review: no loop of re-reviews and re-passes.
      expect(preflightMock).toHaveBeenCalledTimes(2);
      expect(batchPreflightMock.mock.calls.length).toBeLessThanOrEqual(2);
      expect(await within(tray).findByText(palette)).toBeTruthy();
    }, 30_000);
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
    expect(await screen.findByText(FIT_NOTE, undefined, { timeout: 3000 })).toBeTruthy();

    fireEvent.change(headline, { target: { value: '' } });
    const status = await screen.findByText('Needs input');
    expect(within(status.closest('td')!).getByText('Fill in Headline')).toBeTruthy();
    expect(screen.queryAllByText('Invalid')).toHaveLength(0);
    // The blank cell is not painted as an error; the row says what it waits for.
    expect(headline.classList.contains('border-destructive')).toBe(false);
    expect(
      screen.getByText(
        '0 of 1 row can render · 1 needs input · Layout fit isn’t measured for this template — rows can still render',
      ),
    ).toBeTruthy();
  });

  // UTEC 2026-09-29: a switch read Off whether the file had the layer on or not, and said
  // nothing about what Off meant. A layer switch says Shown/Hidden; any other checkbox On/Off.
  test('a layer switch says Shown or Hidden; another checkbox On or Off; unknown says As designed', async () => {
    contractOverrides = {
      variables: [
        ...VARIABLES,
        variable({
          key: 'show_carrera',
          label: 'Show Carrera',
          kind: 'boolean',
          sample: 'false',
          sourceSlotKey: 'boolean__show-carrera',
        }),
        variable({
          key: 'dark_mode',
          label: 'Dark mode',
          kind: 'boolean',
          sample: 'true',
          sourceSlotKey: 'boolean__dark-mode',
        }),
        variable({
          key: 'show_badge',
          label: 'Show Badge',
          kind: 'boolean',
          sample: null,
          sourceSlotKey: 'boolean__show-badge',
        }),
      ],
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    const carrera = await screen.findByRole('switch', { name: 'Show Carrera' });
    const cell = carrera.parentElement as HTMLElement;
    expect(within(cell).getByText('Hidden')).toBeTruthy();
    fireEvent.click(carrera);
    await waitFor(() => expect(within(cell).getByText('Shown')).toBeTruthy());
    const dark = screen.getByRole('switch', { name: 'Dark mode' }).parentElement as HTMLElement;
    expect(within(dark).getByText('On')).toBeTruthy();
    const badge = screen.getByRole('switch', { name: 'Show Badge' }).parentElement as HTMLElement;
    expect(within(badge).getByText('As designed')).toBeTruthy();
  });

  // UTEC 2026-09-29: the career switch was hidden from Render and found by SQL. A layer switch
  // no row can change is offered from Add, and one click makes it a column that starts as designed.
  test('a hidden layer switch requires a saved template revision instead of mutating published bytes', async () => {
    const carrera = variable({
      key: 'show_carrera',
      label: 'Show Carrera',
      kind: 'boolean',
      sample: 'true',
      sourceSlotKey: 'boolean__show-carrera',
      exposed: false,
    });
    const withSource = { ...TEMPLATE, sourceAssetId: '55555555-5555-4555-8555-555555555555' };
    contractOverrides = { template: withSource, layerSwitchesNotAsked: [carrera] };
    const messages: string[] = [];
    const unsubscribe = registerToastSink(({ title }) => {
      messages.push(String(title));
    });
    messages.length = 0;
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByLabelText('Headline');
    expect(screen.queryByRole('switch', { name: 'Show Carrera' })).toBeNull();

    const toolbar = screen.getByRole('toolbar', { name: 'Render' });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Add' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Switch a layer per row/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show Carrera' }));

    expect(saveTemplateVariablesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('switch', { name: 'Show Carrera' })).toBeNull();
    expect(messages).toContain(
      'Open Edit layers to expose this field, save a template revision, then publish it.',
    );
    unsubscribe();
  });

  test('a layer switch no row has set reads as the file shows it, labelled Default', async () => {
    const carrera = variable({
      key: 'show_carrera',
      label: 'Show Carrera',
      kind: 'boolean',
      sample: 'true',
      sourceSlotKey: 'boolean__show-carrera',
      exposed: false,
    });
    contractOverrides = {
      template: { ...TEMPLATE, sourceAssetId: '55555555-5555-4555-8555-555555555555' },
      variables: [...VARIABLES, carrera],
      layerSwitchesNotAsked: [carrera],
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    const cell = (await screen.findByRole('switch', { name: 'Show Carrera' }))
      .parentElement as HTMLElement;
    // Existing rows never set it: preserve the file's shown default and label it as the default.
    expect(within(cell).getByText('Shown')).toBeTruthy();
    expect(within(cell).getByText('Default')).toBeTruthy();
  });

  test('a paste onto the grid is reviewed like a sheet: its fields, its errors, its row cap', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const paste = async (text: string) => {
      fireEvent.paste(screen.getByRole('table'), { clipboardData: { getData: () => text } });
      return screen.findByRole('dialog', { name: 'Import render rows' });
    };
    const importButton = (dialog: HTMLElement) =>
      within(dialog).getByRole<HTMLButtonElement>('button', { name: /^Import \d+ rows$/ });

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

    // Parent and Formats are columns a paste understands too; a bad cell is named, and imports
    // empty rather than holding the other rows back.
    dialog = await paste(
      'Name\tParent\tHeadline\tPrice\nSpain\t\tHola\tcheap\nSale\tSpain\tRebajas\t\n',
    );
    expect(within(dialog).getByText('Row 1 · Price: Not a number — imported empty')).toBeTruthy();
    await waitFor(() => expect(importButton(dialog).disabled).toBe(false));
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

  test('discovers the one template, seeds a row from the samples, and asks no preflight', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    const cell = await screen.findByLabelText('Headline');
    expect((cell as HTMLInputElement).value).toBe('Hola mundo');
    // The template picker names the template, never its build name.
    expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain(
      'StarCraft Promo',
    );
    // Reference length must not look like an enforced character limit.
    expect(screen.queryByText('10/12')).toBeNull();
    // No Live kit here: nothing measured the fit, so no row is called Ready, and none wears a
    // badge for it either: the readiness line says so once.
    expect(await screen.findByText(FIT_NOTE)).toBeTruthy();
    expect(screen.queryByText(/^Can render/)).toBeNull();
    expect(screen.queryByText('Not checked')).toBeNull();
    expect(preflightMock).not.toHaveBeenCalled();
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

  test('typing 20 characters keeps focus in text, number and name cells while another row changes', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    // A second row, so a state update lands for REAL — a re-render — while the first row is being
    // typed in.
    await openMenu('Add', 'Blank row');
    await waitFor(() => expect(screen.getAllByLabelText('Row name')).toHaveLength(2));
    const second = () => screen.getAllByLabelText('Headline')[1] as HTMLInputElement;

    const typeWhileALandedCheckArrives = async (
      input: HTMLInputElement,
      text: string,
      tag: string,
    ) => {
      input.focus();
      let typed = input.value;
      for (const [index, char] of [...text].entries()) {
        typed += char;
        fireEvent.change(input, { target: { value: typed } });
        if (index === 9) {
          // The other row changes mid-word and the grid re-renders under the person typing.
          await act(async () => {
            fireEvent.change(second(), { target: { value: tag } });
          });
          expect(second().value).toBe(tag);
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
    // Sixty keystrokes, each a full grid render: room to spare on a shared, loaded machine.
  }, 15_000);

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

  test('the side inspector follows inherited edits and keeps clear distinct from reset', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    await openMenu('Row actions for Base', 'Add variation');
    const fork = (await screen.findByDisplayValue('Base · B')).closest('tr')!;
    fireEvent.click(fork);
    const fields = screen.getByRole('region', { name: 'Fields' });
    const toggle = within(fields).getByRole('button', { name: /^Fields/ });
    if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
    const headline = within(fields).getByLabelText('Headline') as HTMLInputElement;
    expect(headline.value).toBe('Hola mundo');
    const root = screen.getByDisplayValue('Base').closest('tr')!;
    fireEvent.change(within(root).getByLabelText('Headline'), {
      target: { value: 'Parent changed' },
    });
    expect(headline.value).toBe('Parent changed');
    fireEvent.change(headline, { target: { value: '' } });
    expect(headline.value).toBe('');
    expect((within(root).getByLabelText('Headline') as HTMLInputElement).value).toBe(
      'Parent changed',
    );
    fireEvent.click(within(fields).getByRole('button', { name: 'Reset Headline to inherited' }));
    expect(headline.value).toBe('Parent changed');
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

  // 2026-10-05: a refused first save toasted its raw code and re-sent itself every 5 s.
  // 2026-10-06 (Inyogo Card B): it also said "more than one published revision" when there were
  // none. Zero publications now reads as unpublished, with the template one click away.
  test('a refused autosave says why in the toolbar once, without a toast or a retry loop', async () => {
    const code = 'template_revision_unpublished';
    const sourceAssetId = '55555555-5555-4555-8555-555555555555';
    contractOverrides = { template: { ...TEMPLATE, sourceAssetId } };
    createRenderSetMock.mockImplementationOnce(async () => {
      throw new ApiError(code, 409, undefined, {
        error: code,
        detail: 'This template has no published revision for this render workspace.',
      });
    });
    const toasts: string[] = [];
    const unregister = registerToastSink(({ title }) => {
      toasts.push(String(title));
    });
    toasts.length = 0;
    const onOpenTemplate = mock((_intent: { assetId: string; tab?: string }) => undefined);
    try {
      render(<RenderRequestsGrid brandId={BRAND} onOpenTemplate={onOpenTemplate} />);
      fireEvent.change(await screen.findByDisplayValue('Hola mundo'), {
        target: { value: 'Hola de nuevo' },
      });
      const status = await screen.findByRole('status', { name: 'Save status' });
      await waitFor(() => expect(status.textContent).toContain('no published revision'), {
        timeout: 4000,
      });
      expect(status.textContent).not.toContain(code);
      expect(status.textContent).not.toContain('more than one');
      expect(status.textContent).not.toContain('Retrying');
      expect(toasts).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: 'Open template' }));
      expect(onOpenTemplate).toHaveBeenCalledWith({ assetId: sourceAssetId, tab: 'variants' });
      // Repairing the template never costs the rows that could not be saved.
      expect(screen.getByDisplayValue('Hola de nuevo')).toBeTruthy();
    } finally {
      unregister();
    }
  });

  test('keeps the draft row after submitting its immutable set snapshot, saved as Untitled set', async () => {
    const onFired = mock((_jobIds: string[]) => undefined);
    render(<RenderRequestsGrid brandId={BRAND} onFired={onFired} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(await screen.findByText(FIT_NOTE)).toBeTruthy();
    expect(
      screen.getByText(
        'The row can render · Layout fit isn’t measured for this template — rows can still render',
      ),
    ).toBeTruthy();
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

  test('a web component saves and reviews its set on the nil binding, Library only, no renderer to pick', async () => {
    const webKey = 'web:99999999-9999-4999-8999-999999999999';
    extraTemplates = [
      { ...TEMPLATE, key: webKey, bindingId: WEB_COMPONENT_BINDING_ID, displayName: 'Hello card' },
    ];
    contractOverrides = {
      web: {
        width: 1080,
        height: 1080,
        durationSec: 4,
        fps: 30,
        previewUrl: 'https://api.test/preview',
        variables: [{ key: 'headline', nodeId: 'title', property: 'text' }],
      },
    };
    // The row's preview page never arrives; the set and the review are what is under test.
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch,
    );
    try {
      render(<RenderRequestsGrid brandId={BRAND} intent={{ templateKey: webKey }} />);
      await screen.findByDisplayValue('Hola mundo');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain(
          'Hello card',
        ),
      );
      fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
      // A web component has no Live kit: never Ready, still renderable.
      expect(await screen.findByText(FIT_NOTE)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Render 1 row · 1 file' }));
      const tray = await screen.findByRole('region', { name: 'Review and render' });
      expect(createRenderSetMock.mock.calls[0]?.[0]).toMatchObject({
        name: 'Untitled set',
        templateKey: webKey,
        bindingId: WEB_COMPONENT_BINDING_ID,
      });
      await waitFor(() => expect(batchPreflightMock).toHaveBeenCalled());
      expect(batchPreflightMock.mock.calls[0]?.[0]).toMatchObject({
        templateKey: webKey,
        bindingId: WEB_COMPONENT_BINDING_ID,
      });
      // The row previews from the component's own page, not the After Effects kit.
      expect(fetchSpy.mock.calls.map(([url]) => url)).toContain('https://api.test/preview');

      await press('Next: delivery');
      fireEvent.click(within(tray).getByRole('button', { name: 'Change delivery' }));
      const options = within(tray).getByRole('region', { name: 'Delivery options' });
      expect(within(options).getByText('Library')).toBeTruthy();
      expect(within(options).queryByText('Slack')).toBeNull();
      expect(within(options).queryByText('Meta ads')).toBeNull();
      expect(within(options).queryByText('Approval')).toBeNull();
      expect(within(tray).queryByRole('radiogroup', { name: 'Renderer' })).toBeNull();
      expect(within(tray).getByRole('radiogroup', { name: 'Render as' })).toBeTruthy();
    } finally {
      fetchSpy.mockRestore();
    }
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
      expect(await screen.findByText(FIT_NOTE)).toBeTruthy();
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

  test('a video slot states the clip length it demands, and says when one runs out early', async () => {
    contractOverrides = {
      variables: [
        ...VARIABLES,
        variable({
          key: 'background',
          label: 'Background',
          kind: 'video',
          clip: { fromSec: 0, toSec: 10, playsSec: 6.25 },
        }),
      ],
    };
    // Most Library videos store no length, so the cell reads it off the file itself.
    pickedAsset = {
      ...HERO_ASSET,
      id: '88888888-8888-4888-8888-888888888888',
      kind: 'video',
      fileName: 'bg-loop.mp4',
      durationMs: null,
      signedUrl: 'https://cdn.test/bg-loop.mp4',
    };
    const view = render(<RenderRequestsGrid brandId={BRAND} />);
    const choose = await screen.findByRole('button', { name: 'Choose Background' });
    // "\u226510.0s", not a bare "10.0s": the number is the minimum the clip must be, not its length.
    expect(within(choose).getByText('\u226510.0s')).toBeTruthy();
    expect(choose.getAttribute('title')).toContain('Plays 0.0s\u201310.0s of the clip');

    fireEvent.click(choose);
    await screen.findByRole('button', { name: 'Change Background' });
    expect(screen.queryByText('Short')).toBeNull();
    const probe = view.container.querySelector<HTMLVideoElement>(
      'video[src="https://cdn.test/bg-loop.mp4"]',
    )!;
    Object.defineProperty(probe, 'duration', { configurable: true, value: 6 });
    fireEvent.loadedMetadata(probe);

    const short = await screen.findByText('Short');
    expect(short.getAttribute('title')).toContain('runs out 4.0s early');
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

  describe('a held batch: createBatch failed, so Render opens it, read-only, until the ledger', () => {
    const FUTURE = '2099-01-01T00:00:00.000Z';
    const HELD_LABEL = 'Unconfirmed render — check';
    const renderable = (set: typeof NEWEST) => ({
      ...set,
      rows: [{ ...set.rows[0]!, overrides: { headline: 'Hola mundo' } }],
    });
    const heldView = () => screen.findByRole('region', { name: 'Held batch' });
    const heldKeys = () =>
      Object.keys(localStorage).filter((key) => key.startsWith('forge:held-render:'));
    /** Signs a token per preflight and fails the first createBatch with `failure`. */
    const failFirstConfirm = (failure: () => unknown, expiresAt = FUTURE) => {
      let minted = 0;
      batchPreflightMock.mockImplementation(async () => ({
        ...BATCH_READY,
        batchId: '99999999-9999-4999-8999-99999999999a',
        confirmationToken: `token-${++minted}`,
        expiresAt,
      }));
      createBatchMock.mockImplementationOnce(async () => {
        throw failure();
      });
    };
    const renderOne = async ({ final = false } = {}) => {
      const box = (await screen.findAllByLabelText('Select row'))[0]!;
      if (box.getAttribute('aria-checked') !== 'true') fireEvent.click(box);
      fireEvent.click(await screen.findByRole('button', { name: 'Render 1 row · 1 file' }));
      await screen.findByRole('region', { name: 'Review and render' });
      await press('Next: delivery');
      if (final) fireEvent.click(screen.getByRole('radio', { name: 'Final' }));
      await press('Render 1 file');
    };
    const openSet = async (name: string, row: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }));
      expect(await screen.findByDisplayValue(row)).toBeTruthy();
    };
    const setup = async (failure: () => unknown, expiresAt?: string) => {
      listRenderSetsMock.mockImplementation(async () => ({
        items: [renderable(NEWEST), renderable(OLDER)],
        nextCursor: null,
      }));
      failFirstConfirm(failure, expiresAt);
      const onFired = mock((_jobIds: string[]) => undefined);
      const view = render(<RenderRequestsGrid brandId={BRAND} onFired={onFired} />);
      await screen.findByDisplayValue('Newest row');
      await renderOne({ final: true });
      return { view, onFired, held: createBatchMock.mock.calls[0]?.[0].confirmationToken };
    };
    // The backend's own body: its code in `error`, its words in `detail` (routes.ts).
    const bindingChanged = () =>
      new ApiError('render_binding_changed', 409, undefined, {
        error: 'render_binding_changed',
        detail: 'The render binding changed since the confirmation was signed.',
      });
    const noAnswer = () => new TypeError('Failed to fetch');

    test('a 409 render_binding_changed is held without Retry, and Render opens the held batch', async () => {
      await setup(bindingChanged);
      const view = await heldView();
      expect(view.textContent).toContain(
        'This template’s render setup changed after the review. Some rows may already be rendering. Open Render ledger to check, then Render to review again.',
      );
      expect(view.textContent).not.toMatch(/binding|workspace|Rows before it/);
      // A refusal cannot succeed on the same token: no Retry, only the ledger.
      expect(
        within(view)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Open Render ledger']);
      expect(screen.queryAllByRole('region', { name: 'Review and render' })).toHaveLength(0);
      const signed = batchPreflightMock.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: HELD_LABEL }));
      expect(await heldView()).toBeTruthy();
      expect(screen.queryAllByRole('region', { name: 'Review and render' })).toHaveLength(0);
      expect(batchPreflightMock.mock.calls.length).toBe(signed);
    }, 30_000);

    test('Final, Slack and the selection cannot change once held: Render says it opens the held batch', async () => {
      await setup(noAnswer);
      const view = await heldView();
      expect(view.textContent).toContain('What was sent: 1 row (Newest row) · Final · Library');
      expect(view.textContent).toContain('In the Render ledger, look for the batch from');
      expect(view.textContent).not.toContain('aren’t part of this batch');
      // The button says what it does now, never the selection's count.
      expect(screen.queryAllByRole('button', { name: /^Render \d/ })).toHaveLength(0);
      // Another selection, then Render: the same held batch, said apart from the grid's rows.
      fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
      fireEvent.click(screen.getByRole('button', { name: HELD_LABEL }));
      expect((await heldView()).textContent).toContain(
        'Your edits and selection aren’t part of this batch.',
      );
      expect(screen.queryAllByRole('radiogroup', { name: 'Render as' })).toHaveLength(0);
      expect(screen.queryAllByRole('region', { name: 'Delivery options' })).toHaveLength(0);
      expect(
        within(await heldView())
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Retry this batch', 'Open Render ledger']);
    }, 30_000);

    test('a rename while held moves only the set revision: the held view says nothing changed', async () => {
      await setup(noAnswer);
      expect((await heldView()).textContent).not.toContain('aren’t part of this batch');
      await openMenu('Actions for Newest', /Rename/);
      const dialog = await screen.findByRole('dialog', { name: 'Rename render set' });
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Summer' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
      await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
      expect((await heldView()).textContent).not.toContain('aren’t part of this batch');
    }, 30_000);

    // The held-set gate, handler by handler: a hold another tab wrote with no event this page heard
    // leaves each control enabled, so only the handler's own fresh read stops it; once heard, the
    // control is disabled with why.
    const SOURCE = '55555555-5555-4555-8555-555555555555';
    const holdOn = (renderSetId: string) =>
      localStorage.setItem(
        holdKeyOf({
          userId: USER,
          brandId: BRAND,
          bindingId: TEMPLATE.bindingId,
          templateKey: '133',
          renderSetId,
        }),
        JSON.stringify({ batchId: 'batch-g', heldAt: Date.now() }),
      );
    const heard = () =>
      act(() => {
        window.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
      });
    const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 50)));
    const gated = (button: HTMLElement) => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.getAttribute('title')).toBe(HELD_SET);
    };

    test('re-pin and Run on other variants: each handler stops on a fresh read, then each is disabled', async () => {
      contractOverrides = { template: { ...TEMPLATE, sourceAssetId: SOURCE } };
      const published = (variantId: string, templateKey: string) => ({
        templateId: 'tpl',
        variantId,
        name: variantId,
        archivedAt: null,
        sourceKind: 'upload',
        publishedHeadRevisionId: `${variantId}-r1`,
        revisions: [
          {
            id: `${variantId}-r1`,
            number: 1,
            sourceAssetId: SOURCE,
            publications: [{ bindingId: TEMPLATE.bindingId, templateKey }],
          },
        ],
      });
      revisionVariants = [published('blue', '133'), published('red', '134')];
      listRenderSetsMock.mockImplementation(async () => ({
        items: [renderable(NEWEST)],
        nextCursor: null,
      }));
      try {
        render(<RenderRequestsGrid brandId={BRAND} />);
        const picker = await screen.findByLabelText('Published template revision');
        fireEvent.change(picker, {
          target: { value: (picker as HTMLSelectElement).options[1]!.value },
        });
        const repin = screen.getByRole('button', { name: 'Change set template revision' });
        const variants = screen.getByRole('button', { name: /^Run on \d other variants?$/ });
        await waitFor(() => expect((repin as HTMLButtonElement).disabled).toBe(false));
        holdOn(NEWEST.id);
        const created = createRenderSetMock.mock.calls.length;
        fireEvent.click(repin);
        fireEvent.click(variants);
        await settle();
        expect(changeRevisionMock).not.toHaveBeenCalled();
        expect(createRenderSetMock.mock.calls.length).toBe(created);
        heard();
        gated(screen.getByRole('button', { name: 'Change set template revision' }));
        gated(screen.getByRole('button', { name: /^Run on \d other variants?$/ }));
      } finally {
        revisionVariants = [];
      }
    }, 30_000);

    test('Update set and Update to current template: each handler stops on a fresh read', async () => {
      listRenderSetsMock.mockImplementation(async () => ({
        // Saved for an earlier template, with a field this one no longer has: Update set is asked.
        items: [
          {
            ...NEWEST,
            contractHash: 'old-hash',
            rows: [
              { ...NEWEST.rows[0]!, overrides: { headline: 'Hola mundo', subtitle: 'Gone now' } },
            ],
          },
        ],
        nextCursor: null,
      }));
      render(<RenderRequestsGrid brandId={BRAND} />);
      const banner = await screen.findByRole('region', { name: 'Older template' });
      holdOn(NEWEST.id);
      fireEvent.click(within(banner).getByRole('button', { name: 'Update set' }));
      await settle();
      expect(updateRenderSetMock).not.toHaveBeenCalled();
      // The rail's item, from a menu opened before the hold was written.
      act(() => localStorage.clear());
      heard();
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Newest' }));
      const update = await screen.findByRole('menuitem', { name: /Update to current template/ });
      expect(update.hasAttribute('data-disabled')).toBe(false);
      holdOn(NEWEST.id);
      fireEvent.click(update);
      await settle();
      expect(updateRenderSetMock).not.toHaveBeenCalled();
      heard();
      gated(within(banner).getByRole('button', { name: 'Update set' }));
    }, 30_000);

    test('Import browser draft stops on a fresh read, then is disabled', async () => {
      withSavedSets();
      localStorage.setItem(
        `forge:render-drafts:${BRAND}:133`,
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
            },
          ],
        }),
      );
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Newest row');
      holdOn(NEWEST.id);
      fireEvent.click(screen.getByRole('button', { name: 'Import browser draft' }));
      await settle();
      expect(screen.queryAllByDisplayValue('From the draft')).toHaveLength(0);
      heard();
      gated(screen.getByRole('button', { name: 'Import browser draft' }));
    }, 30_000);

    test('Restore as new set stops on a fresh read, then is disabled', async () => {
      withSavedSets();
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Newest row');
      await openMenu('Actions for Newest', /Version history/);
      const restore = await screen.findByRole('button', { name: 'Restore as new set' });
      holdOn(NEWEST.id);
      const created = createRenderSetMock.mock.calls.length;
      fireEvent.click(restore);
      await settle();
      expect(createRenderSetMock.mock.calls.length).toBe(created);
      heard();
      gated(await screen.findByRole('button', { name: 'Restore as new set' }));
    }, 30_000);

    test('Duplicate and Delete stop on a fresh read: a hold written under an open menu or dialog', async () => {
      listRenderSetsMock.mockImplementation(async () => ({
        items: [renderable(NEWEST), renderable(OLDER)],
        nextCursor: null,
      }));
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Newest row');
      // Written by another tab with no event this page hears: only a fresh read sees it.
      const holdSilently = () =>
        localStorage.setItem(
          holdKeyOf({
            userId: USER,
            brandId: BRAND,
            bindingId: TEMPLATE.bindingId,
            templateKey: '133',
            renderSetId: OLDER.id,
          }),
          JSON.stringify({ batchId: 'batch-o', heldAt: Date.now() }),
        );
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Older' }));
      const duplicate = await screen.findByRole('menuitem', { name: /Duplicate/ });
      holdSilently();
      const created = createRenderSetMock.mock.calls.length;
      fireEvent.click(duplicate);
      await act(async () => await new Promise((resolve) => setTimeout(resolve, 50)));
      expect(createRenderSetMock.mock.calls.length).toBe(created);
      // Let go in that tab, heard here: the menu offers Delete again.
      act(() => {
        localStorage.clear();
        window.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
      });
      if (screen.queryAllByRole('menuitem').length) {
        fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' });
        await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
      }
      await openMenu('Actions for Older', /Delete/);
      const confirm = await screen.findByRole('alertdialog');
      holdSilently();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
      await act(async () => await new Promise((resolve) => setTimeout(resolve, 50)));
      expect(deleteRenderSetMock).not.toHaveBeenCalled();
    }, 30_000);

    test('a value-only edit since the batch was sent is said apart from it', async () => {
      await setup(noAnswer);
      expect((await heldView()).textContent).not.toContain('aren’t part of this batch');
      // Same row, same name, same selection: only a value moves.
      fireEvent.change(screen.getByDisplayValue('Hola mundo'), {
        target: { value: 'Hola otra vez' },
      });
      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Held batch' }).textContent).toContain(
          'Your edits and selection aren’t part of this batch.',
        ),
      );
    }, 30_000);

    test('Retry this batch re-sends the identical token; its jobs show, and the hold clears', async () => {
      const { held } = await setup(noAnswer);
      fireEvent.click(within(await heldView()).getByRole('button', { name: 'Retry this batch' }));
      await waitFor(() => expect(createBatchMock).toHaveBeenCalledTimes(2));
      expect(createBatchMock.mock.calls[1]?.[0]).toEqual({ confirmationToken: held });
      // The same result a confirm shows: the queued jobs, by row.
      const landed = await screen.findByRole('region', { name: 'Retried batch' });
      expect(within(landed).getByRole('list', { name: 'Fired renders' })).toBeTruthy();
      expect(screen.queryAllByRole('region', { name: 'Held batch' })).toHaveLength(0);
      expect(heldKeys()).toHaveLength(0);
    }, 30_000);

    test('Retry is gone once the token’s own expiresAt has passed', async () => {
      await setup(noAnswer, '2000-01-01T00:00:00.000Z');
      const view = await heldView();
      expect(within(view).queryAllByRole('button', { name: 'Retry this batch' })).toHaveLength(0);
      expect(view.textContent).toContain('Retry isn’t available any more.');
    }, 30_000);

    test('a retry the server calls invalid_confirmation says why, and Retry goes', async () => {
      await setup(noAnswer);
      createBatchMock.mockImplementationOnce(async () => {
        throw new ApiError('invalid_confirmation', 409, undefined, {
          error: 'invalid_confirmation',
          detail: 'invalid_confirmation',
        });
      });
      fireEvent.click(within(await heldView()).getByRole('button', { name: 'Retry this batch' }));
      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Held batch' }).textContent).toContain(
          'This review no longer matches the rows. Some rows may already be rendering. Open Render ledger to check, then Render to review again.',
        ),
      );
      expect(document.body.textContent).not.toContain('invalid_confirmation');
      expect(screen.queryAllByRole('button', { name: 'Retry this batch' })).toHaveLength(0);
    }, 30_000);

    test('Open Render ledger opens the job list and clears the hold', async () => {
      const { onFired } = await setup(bindingChanged);
      expect(heldKeys()).toEqual([
        holdKeyOf({
          userId: USER,
          brandId: BRAND,
          bindingId: TEMPLATE.bindingId,
          templateKey: '133',
          renderSetId: NEWEST.id,
        }),
      ]);
      // Only the batch and when: the token stays in this page's memory.
      expect(Object.keys(JSON.parse(localStorage.getItem(heldKeys()[0]!)!)).sort()).toEqual([
        'batchId',
        'heldAt',
      ]);
      fireEvent.click(within(await heldView()).getByRole('button', { name: 'Open Render ledger' }));
      expect(onFired).toHaveBeenCalledWith([]);
      expect(heldKeys()).toHaveLength(0);
      await waitFor(() =>
        expect(screen.queryAllByRole('region', { name: 'Held batch' })).toHaveLength(0),
      );
      // Render reviews again, and signs afresh.
      await renderOne();
      await waitFor(() => expect(createBatchMock).toHaveBeenCalledTimes(2));
      expect(createBatchMock.mock.calls[1]?.[0].confirmationToken).not.toBe(
        createBatchMock.mock.calls[0]?.[0].confirmationToken,
      );
    }, 30_000);

    test('a remount in the session keeps Retry; a reload keeps the hold but not the token', async () => {
      const { view, held } = await setup(noAnswer);
      view.unmount();
      render(<RenderRequestsGrid brandId={BRAND} />);
      expect(
        within(await heldView()).getByRole('button', { name: 'Retry this batch' }),
      ).toBeTruthy();
      cleanup();
      forgetPageSession();
      render(<RenderRequestsGrid brandId={BRAND} />);
      const reloaded = await heldView();
      expect(within(reloaded).queryAllByRole('button', { name: 'Retry this batch' })).toHaveLength(
        0,
      );
      expect(reloaded.textContent).toContain(
        'Retry isn’t available on this page. Some or all rows may already be rendering. Open Render ledger to check before rendering again.',
      );
      expect(reloaded.textContent).toContain('What was sent isn’t known on this page.');
      expect(JSON.stringify(localStorage)).not.toContain(held);
    }, 30_000);

    test('a hold is its render set’s: another set of the template renders, and the hold waits', async () => {
      await setup(noAnswer);
      await heldView();
      await openSet('Older', 'Older row');
      await waitFor(() =>
        expect(screen.queryAllByRole('region', { name: 'Held batch' })).toHaveLength(0),
      );
      expect(screen.queryAllByRole('button', { name: HELD_LABEL })).toHaveLength(0);
      await renderOne();
      await waitFor(() => expect(createBatchMock).toHaveBeenCalledTimes(2));
      // Back on the held set, its hold is still there.
      await openSet('Newest', 'Newest row');
      expect(await heldView()).toBeTruthy();
    }, 30_000);

    test('a send still beating elsewhere cannot be released', async () => {
      listRenderSetsMock.mockImplementation(async () => ({
        items: [renderable(NEWEST)],
        nextCursor: null,
      }));
      // Another tab wrote it ahead a moment ago and has not been answered yet.
      localStorage.setItem(
        holdKeyOf({
          userId: USER,
          brandId: BRAND,
          bindingId: TEMPLATE.bindingId,
          templateKey: '133',
          renderSetId: NEWEST.id,
        }),
        JSON.stringify({ batchId: 'batch-x', heldAt: Date.now() - 5_000, inflight: true }),
      );
      render(<RenderRequestsGrid brandId={BRAND} />);
      const view = await heldView();
      expect(view.textContent).toContain(
        'A Render of this set is still being sent. Wait a moment, then check the Render ledger.',
      );
      expect(
        within(view).getByRole<HTMLButtonElement>('button', { name: 'Open Render ledger' })
          .disabled,
      ).toBe(true);
      expect(heldKeys()).toHaveLength(1);
    }, 30_000);

    test('with no user id, Render fails closed', async () => {
      signedIn = null;
      listRenderSetsMock.mockImplementation(async () => ({
        items: [renderable(NEWEST)],
        nextCursor: null,
      }));
      render(<RenderRequestsGrid brandId={BRAND} />);
      await screen.findByDisplayValue('Newest row');
      fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
      const toolbar = screen.getByRole('toolbar', { name: 'Render' });
      const button = within(toolbar).getByRole<HTMLButtonElement>('button', { name: /^Render/ });
      expect(button.disabled).toBe(true);
      expect(within(toolbar).getByText('Sign in again to render')).toBeTruthy();
      expect(batchPreflightMock).not.toHaveBeenCalled();
    }, 30_000);
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

  test('an intent naming a row brings it into view, and with rerender selects it alone for Render', async () => {
    withSavedSets();
    const scrolled: string[] = [];
    const scrollIntoView = spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (
      this: Element,
    ) {
      scrolled.push((this as HTMLElement).dataset.rowId ?? '');
    });
    try {
      const { rerender } = render(<RenderRequestsGrid brandId={BRAND} />);
      expect(await screen.findByDisplayValue('Newest row')).toBeTruthy();

      const rowId = OLDER.rows[0]!.id;
      rerender(
        <RenderRequestsGrid
          brandId={BRAND}
          intent={{ templateKey: '133', renderSetId: OLDER.id, rowId, rerender: true }}
        />,
      );
      expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
      await waitFor(() => expect(screen.getByText('1 selected')).toBeTruthy());
      const [box] = screen.getAllByLabelText<HTMLButtonElement>('Select row');
      expect(box?.getAttribute('aria-checked')).toBe('true');
      expect(scrolled).toContain(rowId);
    } finally {
      scrollIntoView.mockRestore();
    }
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
    // The picker closes on a pick, so each pick opens it again.
    const pickTemplate = async (name: RegExp) => {
      fireEvent.click(screen.getByRole('button', { name: 'Template' }));
      fireEvent.click(await screen.findByRole('option', { name }));
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
    const presets = (await screen.findAllByRole('menuitem')).map((item) =>
      item.textContent?.trim(),
    );
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
    // With rows on the grid the button is the assistant; a brief for new rows is its second action.
    fireEvent.change(within(dialog).getByLabelText(/^Ask/), { target: { value: 'Summer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Draft new rows' }));

    const banner = await screen.findByRole('region', { name: 'Proposed rows' });
    expect(banner.textContent).toContain('2 proposed rows');
    expect(screen.getByDisplayValue('Drafted · cheaper')).toBeTruthy();
    // Proposed rows make nothing to save: no edit timer, nothing written.
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(updateRenderSetMock).not.toHaveBeenCalled();
    // Selected, a proposed row cannot be rendered, and Render says why in words.
    const drafted = screen.getByDisplayValue('Drafted').closest('tr')!;
    fireEvent.click(within(drafted).getByLabelText('Select row'));
    const toolbar = screen.getByRole('toolbar', { name: 'Render' });
    expect(
      within(toolbar).getByRole<HTMLButtonElement>('button', { name: 'Render' }).disabled,
    ).toBe(true);
    expect(within(toolbar).getByText('Proposed by AI. Keep or discard it first.')).toBeTruthy();

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

  test('the AI button edits the rows on screen: one ask, one undo step, nothing proposed', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    const row = await screen.findByDisplayValue('Newest row');
    const rowId = row.closest('tr')!.getAttribute('data-row-id')!;
    suggestRowsMock.mockImplementationOnce(async () => ({
      rows: [],
      assets: [],
      dropped: [],
      unfilled: [],
      ops: [
        { op: 'set', rowIds: [rowId], key: 'headline', value: 'Precio loco' },
        { op: 'select', rowIds: [rowId] },
      ],
      reply: 'Cambié el titular.',
      assumptions: [],
      cannot: ['Hero: pictures are chosen in the grid, not by the assistant'],
    }));
    await openMenu('Add', 'Draft with AI…');
    const dialog = await screen.findByRole('dialog', { name: 'Draft rows with AI' });
    fireEvent.change(within(dialog).getByLabelText(/^Ask/), {
      target: { value: 'Titular de la fila 1: Precio loco' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));

    expect(await screen.findByDisplayValue('Precio loco')).toBeTruthy();
    const sent = suggestRowsMock.mock.calls.at(-1)![0] as {
      prompt: string;
      grid: { rows: Array<{ id: string; label: string }>; mapColumns: boolean };
    };
    expect(sent.prompt).toBe('Titular de la fila 1: Precio loco');
    expect(sent.grid.mapColumns).toBe(false);
    expect(sent.grid.rows.map((item) => item.label)).toEqual(['Newest row']);
    // The bubble stays open with what was done and what could not be.
    expect(within(dialog).getByText('Cambié el titular.')).toBeTruthy();
    expect(within(dialog).getByText(/pictures are chosen in the grid/)).toBeTruthy();
    // Applied, not proposed: there is nothing to keep, and the row is left selected.
    expect(screen.queryAllByRole('region', { name: 'Proposed rows' })).toHaveLength(0);
    const edited = screen.getByDisplayValue('Precio loco').closest('tr')!;
    expect(within(edited).getByLabelText('Select row').getAttribute('aria-checked')).toBe('true');

    // The answer carries its own Undo; ⌘Z from the toolbar puts it back the other way.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo this change' }));
    await waitFor(() => expect(screen.queryByDisplayValue('Precio loco')).toBeNull());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const toolbar = screen.getByRole('toolbar', { name: 'Render' });
    fireEvent.keyDown(within(toolbar).getByRole('button', { name: 'Import' }), {
      key: 'z',
      metaKey: true,
      shiftKey: true,
    });
    expect(await screen.findByDisplayValue('Precio loco')).toBeTruthy();
  });

  test('Discard all takes the proposed rows back and leaves the set as it was', async () => {
    withSavedSets();
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    await openMenu('Add', 'Draft with AI…');
    const dialog = await screen.findByRole('dialog', { name: 'Draft rows with AI' });
    // With rows on the grid the button is the assistant; a brief for new rows is its second action.
    fireEvent.change(within(dialog).getByLabelText(/^Ask/), { target: { value: 'Summer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Draft new rows' }));
    const banner = await screen.findByRole('region', { name: 'Proposed rows' });
    fireEvent.click(within(banner).getByRole('button', { name: 'Discard all' }));
    await waitFor(() => expect(screen.queryAllByDisplayValue('Drafted')).toHaveLength(0));
    expect(screen.getAllByLabelText('Row name')).toHaveLength(1);
    expect(screen.queryByText('(unsaved edits)')).toBeNull();
  });

  test('while the Live kits load, the grid says Checking layout…, not that rows can render', async () => {
    livePreviewMock.mockImplementation(() => new Promise(() => undefined));
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    // The readiness line, and each row's status.
    const checking = await screen.findAllByText('Checking layout…');
    expect(checking.map((node) => node.tagName)).toEqual(['SPAN', 'P']);
    expect(screen.queryAllByText(/can render/).map((node) => node.textContent)).toEqual([]);
  });

  test('an edit makes no preflight call, and the row can render, layout checked', async () => {
    livePreviewMock.mockImplementation(async () => EMPTY_KIT);
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
    // Past the debounce the per-row dry-run used to fire on: still nothing asked of the server.
    await act(async () => await new Promise((resolve) => setTimeout(resolve, 1000)));
    expect(preflightMock).not.toHaveBeenCalled();
    expect(batchPreflightMock).not.toHaveBeenCalled();
    // The Live kit's one read, cached: an edit is measured in the browser, not asked for.
    expect(livePreviewMock).toHaveBeenCalledTimes(1);
    expect(within(input.closest('tr')!).getByText('Can render · layout checked')).toBeTruthy();
    expect(screen.getByText('The row can render')).toBeTruthy();
    expect(document.activeElement).toBe(input);
    type(' vez');
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('Hola mundo otra vez');
    // Ready is Render's word too: the row renders without waiting on any check.
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Render 1 row · 1 file' }).disabled,
    ).toBe(false);
    expect(preflightMock).not.toHaveBeenCalled();
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

  // EasyFit 2026-09-30: one PSD, two artboards of one size stacked differently ("model in front" /
  // "headline in front"). A ratio chip alone would read "4:5 4:5"; each row picks its arrangement.
  test('arrangements of one size are told apart by name, and a row can pick one', async () => {
    contractOverrides = {
      template: { ...TEMPLATE, ratios: ['4:5'] },
      outputs: [
        { id: 'Model in front', label: 'Model in front', ratio: '4:5' },
        { id: 'Headline in front', label: 'Headline in front', ratio: '4:5' },
      ],
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click(
      screen.getByRole('button', { name: 'Formats Model in front, Headline in front' }),
    );
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Headline in front/ }));
    expect(await screen.findByRole('button', { name: 'Formats Model in front' })).toBeTruthy();
  });

  test('the template variant picker applies to the set and newly added rows', async () => {
    contractOverrides = {
      template: { ...TEMPLATE, ratios: ['4:5'] },
      outputs: [
        { id: 'Model', label: 'Model', ratio: '4:5' },
        { id: 'Headline', label: 'Headline', ratio: '4:5' },
      ],
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.change(screen.getByLabelText('Artboard'), {
      target: { value: 'Headline' },
    });
    expect(await screen.findByRole('button', { name: 'Formats Headline' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Blank row' }));
    expect(screen.getAllByRole('button', { name: 'Formats Headline' })).toHaveLength(2);
  });

  test('published sub-variants are selected within the same source and workspace', async () => {
    const sourceAssetId = '55555555-5555-4555-8555-555555555555';
    extraTemplates = [
      { ...TEMPLATE, key: '134', sourceAssetId, displayName: 'Child A' },
      { ...TEMPLATE, key: '135', sourceAssetId, displayName: 'Child B' },
      {
        ...TEMPLATE,
        key: '136',
        sourceAssetId,
        bindingId: '44444444-4444-4444-8444-444444444449',
        displayName: 'Other workspace',
      },
    ];
    render(
      <RenderRequestsGrid
        brandId={BRAND}
        intent={{ templateKey: '134', bindingId: TEMPLATE.bindingId }}
      />,
    );
    await screen.findByDisplayValue('Hola mundo');
    const picker = await screen.findByLabelText('Template source variant');
    expect(within(picker).getByRole('option', { name: 'Child B' })).toBeTruthy();
    expect(within(picker).queryByRole('option', { name: 'Other workspace' })).toBeNull();
    fireEvent.change(picker, { target: { value: `${TEMPLATE.bindingId}:135` } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Template', exact: true }).textContent).toContain(
        'Child B',
      ),
    );
  });

  test('a removed variant requires review even when the contract hash stays the same', async () => {
    listRenderSetsMock.mockImplementation(async () => ({
      items: [{ ...NEWEST, rows: [{ ...NEWEST.rows[0]!, outputIds: ['Removed variant'] }] }],
      nextCursor: null,
    }));
    contractOverrides = { outputs: [{ id: 'Current', label: 'Current', ratio: '4:5' }] };
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    expect(screen.getByRole('region', { name: 'Older template' }).textContent).toContain(
      'Removed variant format',
    );
    expect(screen.getByRole('button', { name: 'Update set' })).toBeTruthy();
  });

  // A two-line headline set on two layers: one box takes both lines, and a count that does not
  // fit is named on the field before any render is spent.
  test('a field split across layers takes its lines in one box and names a count that does not fit', async () => {
    contractOverrides = {
      linkedFields: [
        variable({
          key: 'front_line',
          label: 'Front line',
          kind: 'text',
          exposed: false,
          derivedFrom: { key: 'headline', line: 2 },
        }),
      ],
    };
    render(<RenderRequestsGrid brandId={BRAND} />);
    const headline = await screen.findByLabelText(
      'Headline — one line each for Headline, Front line',
    );
    expect(headline.tagName).toBe('TEXTAREA');
    // The seeded sample is one line: the split cannot fill Front line.
    await waitFor(() => expect(headline.getAttribute('title')).toContain('Headline needs 2 lines'));
    fireEvent.change(headline, { target: { value: 'TRAIN HARD\nFEEL STRONG' } });
    await waitFor(() => expect(headline.getAttribute('title')).toBeNull());
  });

  test('an edit with the review open asks the server nothing; Check again saves and reviews again', async () => {
    const renderable = {
      ...NEWEST,
      rows: [{ ...NEWEST.rows[0]!, overrides: { headline: 'Hola mundo' } }],
    };
    listRenderSetsMock.mockImplementation(async () => ({ items: [renderable], nextCursor: null }));
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Newest row');
    expect(await screen.findByText(FIT_NOTE)).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Render 1 row · 1 file' }));
    const tray = await screen.findByRole('region', { name: 'Review and render' });
    await press('Next: delivery');
    expect(within(tray).getByRole('button', { name: 'Render 1 file' })).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Newest row'), { target: { value: 'Renamed row' } });
    expect(await within(tray).findByText('Rows changed since this check.')).toBeTruthy();
    expect(within(tray).queryAllByRole('button', { name: /^Render/ })).toHaveLength(0);
    // However long the edit settles, nothing is checked: no row preflight, no batch preflight.
    await act(async () => await new Promise((resolve) => setTimeout(resolve, 1000)));
    expect(batchPreflightMock).toHaveBeenCalledTimes(1);
    expect(preflightMock).not.toHaveBeenCalled();

    // Check again saves the edit and reviews again. A name is nothing a check reads, so the review
    // settles on the verdict it already has.
    fireEvent.click(within(tray).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(updateRenderSetMock).toHaveBeenCalled(), { timeout: 5000 });
    await waitFor(() =>
      expect(within(tray).queryAllByText('Rows changed since this check.')).toHaveLength(0),
    );
    expect(batchPreflightMock).toHaveBeenCalledTimes(1);
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

test('published source variants select their own template key across independent source assets', async () => {
  const root = '55555555-5555-4555-8555-555555555555';
  const child = '66666666-6666-4666-8666-666666666666';
  extraTemplates = [
    { ...TEMPLATE, key: '134', sourceAssetId: root, displayName: 'Original design' },
    {
      ...TEMPLATE,
      key: '135',
      name: 'Reordered portrait',
      sourceAssetId: child,
      displayName: 'Reordered design',
    },
    {
      ...TEMPLATE,
      key: '137',
      name: 'Reordered square',
      sourceAssetId: child,
      displayName: 'Reordered design',
    },
    {
      ...TEMPLATE,
      key: '136',
      sourceAssetId: child,
      bindingId: '44444444-4444-4444-8444-444444444449',
      displayName: 'Other workspace',
    },
  ];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(forgeQueryKeys.templateVariants(BRAND), [
    { assetId: root, rootAssetId: root, parentAssetId: null },
    { assetId: child, rootAssetId: root, parentAssetId: root },
  ]);
  render(
    <RenderRequestsGrid
      brandId={BRAND}
      intent={{ templateKey: '134', bindingId: TEMPLATE.bindingId }}
    />,
    client,
  );
  await screen.findByDisplayValue('Hola mundo');
  const picker = await screen.findByLabelText('Template source variant');
  expect(
    within(picker).getByRole('option', { name: 'Reordered design · Reordered portrait' }),
  ).toBeTruthy();
  expect(
    within(picker).getByRole('option', { name: 'Reordered design · Reordered square' }),
  ).toBeTruthy();
  expect(within(picker).queryByRole('option', { name: 'Other workspace' })).toBeNull();
  fireEvent.change(picker, { target: { value: `${TEMPLATE.bindingId}:135` } });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Template', exact: true }).textContent).toContain(
      'Reordered design',
    ),
  );
});
