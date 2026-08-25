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
 *   6. one of five saved sets and all five take the SAME route — exactly the checked
 *      records, in the order they were checked, one confirm for the lot — and every job id
 *      the 202 returns is persisted, because that response is the only handle these renders
 *      will ever have: no batch id is stored server-side;
 *   7. tracked ids survive a remount the recent-jobs list does not cover — all five of
 *      them, each re-read from the per-job relay and previewed from its own Library copy;
 *   8. progress advances on its own from the REAL five-value status, with no percentage;
 *   9. EVERY output is previewed, lazily, from the live DTO — never from persisted data;
 *  10. no control is invented for a parameter whose value set never crossed the boundary;
 *  11. a finished image output becomes an ordinary canvas reference node pinned to its EXACT
 *      Library version — one per output, idempotent, and carrying no URL-only identity.
 *
 * UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
 *   · a real browser, the real canvas, or a reload. `apiRendersApi` is mocked here.
 *   · the backend, the render fleet, the library ingest, or the signed Library URL the
 *     backend now prefers. That whole chain is proven live by `render:library:e2e:bench`.
 *   · any live render or Meta publication. Nothing here fires one.
 *   · the poll's three-per-tick window. Five in-flight renders advance head-first by
 *     design (`useApiRenderJobs` caps the fan-out so a batch confirm cannot turn the poll
 *     into one); proving the tail drains needs real timers and several 5s ticks.
 *
 * Runs under `bun test` for the happy-dom preload in bunfig.toml.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderInputSet,
  type ApiRenderJob,
  type ApiRenderVariable,
} from '@continuum/contracts';
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
const SET_C = '77777777-7777-4777-8777-777777777777';
const SET_D = '88888888-8888-4888-8888-888888888888';
const SET_E = '99999999-9999-4999-8999-999999999999';

/** Five saved sets is the shape the node is actually sold on: one template, five variations. */
const FIVE_SETS: ApiRenderInputSet[] = [
  inputSet(SET_A, 'Set A'),
  inputSet(SET_B, 'Set B'),
  inputSet(SET_C, 'Set C'),
  inputSet(SET_D, 'Set D'),
  inputSet(SET_E, 'Set E'),
];

const variationId = (index: number) => `job-${index}`;
const VARIATION_IDS = [0, 1, 2, 3, 4].map(variationId);

// A finished variation, with the Library-signed URL the backend swaps in once ingest lands
// and its OWN durable coordinates — a shared assetId would prove nothing about "each".
const variationUrl = (index: number) =>
  `https://supabase.example.com/signed/variation-${index}.png?token=t${index}`;
const variationAsset = (index: number) => ({
  assetId: `aaaaaaa${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  versionId: `bbbbbbb${index}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
});
const variation = (index: number): ApiRenderJob =>
  job({
    id: variationId(index),
    status: 'finished',
    outputs: [
      {
        ...output(`out-${index}`, variationAsset(index).assetId, variationUrl(index)),
        versionId: variationAsset(index).versionId,
      },
    ],
  });

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
/** The jobs `POST /batches` hands back — the count is the thing under test, so it is a variable. */
let currentBatchJobs: ApiRenderJob[] = [];
/**
 * Which of `currentJobs` the recent-jobs list admits to having. `null` is "all of them";
 * `[]` is the batch that has already fallen off `GET /jobs?limit=8`, which is the only
 * state in which the tracked-id recovery is doing any work at all.
 */
let listedJobIds: string[] | null = null;
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
  currentBatchJobs = [
    job({ id: 'job-a', status: 'queued' }),
    job({ id: 'job-b', status: 'queued' }),
  ];
  listedJobIds = null;
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
      const admitted = listedJobIds;
      return {
        items: admitted === null ? currentJobs : currentJobs.filter((j) => admitted.includes(j.id)),
        nextCursor: null,
      };
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
        // Echo what was actually asked for. A constant record list here would make the
        // count and the labels on screen independent of the sets the user checked —
        // which is the one thing these tests exist to hold the node to.
        records: (input.records as { label: string }[]).map((record) => ({
          label: record.label,
          inputKeys: ['headline'],
        })),
        effects: 'none',
      };
    },
    createBatch: async () => {
      calls.createBatch += 1;
      return { batchId: '66666666-6666-4666-8666-666666666666', jobs: currentBatchJobs };
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

function renderNode(
  data: Record<string, unknown> = {},
  brandId = BRAND_ID,
  graph: { nodes?: unknown[]; edges?: unknown[] } = {},
) {
  nodeData = { variables: {}, status: 'idle', ...data };
  useStudioStore.setState({
    brandId,
    nodes: graph.nodes ?? [],
    edges: graph.edges ?? [],
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

describe('ApiRenderBlock — a multiple media variable', () => {
  const gallery = variable({
    key: 'gallery',
    label: 'Gallery',
    kind: 'image',
    required: true,
    multiple: true,
  });
  const pin = (index: number) => ({
    assetId: `0000000${index}-0000-4000-8000-00000000000${index}`,
    versionId: `0000000${index}-0000-4000-9000-00000000000${index}`,
  });
  const libraryNode = (index: number) => ({
    id: `image-${index}`,
    type: 'image',
    data: { assetId: pin(index).assetId, assetVersionId: pin(index).versionId },
  });
  const galleryEdge = (index: number) => ({
    id: `edge-${index}`,
    source: `image-${index}`,
    sourceHandle: 'image',
    target: 'render1',
    targetHandle: 'variable-gallery',
  });
  const WIRED = [3, 1, 4, 2, 5];

  test('sends five wired Library images as five pins, in the order they were wired', async () => {
    currentVariables = [gallery];
    renderNode(
      { templateKey: '166', contractHash: 'hash', variableDefinitions: [gallery] },
      BRAND_ID,
      { nodes: WIRED.map(libraryNode), edges: WIRED.map(galleryEdge) },
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare' }));
    await waitFor(() => expect(calls.preflight.length).toBe(1));

    const sent = (calls.preflight[0]?.variables as Record<string, unknown>).gallery;
    // Edge order, not node order and not sorted — a media_list port is looped over in
    // the order it arrives, so position is meaning.
    expect(sent).toEqual(WIRED.map(pin));
  });

  test('refuses to prepare when one of the five has no Library identity', async () => {
    // Sending four would render successfully and WRONGLY — a shorter list than the
    // canvas shows. Refusing is the only honest answer.
    currentVariables = [gallery];
    renderNode(
      { templateKey: '166', contractHash: 'hash', variableDefinitions: [gallery] },
      BRAND_ID,
      {
        nodes: [
          ...[1, 2, 4, 5].map(libraryNode),
          { id: 'image-3', type: 'image', data: { image: 'data:image/png;base64,preview' } },
        ],
        edges: [1, 2, 3, 4, 5].map(galleryEdge),
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare' }));
    expect(await screen.findByText('Gallery needs a version-pinned Library asset')).toBeTruthy();
    expect(calls.preflight.length).toBe(0);
  });

  test('says one-or-more on a list port and exactly-one on a single port', async () => {
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: [
        gallery,
        variable({ key: 'hero_image', label: 'Hero image', kind: 'image' }),
      ],
    });

    expect(
      await screen.findByText(`Connect up to ${API_RENDER_MEDIA_LIST_MAX} version-pinned image`, {
        exact: false,
      }),
    ).toBeTruthy();
    expect(await screen.findByText('Connect a version-pinned image Library node')).toBeTruthy();
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

  test('checks exactly one of five saved sets and preflights only that record', async () => {
    currentSets = FIVE_SETS;
    renderNode({ templateKey: '166', contractHash: 'hash', variableDefinitions: [] });

    fireEvent.click(await screen.findByLabelText('Set C'));
    await waitFor(() => expect(nodeData.batchInputSetIds).toEqual([SET_C]));

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare 1 render' }));
    await waitFor(() => expect(calls.batchPreflight.length).toBe(1));

    // One of five is still a batch of one — the single-render route is never touched, so
    // there is one confirmation token whether the user picked one set or all five.
    expect(calls.preflight.length).toBe(0);
    // Not a count: the id and the label of the set that was actually checked, and nothing
    // from the four that were not.
    expect(calls.batchPreflight[0]?.records).toEqual([{ label: 'Set C', inputSetId: SET_C }]);
    expect(await screen.findByText('1 render prepared')).toBeTruthy();
    expect(screen.getByText('Set C · 1 inputs')).toBeTruthy();
    expect(screen.queryByText('Set A · 1 inputs')).toBeNull();

    // The other half of "exactly one": the selection must swap, not accumulate.
    fireEvent.click(screen.getByLabelText('Set D'));
    fireEvent.click(screen.getByLabelText('Set C'));
    await waitFor(() => expect(nodeData.batchInputSetIds).toEqual([SET_D]));
  });

  test('checks all five and confirms them as five jobs, persisting every returned id', async () => {
    currentSets = FIVE_SETS;
    // Scrambled on purpose: the records follow CLICK order, the same rule the media-list
    // port follows, so this proves the order is carried rather than re-sorted.
    const clicks = [
      { label: 'Set C', inputSetId: SET_C },
      { label: 'Set A', inputSetId: SET_A },
      { label: 'Set E', inputSetId: SET_E },
      { label: 'Set B', inputSetId: SET_B },
      { label: 'Set D', inputSetId: SET_D },
    ];
    currentBatchJobs = VARIATION_IDS.map((id) => job({ id, status: 'queued' }));
    // What `GET /jobs?limit=8` really returns the moment after the five are created.
    currentJobs = currentBatchJobs;
    renderNode({
      templateKey: '166',
      contractHash: 'hash',
      variableDefinitions: [],
      // A render this node already tracked. Confirming five must ADD to it, not replace it.
      jobIds: ['job-old'],
    });

    for (const { label } of clicks) {
      fireEvent.click(await screen.findByLabelText(label));
    }
    await waitFor(() =>
      expect(nodeData.batchInputSetIds).toEqual(clicks.map((click) => click.inputSetId)),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare 5 renders' }));
    await waitFor(() => expect(calls.batchPreflight.length).toBe(1));
    expect(calls.batchPreflight[0]?.records).toEqual(clicks);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm batch' }));
    // ONE confirmation request from the browser for all five, not five `createJob` calls
    // the client could drop partway through its own loop.
    //
    // That is a claim about the CLIENT and nothing more. The server is not atomic:
    // `service.createBatch` loops `createJob` over the batch token's five sub-tokens
    // sequentially with no transaction, so a fleet outage on record three leaves the
    // first two queued. All-or-nothing is what `batchPreflight` gives — it validates
    // every record before minting anything — and it covers validation, not submission.
    await waitFor(() => expect(calls.createBatch).toBe(1));

    await waitFor(() => expect(nodeData.jobIds).toEqual(['job-old', ...VARIATION_IDS]));
    expect(nodeData.latestJobId).toBe(VARIATION_IDS[0]);
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

  test('recovers all five tracked variations the list drops, each previewed from its Library copy', async () => {
    // The five finished renders exist, and `GET /jobs` admits to none of them — a batch of
    // five falls off the recent list the moment anything else renders for this brand. The
    // tracked ids plus the per-job relay are the entire handle.
    currentJobs = [0, 1, 2, 3, 4].map(variation);
    listedJobIds = [];
    renderNode({ jobIds: VARIATION_IDS, latestJobId: VARIATION_IDS[0] });

    await waitFor(() => expect(calls.getJob.length).toBeGreaterThanOrEqual(5));
    for (const id of VARIATION_IDS) expect(calls.getJob).toContain(id);

    // Each variation shows ITS OWN signed Library URL, in tracked order — not one preview
    // repeated, and not the fleet's expiring link.
    await waitFor(() => expect(screen.getAllByRole('img').length).toBe(5));
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('src'))).toEqual(
      [0, 1, 2, 3, 4].map(variationUrl),
    );
    expect(screen.getAllByText('Saved to Library').length).toBe(5);

    // And the coordinates the node persists are the durable pair, with no URL of either
    // kind — both expire, so a saved one is a broken preview on the next open.
    await waitFor(() => expect(nodeData.latestOutputs).toBeTruthy());
    expect(nodeData.latestOutputs).toEqual([
      {
        id: 'out-0',
        kind: 'image',
        fileName: 'out-0.png',
        assetId: variationAsset(0).assetId,
        versionId: variationAsset(0).versionId,
      },
    ]);
    expect(JSON.stringify(nodeData.latestOutputs)).not.toContain('http');
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

describe('ApiRenderBlock — a finished output as a canvas reference', () => {
  // A render node only produces a reference if it is itself on the canvas — the new node
  // is positioned next to it, so the store has to hold both.
  const canvasNode = { id: 'render1', type: 'apiRender', position: { x: 120, y: 40 }, data: {} };

  const finishedOutput = (index: number) => ({
    ...output(`out-${index}`, variationAsset(index).assetId, variationUrl(index)),
    versionId: variationAsset(index).versionId,
  });

  const referenceNodes = () =>
    useStudioStore.getState().nodes.filter((node) => node.type === 'image');

  test('each output adds its own node, pinned to its own exact version', async () => {
    currentJobs = [job({ status: 'finished', outputs: [finishedOutput(0), finishedOutput(1)] })];
    renderNode({}, BRAND_ID, { nodes: [canvasNode] });

    const buttons = await screen.findAllByRole('button', { name: 'Use as reference' });
    expect(buttons.length).toBe(2);
    for (const button of buttons) act(() => fireEvent.click(button));

    await waitFor(() => expect(referenceNodes().length).toBe(2));
    const [first, second] = referenceNodes().map((node) => node.data as Record<string, unknown>);

    // Each output's OWN pair. A shared asset id here would prove nothing about "each".
    expect(first.assetId).toBe(variationAsset(0).assetId);
    expect(first.assetVersionId).toBe(variationAsset(0).versionId);
    expect(second.assetId).toBe(variationAsset(1).assetId);
    expect(second.assetVersionId).toBe(variationAsset(1).versionId);

    // The preview is the live DTO url and it expires — the durable pair above is what the
    // canvas re-sign path uses on the next load, so nothing is frozen into originalImage.
    expect(first.image).toBe(variationUrl(0));
    expect(first.sourceUrl).toBe(variationUrl(0));
    expect(first.referenceStatus).toBe('ready');
    expect(first).not.toHaveProperty('originalImage');
    expect(first.fileName).toBe('out-0.png');
  });

  test('the node it adds is a plain image node, so the reference handle is already there', async () => {
    currentJobs = [job({ status: 'finished', outputs: [finishedOutput(0)] })];
    renderNode({}, BRAND_ID, { nodes: [canvasNode] });

    const button = await screen.findByRole('button', { name: 'Use as reference' });
    act(() => fireEvent.click(button));

    await waitFor(() => expect(referenceNodes().length).toBe(1));
    // `image` is what resolveApiRenderVariables and every generator read; ApiRenderBlock
    // adds no source handle of its own, because ImageNode already owns that wire.
    expect(referenceNodes()[0].type).toBe('image');
  });

  test('clicking the same output twice does not add a second copy', async () => {
    currentJobs = [job({ status: 'finished', outputs: [finishedOutput(0)] })];
    renderNode({}, BRAND_ID, { nodes: [canvasNode] });

    const button = await screen.findByRole('button', { name: 'Use as reference' });
    act(() => fireEvent.click(button));
    await waitFor(() => expect(referenceNodes().length).toBe(1));

    act(() => fireEvent.click(button));
    await waitFor(() => expect(screen.getByText('Already on the canvas')).toBeTruthy());
    expect(referenceNodes().length).toBe(1);
  });

  test('offers nothing for an output that has no Library identity yet', async () => {
    // Ingest has not landed, so there is no version to pin to. A button here would add a
    // node whose only handle on its bytes is a link that expires.
    currentJobs = [job({ status: 'finished', outputs: [output('out1', null)] })];
    renderNode({}, BRAND_ID, { nodes: [canvasNode] });

    expect(await screen.findByText('Saving to Library…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use as reference' })).toBeNull();
  });

  test('offers nothing for a video output', async () => {
    currentJobs = [
      job({
        status: 'finished',
        outputs: [{ ...finishedOutput(0), kind: 'video' as const, fileName: 'out-0.mp4' }],
      }),
    ];
    renderNode({}, BRAND_ID, { nodes: [canvasNode] });

    expect(await screen.findByText('Saved to Library')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use as reference' })).toBeNull();
  });
});
