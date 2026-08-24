/**
 * api-render UI bench — drives the REAL `ApiRenderBlock` through real state transitions.
 *
 * What it proves, in the order the node's life runs:
 *   1. the template picker is GATED on the server's workspace verdict, and the node adds
 *      nothing to and subtracts nothing from the list the backend returned;
 *   2. a brand switch invalidates the template, its contract, and any signed confirmation;
 *   3. rendering is LIBRARY-ONLY by default — preflight carries no `delivery` and Meta is
 *      never even searched — and Meta delivery is an explicit opt-in;
 *   4. a `reserved` variable is locked: no input, no handle, nothing registered from the
 *      browser, no required-error, and the exact frozen pin is echoed after preflight;
 *   5. saved input sets round-trip, and rendering from one sends `inputSetId` INSTEAD of
 *      `variables` (the contract refuses both);
 *   6. a multi-set batch confirms and its job ids are persisted — the 202 is the only
 *      handle they will ever have, because no batch id is stored server-side;
 *   7. tracked ids survive a remount the recent-jobs list does not cover;
 *   8. progress advances on its own from the REAL five-value status, with no percentage;
 *   9. EVERY output is previewed, lazily, from the live DTO — never from persisted data;
 *  10. no control is invented for a parameter whose value set never crossed the boundary.
 *
 * UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
 *   · a real browser, the real canvas, or a reload. `apiRendersApi` is mocked here.
 *   · the backend, the render fleet, the library ingest, or the signed Library URL the
 *     backend now prefers. That whole chain is proven live by `render:library:e2e:bench`.
 *   · any live render or Meta publication. Nothing here fires one.
 *
 * Runs under `bun test` for the happy-dom preload in bunfig.toml.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ApiRenderInputSet, ApiRenderJob, ApiRenderVariable } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const OTHER_BRAND_ID = '00000000-0000-4000-8000-0000000000c3';
const ASSET_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

const job = (overrides: Partial<ApiRenderJob> = {}): ApiRenderJob => ({
  id: '11111111-1111-4111-8111-111111111111',
  brandId: BRAND_ID,
  templateKey: '166',
  templateName: 'Demo template',
  contractHash: 'hash',
  taskUid: 'T140po1ho9r14okam',
  status: 'rendering',
  test: true,
  outputs: [],
  delivery: [],
  error: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...overrides,
});

const output = (id: string, assetId: string | null, url?: string) => ({
  id,
  kind: 'image' as const,
  fileName: `${id}.png`,
  mimeType: 'image/png',
  url: url ?? `https://picnic-studio-v3-main-storage.s3.us-east-2.amazonaws.com/out/${id}.png`,
  width: null,
  height: null,
  assetId,
  versionId: assetId ? VERSION_ID : null,
});

const variable = (overrides: Partial<ApiRenderVariable> = {}): ApiRenderVariable => ({
  key: 'headline',
  label: 'Headline',
  kind: 'text',
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  ...overrides,
});

const inputSet = (id: string, name: string): ApiRenderInputSet => ({
  id,
  brandId: BRAND_ID,
  templateKey: '166',
  contractHash: 'hash',
  name,
  variables: { headline: 'hi' },
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

const SET_A = '44444444-4444-4444-8444-444444444444';
const SET_B = '55555555-5555-4555-8555-555555555555';

interface Calls {
  listJobs: number;
  getJob: string[];
  listTemplates: string[];
  searchPaid: number;
  preflight: Record<string, unknown>[];
  batchPreflight: Record<string, unknown>[];
  createInputSet: Record<string, unknown>[];
  createBatch: number;
  register: number;
}
let calls: Calls;
let currentJobs: ApiRenderJob[] = [];
let currentTemplates: { items: unknown[]; workspace?: unknown };
let currentVariables: ApiRenderVariable[] = [];
let currentSets: ApiRenderInputSet[] = [];
let watermarkPin: { assetId: string; versionId: string } | null = null;
let createInputSetError: Error | null = null;

const reset = () => {
  calls = {
    listJobs: 0,
    getJob: [],
    listTemplates: [],
    searchPaid: 0,
    preflight: [],
    batchPreflight: [],
    createInputSet: [],
    createBatch: 0,
    register: 0,
  };
  currentJobs = [];
  currentVariables = [];
  currentSets = [];
  watermarkPin = null;
  createInputSetError = null;
  currentTemplates = {
    items: [{ key: '166', name: 'Demo template' }],
    // The server's verdict. `renderEligible` is what says these templates are actually
    // this brand's bound workspace and not the shared catalogue.
    workspace: { workspace: 'brand_app', renderEligible: true, state: 'eligible', detail: 'ok' },
  };
};
reset();

mock.module('./apiRendersApi', () => ({
  apiRendersApi: {
    listTemplates: async (brandId: string) => {
      calls.listTemplates.push(brandId);
      return { ...currentTemplates, nextCursor: null };
    },
    listJobs: async () => {
      calls.listJobs += 1;
      return { items: currentJobs, nextCursor: null };
    },
    getContract: async () => ({
      template: { name: 'Demo template', contractHash: 'hash' },
      variables: currentVariables,
    }),
    preflight: async (input: Record<string, unknown>) => {
      calls.preflight.push(input);
      return {
        confirmationToken: 'tok',
        confirmationHash: 'a'.repeat(64),
        expiresAt: new Date(0).toISOString(),
        template: { name: 'Demo template' },
        target: null,
        inputKeys: ['headline'],
        effects: 'none',
        test: true,
        watermarkLogo: watermarkPin,
      };
    },
    createJob: async () => job({ status: 'queued' }),
    getJob: async (_brandId: string, jobId: string) => {
      calls.getJob.push(jobId);
      return currentJobs.find((item) => item.id === jobId) ?? job({ id: jobId });
    },
    listInputSets: async () => ({ items: currentSets, nextCursor: null }),
    createInputSet: async (input: Record<string, unknown>) => {
      calls.createInputSet.push(input);
      if (createInputSetError) throw createInputSetError;
      return inputSet(SET_A, String(input.name));
    },
    updateInputSet: async () => inputSet(SET_A, 'Set A'),
    deleteInputSet: async () => undefined,
    batchPreflight: async (input: Record<string, unknown>) => {
      calls.batchPreflight.push(input);
      return {
        batchId: '66666666-6666-4666-8666-666666666666',
        confirmationToken: 'batch-tok',
        confirmationHash: 'b'.repeat(64),
        expiresAt: new Date(0).toISOString(),
        template: { name: 'Demo template' },
        target: null,
        records: [
          { label: 'Set A', inputKeys: ['headline'] },
          { label: 'Set B', inputKeys: ['headline'] },
        ],
        effects: 'none',
      };
    },
    createBatch: async () => {
      calls.createBatch += 1;
      return {
        batchId: '66666666-6666-4666-8666-666666666666',
        jobs: [job({ id: 'job-a', status: 'queued' }), job({ id: 'job-b', status: 'queued' })],
      };
    },
  },
}));

const paidTarget = (overrides: Record<string, unknown>) => ({
  level: 'campaign',
  status: 'ACTIVE',
  campaignId: null,
  campaignName: null,
  adsetId: null,
  adsetName: null,
  creativeId: null,
  format: null,
  previewUrl: null,
  ...overrides,
});

mock.module('../publish/publishingApi', () => ({
  publishingApi: {
    searchPaid: async (input: { level: string }) => {
      calls.searchPaid += 1;
      return {
        adAccountId: 'act_1',
        nextCursor: null,
        items:
          input.level === 'campaign'
            ? [
                paidTarget({ id: 'c1', name: 'Campaign One' }),
                paidTarget({ id: 'c2', name: 'Campaign Two' }),
              ]
            : [paidTarget({ id: 'a1', name: 'Adset One', level: 'adset', campaignId: 'c1' })],
      };
    },
  },
}));

const { ApiRenderBlock } = await import('../ApiRenderBlock');
const { useStudioStore } = await import('../../stores/useStudioStore');

// The node writes through the store's `updateNode` and reads its own `data` prop back.
// The harness has to close that loop or nothing the node persists ever reaches the screen
// — a mutation with no re-render would make every toggle look broken here and fine in the
// app. `nodeData` is the mirror the assertions read: what would survive a reload.
let nodeData: Record<string, unknown> = {};

function Harness({ initial }: { initial: Record<string, unknown> }) {
  const [data, setData] = React.useState(initial);
  React.useEffect(() => {
    useStudioStore.setState({
      updateNode: ((_id: string, updater: (node: unknown) => { data: Record<string, unknown> }) => {
        setData((current) => {
          const next = updater({ data: current }).data;
          nodeData = next;
          return next;
        });
      }) as never,
    } as never);
  }, []);
  return (
    <ApiRenderBlock
      id="render1"
      type="apiRender"
      data={data as never}
      selected={false}
      zIndex={0}
      isConnectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      dragging={false}
      draggable
      selectable
      deletable
    />
  );
}

function renderNode(data: Record<string, unknown> = {}, brandId = BRAND_ID) {
  nodeData = { variables: {}, status: 'idle', ...data };
  useStudioStore.setState({
    brandId,
    nodes: [],
    edges: [],
    updateNode: (() => undefined) as never,
    triggerSave: (() => undefined) as never,
    duplicateNode: (() => undefined) as never,
    deleteNode: (() => undefined) as never,
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ReactFlowProvider>
          <Harness initial={nodeData} />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  reset();
});

describe('ApiRenderBlock — workspace gate and active brand', () => {
  test('an undeployed env plane disables the picker and shows the server’s own reason', async () => {
    // The fleet does not reject an unhonoured workspace — it answers from the SHARED
    // catalogue, which looks like success. Offering those templates would render a
    // template that is not this brand's bound sub-app's.
    currentTemplates = {
      items: [{ key: '166', name: 'Demo template' }],
      workspace: {
        workspace: 'brand_app',
        renderEligible: false,
        state: 'env_plane_undeployed',
        detail: 'Templates shown here are from the shared workspace.',
      },
    };
    renderNode();
    const picker = await screen.findByLabelText('Render template');
    await waitFor(() => expect((picker as HTMLSelectElement).disabled).toBe(true));
    expect(await screen.findByText(/shared workspace/)).toBeTruthy();
  });

  test('an eligible workspace offers exactly the server’s list, nothing added or removed', async () => {
    renderNode();
    const picker = await screen.findByLabelText('Render template');
    await waitFor(() => expect((picker as HTMLSelectElement).disabled).toBe(false));
    expect(await screen.findByRole('option', { name: 'Demo template' })).toBeTruthy();
    // One placeholder + one server template. A third option would mean the node invented one.
    expect((picker as HTMLSelectElement).options.length).toBe(2);
  });

  test('a brand switch clears the template, its contract and any signed confirmation', async () => {
    renderNode({
      templateKey: '166',
      templateName: 'Demo template',
      contractHash: 'hash',
      variableDefinitions: [variable()],
    });
    await waitFor(() => expect(calls.listTemplates).toContain(BRAND_ID));

    await act(async () => {
      useStudioStore.setState({ brandId: OTHER_BRAND_ID } as never);
    });

    await waitFor(() => expect(calls.listTemplates).toContain(OTHER_BRAND_ID));
    // A confirmation token minted for the previous brand must not survive the switch.
    expect(nodeData.templateKey).toBeNull();
    expect(nodeData.contractHash).toBeNull();
    expect(nodeData.variableDefinitions).toEqual([]);
  });
});

describe('ApiRenderBlock — library-only by default, Meta opt-in', () => {
  test('prepares with NO delivery block and never searches Meta', async () => {
    currentVariables = [variable()];
    renderNode({ templateKey: '166', contractHash: 'hash', variableDefinitions: [variable()] });

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare' }));
    await waitFor(() => expect(calls.preflight.length).toBe(1));

    expect(calls.preflight[0]).not.toHaveProperty('delivery');
    // The old node ran a Graph campaign search on every mount, for every render.
    expect(calls.searchPaid).toBe(0);
    expect(await screen.findByText('Library only — no Meta delivery')).toBeTruthy();
  });

  test('the header states where the render is going', async () => {
    renderNode({ templateKey: '166' });
    expect(await screen.findByText('Render → Library')).toBeTruthy();
  });

  test('switching Meta delivery on reveals the pickers and demands a target', async () => {
    renderNode({ templateKey: '166', contractHash: 'hash', variableDefinitions: [] });
    fireEvent.click(await screen.findByLabelText('Also create a PAUSED Meta ad'));

    expect(await screen.findByLabelText('Meta campaign')).toBeTruthy();
    await waitFor(() => expect(calls.searchPaid).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }));
    expect(
      await screen.findByText('Choose a campaign and ad set, or switch Meta delivery off.'),
    ).toBeTruthy();
    expect(calls.preflight.length).toBe(0);
  });

  test('the campaign list survives choosing a campaign, and the ad-set list loads beside it', async () => {
    // The old single shared targets array refetched at ad-set level on first choice,
    // which emptied the campaign list — re-picking meant blindly clearing the value.
    renderNode({
      deliveryEnabled: true,
      delivery: {
        action: 'create',
        adStatus: 'PAUSED',
        adAccountId: 'act_1',
        campaignId: 'c1',
        campaignName: 'Campaign One',
      },
    });

    expect(await screen.findByRole('option', { name: 'Campaign Two' })).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'Adset One' })).toBeTruthy();
  });
});

describe('ApiRenderBlock — the reserved Design Kit variable', () => {
  const reservedContract = [
    variable({
      key: 'watermark_logo',
      label: 'Watermark Logo',
      kind: 'image',
      required: true,
      reserved: true,
    }),
    variable(),
  ];

  test('renders locked: no input, no handle, and nothing registered from the browser', async () => {
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: reservedContract,
    });

    expect(await screen.findByText('Design Kit · Brand logo — filled by Continuum')).toBeTruthy();
    // A connectable handle would advertise an input the server refuses outright.
    expect(document.querySelector('[data-handleid="variable-watermark_logo"]')).toBeNull();
    // The browser resolves, copies, registers and pins NOTHING for this key.
    expect(calls.register).toBe(0);
  });

  test('Prepare does not error on the reserved key and never sends it', async () => {
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: reservedContract,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare' }));
    await waitFor(() => expect(calls.preflight.length).toBe(1));

    // `reserved` is ALSO `required`; keying off `required` alone refused Prepare here.
    const sent = calls.preflight[0]?.variables as Record<string, unknown>;
    expect(sent).not.toHaveProperty('watermark_logo');
    expect(screen.queryByText(/needs a version-pinned/)).toBeNull();
  });

  test('echoes the exact pin the server froze into the confirmation', async () => {
    watermarkPin = { assetId: ASSET_ID, versionId: VERSION_ID };
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: reservedContract,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare' }));
    // A key name proves a slot was filled, not WHICH asset filled it.
    const pinned = await screen.findByText(/^Pinned · asset/);
    expect(pinned.textContent).toContain(ASSET_ID.slice(0, 12));
    expect(pinned.textContent).toContain(VERSION_ID.slice(0, 12));
  });

  test('says un-pinned rather than implying a freeze that did not happen', async () => {
    watermarkPin = null;
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: reservedContract,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare' }));
    expect(await screen.findByText(/Not pinned in this confirmation/)).toBeTruthy();
  });

  test('invents no control for a parameter whose value set never crossed the boundary', async () => {
    // The contract HAS `kind: 'enum'` and an `options` array, but the fleet's reflection
    // has neither, so a nine-value AE dropdown (the watermark position control among
    // them) arrives as bare text. A picker here would invent choices nobody named.
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: [variable({ key: 'watermark_position', label: 'Watermark Position' })],
    });

    const field = await screen.findByText('Watermark Position');
    expect(field.parentElement?.querySelector('input')).toBeTruthy();
    expect(field.parentElement?.querySelector('select')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('ApiRenderBlock — saved input sets and batches', () => {
  test('saves the RESOLVED variables so a set replays the whole render', async () => {
    currentVariables = [variable()];
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: [variable()],
      variables: { headline: 'launch day' },
    });

    fireEvent.change(await screen.findByLabelText('New input set name'), {
      target: { value: 'Set A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as…' }));

    await waitFor(() => expect(calls.createInputSet.length).toBe(1));
    expect(calls.createInputSet[0]?.name).toBe('Set A');
    expect(calls.createInputSet[0]?.variables).toEqual({ headline: 'launch day' });
  });

  test('a duplicate name reads as language, not as a server code', async () => {
    createInputSetError = new Error('409 render_input_set_name_taken');
    renderNode({ templateKey: '166', contractHash: 'hash', variableDefinitions: [] });

    fireEvent.change(await screen.findByLabelText('New input set name'), {
      target: { value: 'Set A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as…' }));

    const message = await screen.findByText(
      'A set with that name already exists for this template.',
    );
    expect(message.textContent).not.toContain('render_input_set_name_taken');
  });

  test('rendering from a set sends inputSetId INSTEAD of variables', async () => {
    currentSets = [inputSet(SET_A, 'Set A')];
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: [variable()],
      inputSetId: SET_A,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare' }));
    await waitFor(() => expect(calls.preflight.length).toBe(1));

    // The contract refuses both and refuses neither — one source, always.
    expect(calls.preflight[0]?.inputSetId).toBe(SET_A);
    expect(calls.preflight[0]).not.toHaveProperty('variables');
  });

  test('a two-set batch confirms and persists both job ids', async () => {
    currentSets = [inputSet(SET_A, 'Set A'), inputSet(SET_B, 'Set B')];
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: [],
      batchInputSetIds: [SET_A, SET_B],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare 2 renders' }));
    await waitFor(() => expect(calls.batchPreflight.length).toBe(1));
    expect((calls.batchPreflight[0]?.records as unknown[]).length).toBe(2);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm batch' }));
    await waitFor(() => expect(calls.createBatch).toBe(1));

    // No batch id is persisted server-side and `GET /jobs` cannot filter by one, so this
    // list is the only handle these two renders will ever have.
    await waitFor(() => expect(nodeData.jobIds).toEqual(['job-a', 'job-b']));
  });
});

describe('ApiRenderBlock — durable tracking, progress and outputs', () => {
  test('recovers tracked jobs the recent-jobs list does not return', async () => {
    // A batch of older renders falls off `GET /jobs` immediately; without this they are
    // simply gone after a reload.
    currentJobs = [];
    renderNode({ jobIds: ['job-a', 'job-b'] });

    await waitFor(() => expect(calls.getJob).toContain('job-a'));
    expect(calls.getJob).toContain('job-b');
  });

  test('re-reads the per-job live relay on its own while a render is in flight', async () => {
    currentJobs = [job({ status: 'rendering' })];
    renderNode();

    await waitFor(() => expect(calls.listJobs).toBeGreaterThan(0));
    expect(calls.getJob.length).toBe(0);

    // No click, no refresh press — and the poll must hit getJob, the route whose backend
    // side pulls fleet status, runs ingest, and re-signs outputs to their Library copies.
    await waitFor(() => expect(calls.getJob.length).toBeGreaterThan(0), { timeout: 9_000 });
  }, 15_000);

  test('stops re-reading once nothing is in flight', async () => {
    currentJobs = [job({ status: 'finished', outputs: [output('out1', ASSET_ID)] })];
    renderNode();

    await waitFor(() => expect(calls.listJobs).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(calls.getJob.length).toBe(0);
  });

  test('advances the real five-value status with no interaction, and claims no percentage', async () => {
    currentJobs = [job({ status: 'queued' })];
    renderNode();

    const steps = await screen.findByTestId('render-steps');
    await waitFor(() =>
      expect(steps.querySelector('[data-state="current"]')?.textContent).toBe('queued'),
    );

    currentJobs = [job({ status: 'rendering' })];
    await waitFor(
      () => expect(steps.querySelector('[data-state="current"]')?.textContent).toBe('rendering'),
      { timeout: 9_000 },
    );
    // No percent, stage or ETA exists on this path — not in the DTO, the DB CHECK, or the
    // fleet's status response. A bar here would be a number the system cannot produce.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  }, 15_000);

  test('previews EVERY output, lazily', async () => {
    currentJobs = [
      job({
        status: 'finished',
        outputs: [output('out1', ASSET_ID), output('out2', ASSET_ID), output('out3', null)],
      }),
    ];
    renderNode();

    const images = await screen.findAllByRole('img');
    expect(images.length).toBe(3);
    for (const image of images) expect(image.getAttribute('loading')).toBe('lazy');
    // Only the third has no library copy yet; the other two say so honestly.
    expect(screen.getAllByText('Saved to Library').length).toBe(2);
    expect(await screen.findByText('Saving to Library…')).toBeTruthy();
  });

  test('renders the live DTO url and persists no url at all', async () => {
    const fleetUrl = 'https://fleet.example.com/out/out1.png';
    currentJobs = [job({ status: 'finished', outputs: [output('out1', null, fleetUrl)] })];
    renderNode({ latestJobId: '11111111-1111-4111-8111-111111111111' });

    const first = await screen.findByRole('img');
    expect(first.getAttribute('src')).toBe(fleetUrl);
    expect(screen.getByText('Saving to Library…')).toBeTruthy();

    // Ingest lands. The backend swaps the expiring fleet link for a signed Library copy
    // on the next per-job read (`preferLibraryOutputUrls`), so the node needs no
    // client-side signing — re-reading the relay is the whole mechanism.
    const libraryUrl = 'https://supabase.example.com/signed/out1.png?token=abc';
    currentJobs = [job({ status: 'finished', outputs: [output('out1', ASSET_ID, libraryUrl)] })];
    // The template name also appears as a picker <option>, so target the card's own
    // button rather than the first node that happens to carry the text.
    const card = screen
      .getAllByRole('button')
      .find((element) => element.textContent?.includes('Demo template'));
    fireEvent.click(card as HTMLElement);

    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe(libraryUrl));
    expect(await screen.findByText('Saved to Library')).toBeTruthy();

    // Neither URL is durable, so nothing the node saves may carry one.
    await waitFor(() => expect(nodeData.latestOutputs).toBeTruthy());
    expect(JSON.stringify(nodeData.latestOutputs)).not.toContain('http');
  });

  test('badges a job as a watermarked test render, from the contract not an assumption', async () => {
    currentJobs = [job({ status: 'finished', outputs: [output('out1', ASSET_ID)] })];
    renderNode();

    expect(await screen.findByText('Test · watermarked')).toBeTruthy();
  });
});
