/**
 * RenderReviewTray against a mocked render API and a stubbed paid-targets route.
 *
 * Review lists exactly the rows × formats it was handed and the batch readiness per row; Deliver
 * offers the Library (always), the brand's Slack destinations (with add-a-channel, and the
 * not-connected / not-installed / unavailable states) and Meta; Confirm fires ONE batch preflight
 * carrying `slack` and each row's delivery — a replacing row narrowed to its one format — then the
 * confirmed token, and Running follows the fired jobs. A Meta target needs an approval room before
 * Next, the fired batch carries the rooms, and the preflight's approver warning shows in Running.
 * A refusal keeps the tray on Confirm with
 * the reason and nothing fired. It is a docked region, never a dialog: a change to the rows after
 * review sends it back to Review, and it confirms nothing until they are re-checked.
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
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';
import type React from 'react';
import { useState } from 'react';
import { registerToastSink } from '@/components/ui/toast-imperative';
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

type Snapshot = { reviewKey: number; stale: boolean };

/** Holds rows the way RenderRequestsGrid does, so a delivery picked in the tray comes back in. */
function Harness({
  bindingId,
  initialRows = ROWS,
  records = RECORDS,
  snapshot,
  handlers,
}: {
  bindingId: string | null;
  initialRows?: RenderPreflightRow[];
  records?: ApiRenderBatchRecord[];
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
      contract={CONTRACT}
      rows={rows}
      records={records}
      reviewKey={snapshot.reviewKey}
      stale={snapshot.stale}
      recheckBlocked={null}
      rechecking={false}
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
  data: { rows?: RenderPreflightRow[]; records?: ApiRenderBatchRecord[] } = {},
) {
  const handlers = trayHandlers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (snapshot: Snapshot) => (
    <QueryClientProvider client={client}>
      <Harness
        bindingId={bindingId}
        initialRows={data.rows}
        records={data.records}
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

const next = async () => {
  const button = await screen.findByRole<HTMLButtonElement>('button', { name: 'Next' });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};

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

    await next();
    await next();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 4 files' }));
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
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
  }, 30_000);

  test('closing — the button or Esc — fires nothing', async () => {
    const { onClose } = renderTray();
    fireEvent.click(await screen.findByRole('button', { name: 'Close review' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next' }), { key: 'Escape' });
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

  test('a change after review goes back to Review, and nothing confirms until a re-check', async () => {
    const { snapshot, onRecheck, onFired } = renderTray();
    await next();
    await next();
    expect(screen.getByRole('button', { name: 'Confirm 3 files' })).toBeTruthy();

    // A row was edited in the grid while the tray sat on Confirm.
    snapshot({ reviewKey: 1, stale: true });
    const current = () =>
      within(screen.getByRole('list', { name: 'Pre-flight steps' })).getByRole('listitem', {
        current: 'step',
      }).textContent;
    await waitFor(() => expect(current()).toBe('Review'));
    expect(screen.getByText('Rows changed since review')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /Confirm/ })).toHaveLength(0);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect(batchPreflightMock).toHaveBeenCalledTimes(1);

    // The grid re-saved and handed over a fresh snapshot: it is reviewed again, then confirms.
    snapshot({ reviewKey: 2, stale: false });
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Rows changed since review')).toBeNull();
    await next();
    await next();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 files' }));
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    expect(createBatchMock).toHaveBeenCalledTimes(1);
  }, 30_000);
});

describe('RenderReviewTray · Deliver + Confirm', () => {
  test('Library only: fires the confirmed token and omits bindingId on the default environment', async () => {
    const { onFired } = renderTray(null);
    await next();
    expect(screen.getByText(/Every render is saved to this brand’s Library/)).toBeTruthy();
    await next();
    expect(screen.getByText('3 files · Library')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 files' }));
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

  test('Slack ready: add a client channel, and the fired batch posts there', async () => {
    const { onFired } = renderTray();
    await next();
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

    await next();
    expect(screen.getByText('3 files · Library · #client-review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 files' }));
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
    await next();
    const link = await screen.findByRole('link', { name: 'Connect Slack to this brand in Settings' });
    expect(link.getAttribute('href')).toBe('/settings?section=integrations');
    expect(screen.queryByLabelText('Slack channel')).toBeNull();
    cleanup();

    listDestinationsMock.mockImplementation(async () =>
      destinations({ state: 'not_installed', destinations: [] }),
    );
    renderTray();
    await next();
    expect(await screen.findByRole('link', { name: 'Reinstall Slack for this brand in Settings' })).toBeTruthy();
  }, 30_000);

  test('without a Slack connection the brand’s channels still post; only adding one needs it', async () => {
    // Posting uses the destination's own installation, never the person's.
    listDestinationsMock.mockImplementation(async () =>
      destinations({ state: 'not_connected', workspaceName: null, destinations: [OPS] }),
    );
    const { onFired } = renderTray();
    await next();
    await screen.findByLabelText('Slack channel');
    expect(screen.getByRole('link', { name: 'Connect Slack to this brand in Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add a channel/ })).toBeNull();
    openSelect('Slack channel');
    chooseOption(/#renders/);

    await next();
    expect(screen.getByText('3 files · Library · #renders')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 files' }));
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
    await next();
    fireEvent.click(await screen.findByRole('button', { name: /Add a channel/ }));
    expect(
      await screen.findByText(/The Continuum app is no longer installed in this brand’s Slack workspace/),
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
    await next();
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
    await next();
    expect(
      await screen.findByText(
        'Slack delivery isn’t available yet. Renders still go to the Library.',
      ),
    ).toBeTruthy();
    await next();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 files' }));
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
  }, 30_000);

  test('Meta replace: one format, an approval room, per-record delivery and Slack in the fired batch', async () => {
    listDestinationsMock.mockImplementation(async () =>
      destinations({}, { connected: true, adAccountId: 'act_1', adAccountName: 'StarCraft Ads' }),
    );
    const { onFired } = renderTray();
    await next();
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
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
    openSelect('Format for Root');
    chooseOption('Story');
    expect(screen.getByText('StarCraft Promo · 2 files')).toBeTruthy();

    // Preflight refuses a Meta target with nowhere to ask, so Next waits for a room too.
    expect(
      screen.getByText(
        'Choose an approval room — a Meta ad waits there until someone approves it.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
    await screen.findByRole('checkbox', { name: /#client-review/ });
    expect(screen.getByText('no approvers yet')).toBeTruthy();
    // The row's label is the click a person makes; the control inside it is Base UI's button.
    fireEvent.click(screen.getByText('#client-review'));

    await next();
    expect(
      screen.getByText('2 files · Library · #renders · 1 ad replacement held for approval'),
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 files' }));
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

  test('a refused confirm stays on Confirm, says why, and fires nothing', async () => {
    const { onFired } = renderTray();
    await next();
    await next();
    // The routes answer `{ error: code, detail }`; toApiError puts the code in the message.
    batchPreflightMock.mockImplementationOnce(async () => {
      throw new ApiError('render_delivery_ad_changed', 409, undefined, {
        error: 'render_delivery_ad_changed',
        detail: 'render_delivery_ad_changed',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 files' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'That ad’s creative changed after it was picked. Pick the ad again.',
    );
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(onFired).not.toHaveBeenCalled();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm 3 files' }).disabled,
    ).toBe(false);
  }, 30_000);

  test('Running follows the fired jobs in the tray and hands the ledger their ids', async () => {
    const { onOpenLedger, onShowRow, snapshot } = renderTray();
    await next();
    await next();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 files' }));
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
