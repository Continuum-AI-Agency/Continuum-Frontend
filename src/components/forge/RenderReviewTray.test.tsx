/**
 * RenderReviewTray against a mocked render API and a stubbed paid-targets route.
 *
 * Review lists exactly the rows × formats it was handed and the batch readiness per row; Deliver
 * reads its defaults as one line, and Change offers the Library (always), the brand's Slack
 * destinations (with add-a-channel, and the not-connected / not-installed / unavailable states),
 * Meta and approval rooms. Without a Meta target Deliver renders from there — Proof or Final, and
 * each row's output — with ONE batch preflight carrying `slack`, `final` and each row's delivery,
 * then the confirmed token, and Running follows the fired jobs. A Meta target adds Confirm, needs
 * an approval room first, carries the rooms and a replacing row narrowed to its one format — for a
 * template with no authored outputs, one of its parse comps by name — and the preflight's approver
 * warning shows in Running. A refusal keeps the tray where it was with the
 * reason and nothing fired. One primary button moves it on. It is a docked region, never a
 * dialog: a change to the rows after review sends it back to Review and re-checks by itself.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type {
  ApiRenderBatchReadiness,
  ApiRenderBatchRecord,
  ApiRenderDeliveryDestinationsResponse,
  ApiRenderJob,
  ApiRenderTemplateContract,
  PaidCanvasTarget,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/errors';

const READY: ApiRenderBatchReadiness = {
  state: 'INCOMPLETE',
  totalRows: 2,
  readyRows: 1,
  blockedRows: 0,
  unknownRows: 1,
  findings: [
    {
      code: 'ASSET_CLIPPED',
      severity: 'warn',
      message: 'The hero image is cropped at the top.',
      variableKey: 'hero',
      rowIndexes: [1],
    },
  ],
};

const OPS = {
  id: '66666666-6666-4666-8666-666666666661',
  role: 'ops' as const,
  channelId: 'C1',
  channelName: 'renders',
};
const CLIENT = {
  id: '66666666-6666-4666-8666-666666666662',
  role: 'client' as const,
  channelId: 'C2',
  channelName: 'client-review',
};
const destinations = (
  slack: Partial<ApiRenderDeliveryDestinationsResponse['slack']> = {},
  meta: Partial<ApiRenderDeliveryDestinationsResponse['meta']> = {},
): ApiRenderDeliveryDestinationsResponse => ({
  slack: { state: 'ready', workspaceName: 'Continuum', destinations: [OPS], ...slack },
  meta: { connected: false, adAccountId: null, adAccountName: null, ...meta },
});

const batchPreflightMock = mock(async (_input: unknown) => ({
  confirmationToken: 'batch-token',
  readiness: READY,
}));
const queuedJob = (id: string, label: string, rowId: string): ApiRenderJob =>
  ({
    id,
    brandId: '22222222-2222-4222-8222-222222222222',
    templateKey: '133',
    templateName: 'forge_bench_starcraft',
    contractHash: 'hash',
    taskUid: null,
    status: 'queued',
    test: true,
    outputs: [],
    delivery: [],
    error: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
    label,
    labelPath: label === 'Root' ? ['Root'] : ['Root', label],
    renderSetRowId: rowId,
    fit: null,
    judge: null,
    deliveryTarget: null,
  }) as unknown as ApiRenderJob;
const JOBS = [
  queuedJob('11111111-1111-4111-8111-111111111111', 'Root', 'root'),
  queuedJob('11111111-1111-4111-8111-111111111112', 'Spain', 'spain'),
];
const JOB_IDS = JOBS.map((job) => job.id);
const createBatchMock = mock(async (_input: unknown) => ({
  batchId: '99999999-9999-4999-8999-999999999999',
  jobs: JOBS,
}));
const listDestinationsMock = mock(async (_brandId: string) => destinations());
const listSlackChannelsMock = mock(async (_brandId: string) => ({
  workspaceName: 'Continuum',
  channels: [
    { id: 'C1', name: 'renders', isPrivate: false, isMember: true },
    { id: 'C2', name: 'client-review', isPrivate: false, isMember: true },
  ],
}));
const createDestinationMock = mock(async (_input: unknown) => CLIENT);

const ad = (id: string, level: PaidCanvasTarget['level'], name: string): PaidCanvasTarget => ({
  id,
  level,
  name,
  status: 'PAUSED',
  campaignId: level === 'campaign' ? null : 'c1',
  campaignName: level === 'campaign' ? null : 'Summer launch',
  adsetId: level === 'ad' ? 's1' : null,
  adsetName: level === 'ad' ? 'Spain 18–34' : null,
  creativeId: level === 'ad' ? 'cr_1' : null,
  format: null,
  previewUrl: null,
});
const searchPaidMock = mock(async (input: { level: string }) => ({
  adAccountId: 'act_1',
  nextCursor: null,
  items:
    input.level === 'campaign'
      ? [ad('c1', 'campaign', 'Summer launch')]
      : input.level === 'adset'
        ? [ad('s1', 'adset', 'Spain 18–34')]
        : [ad('1201', 'ad', 'Hero story')],
}));

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    batchPreflight: batchPreflightMock,
    createBatch: createBatchMock,
    listDeliveryDestinations: listDestinationsMock,
    listSlackChannels: listSlackChannelsMock,
    createDeliveryDestination: createDestinationMock,
    listJobs: async () => ({ items: JOBS, nextCursor: null }),
    getJob: async (_brandId: string, id: string) => JOBS.find((job) => job.id === id),
  },
}));
const ROOM = {
  id: '77777777-7777-4777-8777-777777777771',
  platform: 'slack' as const,
  role: 'client',
  name: 'client-review',
  activeApprovers: 0,
  requestedApprovers: 0,
};
mock.module('@/lib/library/renderApprovals', () => ({
  fetchRenderApprovals: async () => [],
  decideRenderApproval: async () => {
    throw new Error('not in this test');
  },
  fetchApprovalDestinations: async () => ({ destinations: [ROOM] }),
  fetchDestinationApprovers: async () => [],
  addDestinationApprover: async () => {
    throw new Error('not in this test');
  },
  activateDestinationApprover: async () => {
    throw new Error('not in this test');
  },
  revokeDestinationApprover: async () => {
    throw new Error('not in this test');
  },
}));
mock.module('@/StudioCanvas/nodes/publish/publishingApi', () => ({
  publishingApi: { searchPaid: searchPaidMock },
}));
mock.module('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { useState } from 'react';
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';
import { registerToastSink } from '@/components/ui/toast-imperative';
import { FORGE_APPROVAL_COPY } from './ApprovalDestinationsField';
import { forgeQueryKeys } from './queryKeys';
import { type RenderPreflightRow, RenderReviewTray } from './RenderReviewTray';

// A sink per test, not a module mock: `mock.module` outlives this file in a multi-file run and
// would swallow every other file's toasts.
const toasts: string[] = [];
let unregisterToasts = () => {};
beforeEach(() => {
  unregisterToasts = registerToastSink(({ title }) => toasts.push(String(title)));
  toasts.length = 0;
});

const BRAND = '22222222-2222-4222-8222-222222222222';
const BINDING = '44444444-4444-4444-8444-444444444444';
const SET = '33333333-3333-4333-8333-333333333333';

const CONTRACT = {
  template: {
    key: '133',
    name: 'forge_bench_starcraft',
    displayName: 'StarCraft Promo',
    contractHash: 'hash',
    outputKinds: ['image', 'video'],
  },
  variables: [{ key: 'hero', label: 'Hero' }],
  outputs: [
    { id: 'square', label: 'Square', ratio: '1:1' },
    { id: 'story', label: 'Story', ratio: '9:16' },
  ],
} as unknown as ApiRenderTemplateContract;

const ROWS: RenderPreflightRow[] = [
  { rowId: 'root', label: 'Root', labelPath: ['Root'], outputIds: ['square', 'story'] },
  { rowId: 'spain', label: 'Spain', labelPath: ['Root', 'Spain'], outputIds: ['story'] },
];

const RECORDS: ApiRenderBatchRecord[] = [
  {
    label: 'Root',
    renderSetId: SET,
    renderSetRowId: 'root',
    variables: { headline: 'Hola' },
    outputIds: ['square', 'story'],
  },
  {
    label: 'Spain',
    renderSetId: SET,
    renderSetRowId: 'spain',
    variables: { headline: 'Hola España' },
    outputIds: ['story'],
  },
];

type Snapshot = { reviewKey: number; stale: boolean; recheckBlocked?: string | null };

/** Holds rows the way RenderRequestsGrid does, so a delivery picked in the tray comes back in. */
function Harness({
  bindingId,
  initialRows = ROWS,
  records = RECORDS,
  contract = CONTRACT,
  finalBlocked = null,
  snapshot,
  handlers,
}: {
  bindingId: string | null;
  initialRows?: RenderPreflightRow[];
  records?: ApiRenderBatchRecord[];
  contract?: ApiRenderTemplateContract;
  finalBlocked?: string | null;
  snapshot: Snapshot;
  handlers: ReturnType<typeof trayHandlers>;
}) {
  const [rows, setRows] = useState(initialRows);
  return (
    <RenderReviewTray
      brandId={BRAND}
      bindingId={bindingId}
      templateKey="133"
      contractHash="hash"
      contract={contract}
      rows={rows}
      records={records}
      reviewKey={snapshot.reviewKey}
      stale={snapshot.stale}
      recheckBlocked={snapshot.recheckBlocked ?? null}
      rechecking={false}
      finalBlocked={finalBlocked}
      onDeliveryChange={(rowId, delivery) =>
        setRows((current) =>
          current.map((row) =>
            row.rowId === rowId ? { ...row, delivery: delivery ?? undefined } : row,
          ),
        )
      }
      {...handlers}
    />
  );
}

const trayHandlers = () => ({
  onFired: mock((_ids: string[]) => undefined),
  onClose: mock(() => undefined),
  onRecheck: mock(() => undefined),
  onOpenLedger: mock((_ids: string[]) => undefined),
  onShowRow: mock((_rowId: string) => undefined),
});

function renderTray(
  bindingId: string | null = BINDING,
  data: {
    rows?: RenderPreflightRow[];
    records?: ApiRenderBatchRecord[];
    contract?: ApiRenderTemplateContract;
    finalBlocked?: string | null;
    /** The brand's template sources, as ForgeWorkbench has already read them. */
    sources?: Array<{ templateKey: string | null; parse: unknown }>;
  } = {},
) {
  const handlers = trayHandlers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data.sources) client.setQueryData(forgeQueryKeys.templateSources(BRAND), data.sources);
  const ui = (snapshot: Snapshot) => (
    <QueryClientProvider client={client}>
      <Harness
        bindingId={bindingId}
        initialRows={data.rows}
        records={data.records}
        contract={data.contract}
        finalBlocked={data.finalBlocked}
        snapshot={snapshot}
        handlers={handlers}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(ui({ reviewKey: 1, stale: false }));
  return { ...handlers, snapshot: (next: Snapshot) => rerender(ui(next)) };
}

/** The Review line for one row, as read: the ratios it renders and its file count. */
const reviewLine = (name: string) => {
  const line = screen.getByRole('button', { name, exact: true }).closest('li')!;
  return {
    ratios: [...line.querySelectorAll<HTMLElement>('[data-ratio]')].map(
      (chip) => chip.dataset.ratio,
    ),
    files: within(line).getByText(/^\d+ files?$/).textContent,
    formats: line.textContent,
  };
};

const HERO_STORY = {
  action: 'replace' as const,
  adAccountId: 'act_1',
  campaignId: 'c1',
  campaignName: 'Summer launch',
  adsetId: 's1',
  adsetName: 'Spain 18–34',
  adId: '1201',
  adName: 'Hero story',
};

/** The tray's one primary button, pressed once it is enabled. */
const press = async (name: string) => {
  const button = await screen.findByRole<HTMLButtonElement>('button', { name });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};

/** Deliver starts folded to one line; Change opens every destination. */
const changeDelivery = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'Change delivery' }));

const primaryDisabled = (name: string) =>
  screen.getByRole<HTMLButtonElement>('button', { name }).disabled;

afterEach(() => {
  unregisterToasts();
  cleanup();
  for (const fn of [
    batchPreflightMock,
    createBatchMock,
    listDestinationsMock,
    listSlackChannelsMock,
    createDestinationMock,
    searchPaidMock,
  ])
    fn.mockClear();
  listDestinationsMock.mockImplementation(async () => destinations());
  listSlackChannelsMock.mockImplementation(async () => ({
    workspaceName: 'Continuum',
    channels: [
      { id: 'C1', name: 'renders', isPrivate: false, isMember: true },
      { id: 'C2', name: 'client-review', isPrivate: false, isMember: true },
    ],
  }));
  createDestinationMock.mockImplementation(async () => CLIENT);
});

installPickerDomGlobals();

describe('RenderReviewTray · Review', () => {
  test('reviews exactly the rows × formats it was handed, with readiness per row', async () => {
    renderTray();
    expect(await screen.findByText('Render 2 rows')).toBeTruthy();
    expect(screen.getByText('StarCraft Promo · 3 files')).toBeTruthy();
    expect(reviewLine('Root')).toMatchObject({ ratios: ['1:1', '9:16'], files: '2 files' });
    expect(reviewLine('Root / Spain')).toMatchObject({ ratios: ['9:16'], files: '1 file' });
    expect(
      await screen.findByText(
        'Check incomplete · 1 row couldn’t be fully checked — they can still render',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Hero: The hero image is cropped at the top.')).toBeTruthy();

    // Review reads the records as built: no delivery, no Slack, every format.
    expect(batchPreflightMock).toHaveBeenCalledTimes(1);
    expect(batchPreflightMock.mock.calls[0]?.[0]).toEqual({
      brandId: BRAND,
      bindingId: BINDING,
      templateKey: '133',
      contractHash: 'hash',
      records: RECORDS,
    });
    expect(createBatchMock).not.toHaveBeenCalled();
  }, 30_000);

  test('a row with no formats picked renders every format, and its record names none', async () => {
    const records: ApiRenderBatchRecord[] = [
      RECORDS[0]!,
      { label: 'Spain', renderSetId: SET, renderSetRowId: 'spain', variables: { h: 'Hola' } },
    ];
    const { onFired } = renderTray(null, {
      rows: [ROWS[0]!, { ...ROWS[1]!, outputIds: [] }],
      records,
    });
    expect(await screen.findByText('StarCraft Promo · 4 files')).toBeTruthy();
    expect(reviewLine('Root / Spain')).toMatchObject({ ratios: ['1:1', '9:16'], files: '2 files' });
    expect(reviewLine('Root')).toMatchObject({ ratios: ['1:1', '9:16'], files: '2 files' });

    await press('Next: delivery');
    await press('Render 4 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    const fired = batchPreflightMock.mock.calls[1]?.[0] as { records: ApiRenderBatchRecord[] };
    expect(fired.records[1]).toEqual(records[1]!);
    expect('outputIds' in fired.records[1]!).toBe(false);
  }, 30_000);

  test('a replacing row counts one render on its own line, the same as the header', async () => {
    // A spreadsheet import can hand a row its ad before the tray opens.
    renderTray(BINDING, { rows: [{ ...ROWS[0]!, delivery: HERO_STORY }, ROWS[1]!] });
    expect(await screen.findByText('StarCraft Promo · 2 files')).toBeTruthy();
    expect(reviewLine('Root')).toMatchObject({ ratios: [], files: '1 file' });
    expect(reviewLine('Root').formats).toContain('One format');
    expect(reviewLine('Root / Spain')).toMatchObject({ ratios: ['9:16'], files: '1 file' });
  }, 30_000);

  test('a guardrail refusal says why and does not let the batch move on', async () => {
    batchPreflightMock.mockImplementationOnce(async () => {
      throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
        guardrails: [
          { code: 'BRAND_COLOR_OUTSIDE_PALETTE', message: 'Use a permitted brand color.' },
        ],
      });
    });
    renderTray();
    expect(await screen.findByText('Use a permitted brand color.')).toBeTruthy();
    expect(primaryDisabled('Next: delivery')).toBe(true);
  }, 30_000);

  test('closing — the button or Esc — fires nothing', async () => {
    const { onClose } = renderTray();
    fireEvent.click(await screen.findByRole('button', { name: 'Close review' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next: delivery' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(createBatchMock).not.toHaveBeenCalled();
  }, 30_000);

  test('docks as a region beside the grid — no dialog — and a row name shows that row', async () => {
    const { onShowRow } = renderTray();
    const tray = await screen.findByRole('region', { name: 'Review and render' });
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    fireEvent.click(within(tray).getByRole('button', { name: 'Root / Spain' }));
    expect(onShowRow).toHaveBeenCalledWith('spain');
  }, 30_000);

  test('a change after review goes back to Review and re-checks by itself once the rows settle', async () => {
    const { snapshot, onRecheck, onFired } = renderTray();
    await press('Next: delivery');
    expect(screen.getByRole('button', { name: 'Render 3 files' })).toBeTruthy();

    // A row was edited in the grid while the tray sat on Deliver.
    snapshot({ reviewKey: 1, stale: true });
    const current = () =>
      within(screen.getByRole('list', { name: 'Pre-flight steps' })).getByRole('listitem', {
        current: 'step',
      }).textContent;
    await waitFor(() => expect(current()).toBe('Review'));
    expect(screen.getByText('Rows changed since review')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Render/ })).toHaveLength(0);
    expect(primaryDisabled('Next: delivery')).toBe(true);
    // Nothing to press: the re-check runs on the preflight debounce, once.
    expect(screen.queryAllByRole('button', { name: 'Re-check' })).toHaveLength(0);
    await waitFor(() => expect(onRecheck).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock).toHaveBeenCalledTimes(1);

    // The grid re-saved and handed over a fresh snapshot: it is reviewed again, then renders.
    snapshot({ reviewKey: 2, stale: false });
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Rows changed since review')).toBeNull();
    await press('Next: delivery');
    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    expect(createBatchMock).toHaveBeenCalledTimes(1);
    expect(onRecheck).toHaveBeenCalledTimes(1);
  }, 30_000);

  test('a re-check that cannot run says why, with a disabled Re-check, and does not fire', async () => {
    const { snapshot, onRecheck } = renderTray();
    await screen.findByText(/Check incomplete/);
    snapshot({ reviewKey: 1, stale: true, recheckBlocked: 'Select the rows to render' });
    expect(await screen.findByText('— Select the rows to render.')).toBeTruthy();
    const recheck = screen.getByRole<HTMLButtonElement>('button', { name: 'Re-check' });
    expect(recheck.disabled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(onRecheck).not.toHaveBeenCalled();
  }, 30_000);
});

describe('RenderReviewTray · Deliver + Confirm', () => {
  test('Change moves focus into the delivery options, so Escape still closes the tray', async () => {
    const { onClose } = renderTray(null);
    await press('Next: delivery');
    await changeDelivery();
    const options = screen.getByRole('region', { name: 'Delivery options' });
    await waitFor(() => expect(document.activeElement === options).toBe(true));
    fireEvent.keyDown(options, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Library only: one line of defaults, then Render fires a Proof from Deliver, no bindingId', async () => {
    const { onFired } = renderTray(null);
    await press('Next: delivery');
    // No Meta target, so there is no Confirm step: Deliver is the last look.
    expect(
      within(screen.getByRole('list', { name: 'Pre-flight steps' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Review', 'Deliver', 'Running']);
    const line = screen.getByRole('button', { name: 'Change delivery' }).closest('p')!;
    expect(within(line).getByText('Library')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Proof' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Proof · 3 files · Library')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    await changeDelivery();
    expect(screen.getByText(/Every render is saved to this brand’s Library/)).toBeTruthy();
    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(JOB_IDS));

    const fired = batchPreflightMock.mock.calls[1]?.[0];
    expect(fired).toEqual({
      brandId: BRAND,
      templateKey: '133',
      contractHash: 'hash',
      records: RECORDS,
    });
    expect(createBatchMock.mock.calls[0]?.[0]).toEqual({ confirmationToken: 'batch-token' });
    expect(toasts).toContain('2 renders queued');
  }, 30_000);

  test('Final is signed into the render’s preflight; the review never asks for one', async () => {
    const { onFired } = renderTray();
    await press('Next: delivery');
    fireEvent.click(screen.getByRole('radio', { name: 'Final' }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Final' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    expect(screen.getByText('Final · 3 files · Library')).toBeTruthy();
    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[1]?.[0]).toMatchObject({ final: true, records: RECORDS });
    expect(batchPreflightMock.mock.calls[0]?.[0]).not.toHaveProperty('final');
  }, 30_000);

  test('Final is for an owner or admin: disabled with the reason, and the batch stays a Proof', async () => {
    const reason = 'Only a brand owner or admin can render a Final.';
    const { onFired } = renderTray(BINDING, { finalBlocked: reason });
    await press('Next: delivery');
    const final = screen.getByRole('radio', { name: 'Final' });
    expect(final.hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByText(reason)).toBeTruthy();
    fireEvent.click(final);
    expect(final.getAttribute('aria-checked')).toBe('false');
    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[1]?.[0]).not.toHaveProperty('final');
  }, 30_000);

  test('each row says what its files come out as: its own settings, else the template’s', async () => {
    const contract = {
      ...CONTRACT,
      outputs: [
        { id: 'square', label: 'Square', ratio: '1:1', mediaType: 'PNG Sequence', encode: null },
        { id: 'story', label: 'Story', ratio: '9:16', mediaType: 'MP4 Video (RGB)' },
      ],
    } as unknown as ApiRenderTemplateContract;
    const records: ApiRenderBatchRecord[] = [
      RECORDS[0]!,
      { ...RECORDS[1]!, encode: { outputs: { story: { fps: 25, files: { mxf: true } } } } },
    ];
    renderTray(BINDING, { contract, records });
    await press('Next: delivery');
    const [root, spain] = within(screen.getByRole('list', { name: 'Output per row' })).getAllByRole(
      'listitem',
    );
    expect(within(root!).getByText('Still image')).toBeTruthy();
    expect(within(root!).getByText('Template default')).toBeTruthy();
    expect(within(spain!).getByText('25 fps · MP4 + MXF')).toBeTruthy();
    expect(within(spain!).queryAllByText('Template default')).toHaveLength(0);
  }, 30_000);

  test('Slack ready: add a client channel, and the fired batch posts there', async () => {
    const { onFired } = renderTray();
    await press('Next: delivery');
    await changeDelivery();
    await screen.findByLabelText('Slack channel');
    openSelect('Slack channel');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Don’t post to Slack',
      '#renders · Ops · Continuum',
    ]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /Add a channel/ }));
    await screen.findByLabelText('Channel to add');
    openSelect('Channel to add');
    chooseOption('#client-review');
    openSelect('Channel role');
    chooseOption(/^Client —/);
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));

    await waitFor(() =>
      expect(createDestinationMock).toHaveBeenCalledWith({
        brandId: BRAND,
        role: 'client',
        channelId: 'C2',
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Slack channel').textContent).toContain('client-review'),
    );
    expect(
      screen.getByText('A client channel gets a post only after the render passes its check.'),
    ).toBeTruthy();

    expect(screen.getByText('Proof · 3 files · Library · #client-review')).toBeTruthy();
    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[1]?.[0]).toMatchObject({
      slack: { destinationId: CLIENT.id },
      records: RECORDS,
    });
  }, 30_000);

  test('Slack not connected links to Settings; not installed explains the reinstall', async () => {
    listDestinationsMock.mockImplementation(async () =>
      destinations({ state: 'not_connected', destinations: [] }),
    );
    renderTray();
    await press('Next: delivery');
    await changeDelivery();
    const link = await screen.findByRole('link', {
      name: 'Connect Slack to this brand in Settings',
    });
    expect(link.getAttribute('href')).toBe('/settings?section=integrations');
    expect(screen.queryByLabelText('Slack channel')).toBeNull();
    cleanup();

    listDestinationsMock.mockImplementation(async () =>
      destinations({ state: 'not_installed', destinations: [] }),
    );
    renderTray();
    await press('Next: delivery');
    await changeDelivery();
    expect(
      await screen.findByRole('link', { name: 'Reinstall Slack for this brand in Settings' }),
    ).toBeTruthy();
  }, 30_000);

  test('without a Slack connection the brand’s channels still post; only adding one needs it', async () => {
    // Posting uses the destination's own installation, never the person's.
    listDestinationsMock.mockImplementation(async () =>
      destinations({ state: 'not_connected', workspaceName: null, destinations: [OPS] }),
    );
    const { onFired } = renderTray();
    await press('Next: delivery');
    await changeDelivery();
    await screen.findByLabelText('Slack channel');
    expect(
      screen.getByRole('link', { name: 'Connect Slack to this brand in Settings' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add a channel/ })).toBeNull();
    openSelect('Slack channel');
    chooseOption(/#renders/);

    expect(screen.getByText('Proof · 3 files · Library · #renders')).toBeTruthy();
    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[1]?.[0]).toMatchObject({
      slack: { destinationId: OPS.id },
    });
  }, 30_000);

  test('Slack failures while adding a channel read as the picker’s own words, never a code', async () => {
    listSlackChannelsMock.mockImplementationOnce(async () => {
      throw new ApiError('slack_not_installed', 409, undefined, { error: 'slack_not_installed' });
    });
    renderTray();
    await press('Next: delivery');
    await changeDelivery();
    fireEvent.click(await screen.findByRole('button', { name: /Add a channel/ }));
    expect(
      await screen.findByText(
        /The Continuum app is no longer installed in this brand’s Slack workspace/,
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('slack_not_installed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    createDestinationMock.mockImplementationOnce(async () => {
      throw new ApiError('slack_channel_not_found', 404, undefined, {
        error: 'slack_channel_not_found',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /Add a channel/ }));
    await screen.findByLabelText('Channel to add');
    openSelect('Channel to add');
    chooseOption('#client-review');
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));
    expect(await screen.findByText('That channel is gone — pick another.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('slack_channel_not_found');
  }, 30_000);

  test('a 503 that is not chat_destinations_unavailable is a failure, not "not available yet"', async () => {
    listDestinationsMock.mockImplementation(async () => {
      throw new ApiError('render_api_not_configured', 503, undefined, {
        error: 'render_api_not_configured',
      });
    });
    renderTray();
    await press('Next: delivery');
    await changeDelivery();
    expect(await screen.findByText(/Couldn’t load Slack channels/)).toBeTruthy();
    expect(screen.queryByText(/Slack delivery isn’t available yet/)).toBeNull();
    // The code is for machines: the person reads the discovery copy, never the raw token.
    expect(document.body.textContent).not.toContain('render_api_not_configured');
  }, 30_000);

  test('a 503 from destinations is a calm "not available yet", and the batch still renders', async () => {
    listDestinationsMock.mockImplementation(async () => {
      throw new ApiError('chat_destinations_unavailable', 503);
    });
    const { onFired } = renderTray();
    await press('Next: delivery');
    await changeDelivery();
    expect(
      await screen.findByText(
        'Slack delivery isn’t available yet. Renders still go to the Library.',
      ),
    ).toBeTruthy();
    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
  }, 30_000);

  test('Meta replace: one format, an approval room, per-record delivery and Slack in the fired batch', async () => {
    listDestinationsMock.mockImplementation(async () =>
      destinations({}, { connected: true, adAccountId: 'act_1', adAccountName: 'StarCraft Ads' }),
    );
    const { onFired } = renderTray();
    await press('Next: delivery');
    await changeDelivery();
    await screen.findByLabelText('Slack channel');
    openSelect('Slack channel');
    chooseOption(/#renders/);

    fireEvent.click(await screen.findByRole('button', { name: 'Replace an ad for Root' }));
    fireEvent.click(await screen.findByRole('button', { name: /Summer launch/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Spain 18–34/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Hero story/ }));

    // Root renders two formats; a replace swaps one creative, so Next waits for the choice.
    await screen.findByLabelText('Format for Root');
    expect(screen.getByText('Choose one format for each ad replacement.')).toBeTruthy();
    // A Meta target is worth one more look: Confirm comes back, and Next goes there.
    expect(primaryDisabled('Next: confirm')).toBe(true);
    openSelect('Format for Root');
    chooseOption('Story');
    expect(screen.getByText('StarCraft Promo · 2 files')).toBeTruthy();

    // No room is a choice, not a blocker: the ad would be approved in Forge instead.
    expect(primaryDisabled('Next: confirm')).toBe(false);
    await screen.findByRole('checkbox', { name: /#client-review/ });
    expect(screen.getByText('no approvers yet')).toBeTruthy();
    // The row's label is the click a person makes; the control inside it is Base UI's button.
    fireEvent.click(screen.getByText('#client-review'));

    await press('Next: confirm');
    expect(
      screen.getByText(
        '2 files · Library · #renders · #client-review approval · no approvers yet · 1 ad replacement held for approval',
      ),
    ).toBeTruthy();
    expect(screen.getByText('replaces Hero story · 9:16')).toBeTruthy();
    expect(screen.getByText(/Nothing changes in Ads Manager until someone approves/)).toBeTruthy();

    const warning = 'No active approver yet in client-review.';
    batchPreflightMock.mockImplementationOnce(async () => ({
      confirmationToken: 'batch-token',
      readiness: READY,
      approval: {
        packageId: '99999999-9999-4999-8999-999999999991',
        destinations: [{ id: ROOM.id, platform: 'slack', name: ROOM.name, activeApprovers: 0 }],
        warning,
      },
    }));
    await press('Render 2 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(JOB_IDS));
    expect(await screen.findByText(warning)).toBeTruthy();
    expect(batchPreflightMock.mock.calls[1]?.[0]).toEqual({
      brandId: BRAND,
      bindingId: BINDING,
      templateKey: '133',
      contractHash: 'hash',
      records: [
        {
          ...RECORDS[0],
          outputIds: ['story'],
          delivery: {
            action: 'replace',
            adAccountId: 'act_1',
            campaignId: 'c1',
            campaignName: 'Summer launch',
            adsetId: 's1',
            adsetName: 'Spain 18–34',
            adId: '1201',
            adName: 'Hero story',
            adStatus: 'PAUSED',
            expectedCreativeId: 'cr_1',
          },
        },
        RECORDS[1],
      ],
      slack: { destinationId: OPS.id },
      approvalDestinationIds: [ROOM.id],
    });
  }, 30_000);

  test('no authored outputs: a replace picks one parse comp, which is the record’s one outputId', async () => {
    listDestinationsMock.mockImplementation(async () =>
      destinations({}, { connected: true, adAccountId: 'act_1', adAccountName: 'StarCraft Ads' }),
    );
    // Template 133: `outputs: []`, every ratio rendered together.
    const contract = {
      ...CONTRACT,
      template: { ...CONTRACT.template, outputKinds: ['image'], ratios: ['16:9', '1:1', '9:16'] },
      outputs: [],
    } as unknown as ApiRenderTemplateContract;
    const comp = (name: string, width: number, height: number) => ({ name, width, height });
    const parse = {
      comps: [comp('Promo 16:9', 1920, 1080), comp('Promo 1:1', 1080, 1080)],
      ratios: [
        { ratio: '16:9', width: 1920, height: 1080, comps: ['Promo 16:9'] },
        { ratio: '1:1', width: 1080, height: 1080, comps: ['Promo 1:1'] },
        { ratio: '9:16', width: 1080, height: 1920, comps: ['Promo 9:16'] },
      ],
    };
    const record: ApiRenderBatchRecord = {
      label: 'Root',
      renderSetId: SET,
      renderSetRowId: 'root',
      variables: { headline: 'Hola' },
    };
    const { onFired } = renderTray(BINDING, {
      contract,
      rows: [{ rowId: 'root', label: 'Root', labelPath: ['Root'], outputIds: [] }],
      records: [record],
      sources: [
        // Another template's parse must not answer for this one.
        { templateKey: '900', parse: { comps: [], ratios: [{ ratio: '4:5', comps: ['Other'] }] } },
        { templateKey: '133', parse },
      ],
    });
    expect(await screen.findByText('StarCraft Promo · 3 files')).toBeTruthy();
    await press('Next: delivery');
    await changeDelivery();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace an ad for Root' }));
    fireEvent.click(await screen.findByRole('button', { name: /Summer launch/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Spain 18–34/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Hero story/ }));

    await screen.findByLabelText('Format for Root');
    expect(screen.getByText('Choose one format for each ad replacement.')).toBeTruthy();
    openSelect('Format for Root');
    // One choice per delivery comp, by name; 9:16's comp takes its ratio's size.
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '16:9 · Promo 16:9',
      '1:1 · Promo 1:1',
      '9:16 · Promo 9:16',
    ]);
    chooseOption('1:1 · Promo 1:1');
    expect(screen.getByText('StarCraft Promo · 1 file')).toBeTruthy();
    expect(screen.queryByText('Choose one format for each ad replacement.')).toBeNull();

    await press('Next: confirm');
    expect(screen.getByText('replaces Hero story · 1:1')).toBeTruthy();
    const output = within(screen.getByRole('list', { name: 'Output per row' }));
    expect(
      [...output.getByRole('listitem').querySelectorAll<HTMLElement>('[data-ratio]')].map(
        (chip) => chip.dataset.ratio,
      ),
    ).toEqual(['1:1']);

    await press('Render 1 file');
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(JOB_IDS));
    const fired = batchPreflightMock.mock.calls[1]?.[0] as { records: ApiRenderBatchRecord[] };
    expect(fired.records).toEqual([
      {
        ...record,
        outputIds: ['Promo 1:1'],
        delivery: {
          ...HERO_STORY,
          adStatus: 'PAUSED',
          expectedCreativeId: 'cr_1',
        },
      },
    ]);
  }, 30_000);

  test('a new paused ad renders every format, one ad per file, and asks for none', async () => {
    listDestinationsMock.mockImplementation(async () =>
      destinations({}, { connected: true, adAccountId: 'act_1', adAccountName: 'StarCraft Ads' }),
    );
    const { onFired } = renderTray();
    await press('Next: delivery');
    await changeDelivery();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace an ad for Root' }));
    fireEvent.click(await screen.findByRole('button', { name: /Summer launch/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Spain 18–34/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'New paused ad in this ad set' }));

    expect(await screen.findByText('New paused ad in Summer launch › Spain 18–34')).toBeTruthy();
    expect(screen.queryByLabelText('Format for Root')).toBeNull();
    await press('Next: confirm');
    expect(
      screen.getByText('3 files · Library · Approval in Forge · 1 new paused ad held for approval'),
    ).toBeTruthy();
    expect(screen.getByText('new paused ad in Spain 18–34')).toBeTruthy();

    await press('Render 3 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(JOB_IDS));
    const fired = batchPreflightMock.mock.calls[1]?.[0] as { records: ApiRenderBatchRecord[] };
    expect(fired.records).toEqual([
      {
        ...RECORDS[0],
        delivery: {
          action: 'create',
          adAccountId: 'act_1',
          campaignId: 'c1',
          campaignName: 'Summer launch',
          adsetId: 's1',
          adsetName: 'Spain 18–34',
          adStatus: 'PAUSED',
        },
      },
      RECORDS[1],
    ]);
  }, 30_000);

  test('Meta replace with no approval room is approved in Forge and fires without rooms', async () => {
    listDestinationsMock.mockImplementation(async () =>
      destinations({}, { connected: true, adAccountId: 'act_1', adAccountName: 'StarCraft Ads' }),
    );
    const { onFired } = renderTray();
    await press('Next: delivery');
    await changeDelivery();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace an ad for Root' }));
    fireEvent.click(await screen.findByRole('button', { name: /Summer launch/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Spain 18–34/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Hero story/ }));
    await screen.findByLabelText('Format for Root');
    openSelect('Format for Root');
    chooseOption('Story');
    await screen.findByRole('checkbox', { name: /#client-review/ });

    await press('Next: confirm');
    expect(
      screen.getByText(
        '2 files · Library · Approval in Forge · 1 ad replacement held for approval',
      ),
    ).toBeTruthy();
    expect(screen.getByText(FORGE_APPROVAL_COPY)).toBeTruthy();

    await press('Render 2 files');
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(JOB_IDS));
    const fired = batchPreflightMock.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(fired.records).toHaveLength(2);
    expect('approvalDestinationIds' in fired).toBe(false);
  }, 30_000);

  test('a refused render stays where it was, says why, and fires nothing', async () => {
    const { onFired } = renderTray();
    await press('Next: delivery');
    // The routes answer `{ error: code, detail }`; toApiError puts the code in the message.
    batchPreflightMock.mockImplementationOnce(async () => {
      throw new ApiError('render_delivery_ad_changed', 409, undefined, {
        error: 'render_delivery_ad_changed',
        detail: 'render_delivery_ad_changed',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Render 3 files' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'That ad’s creative changed after it was picked. Pick the ad again.',
    );
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(onFired).not.toHaveBeenCalled();
    expect(primaryDisabled('Render 3 files')).toBe(false);
  }, 30_000);

  test('Running follows the fired jobs in the tray and hands the ledger their ids', async () => {
    const { onOpenLedger, onShowRow, snapshot } = renderTray();
    await press('Next: delivery');
    await press('Render 3 files');
    const fired = await screen.findByRole('list', { name: 'Fired renders' });
    expect(screen.getByText('2 renders queued')).toBeTruthy();
    const lines = within(fired).getAllByRole('listitem');
    expect(lines.map((line) => within(line).getAllByRole('button')[0]!.textContent)).toEqual([
      'Root',
      'Root / Spain',
    ]);
    // Queued: one of the seven steps is done, the rest still ahead.
    expect(within(lines[0]!).getByRole('img', { name: '1 of 7 steps done' })).toBeTruthy();
    fireEvent.click(within(lines[1]!).getByRole('button', { name: 'Root / Spain' }));
    expect(onShowRow).toHaveBeenCalledWith('spain');

    fireEvent.click(screen.getByRole('button', { name: 'Open Render ledger' }));
    expect(onOpenLedger).toHaveBeenCalledWith(JOB_IDS);

    // Rendering the next selection starts a new review in the same tray.
    snapshot({ reviewKey: 2, stale: false });
    expect(await screen.findByText('Render 2 rows')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Fired renders' })).toBeNull();
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(3));
  }, 30_000);
});
