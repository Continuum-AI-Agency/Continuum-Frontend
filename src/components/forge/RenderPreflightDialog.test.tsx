/**
 * RenderPreflightDialog against a mocked render API and a stubbed paid-targets route.
 *
 * Review lists exactly the rows × formats it was handed and the batch readiness per row; Deliver
 * offers the Library (always), the brand's Slack destinations (with add-a-channel, and the
 * not-connected / not-installed / unavailable states) and Meta; Confirm fires ONE batch preflight
 * carrying `slack` and each row's delivery — a replacing row narrowed to its one format — then the
 * confirmed token. A refusal keeps the dialog open with the reason and nothing fired.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  ApiRenderBatchReadiness,
  ApiRenderBatchRecord,
  ApiRenderDeliveryDestinationsResponse,
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
const createBatchMock = mock(async (_input: unknown) => ({
  batchId: '99999999-9999-4999-8999-999999999999',
  jobs: [{ id: 'job-1' }, { id: 'job-2' }],
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
const toastSuccess = mock((_message: string) => undefined);
const toastError = mock((_message: string) => undefined);

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
  },
}));
mock.module('@/StudioCanvas/nodes/publish/publishingApi', () => ({
  publishingApi: { searchPaid: searchPaidMock },
}));
mock.module('@/components/ui/toast-imperative', () => ({
  toast: { success: toastSuccess, error: toastError },
}));
mock.module('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { useState } from 'react';
import { RenderPreflightDialog, type RenderPreflightRow } from './RenderPreflightDialog';

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

/** Holds rows the way RenderRequestsGrid does, so a delivery picked in the dialog comes back in. */
function Harness({
  bindingId,
  initialRows = ROWS,
  records = RECORDS,
  onFired,
  onClose,
}: {
  bindingId: string | null;
  initialRows?: RenderPreflightRow[];
  records?: ApiRenderBatchRecord[];
  onFired: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState(initialRows);
  return (
    <RenderPreflightDialog
      open
      brandId={BRAND}
      bindingId={bindingId}
      templateKey="133"
      contractHash="hash"
      contract={CONTRACT}
      rows={rows}
      records={records}
      onDeliveryChange={(rowId, delivery) =>
        setRows((current) =>
          current.map((row) =>
            row.rowId === rowId ? { ...row, delivery: delivery ?? undefined } : row,
          ),
        )
      }
      onClose={onClose}
      onFired={onFired}
    />
  );
}

function renderDialog(
  bindingId: string | null = BINDING,
  data: { rows?: RenderPreflightRow[]; records?: ApiRenderBatchRecord[] } = {},
) {
  const onFired = mock((_ids: string[]) => undefined);
  const onClose = mock(() => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness
        bindingId={bindingId}
        initialRows={data.rows}
        records={data.records}
        onFired={onFired}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onFired, onClose };
}

/** The Review line for one row: its name, formats and render count, as read. */
const reviewLine = (name: string) =>
  screen.getByText(name).closest('div')?.textContent?.replace(name, '').trim();

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
  cleanup();
  for (const fn of [
    batchPreflightMock,
    createBatchMock,
    listDestinationsMock,
    listSlackChannelsMock,
    createDestinationMock,
    searchPaidMock,
    toastSuccess,
    toastError,
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

describe('RenderPreflightDialog · Review', () => {
  test('reviews exactly the rows × formats it was handed, with readiness per row', async () => {
    renderDialog();
    expect(await screen.findByText('Render 2 rows')).toBeTruthy();
    expect(screen.getByText('StarCraft Promo · 3 renders')).toBeTruthy();
    expect(screen.getByText('Square, Story')).toBeTruthy();
    expect(screen.getByText('Root / Spain')).toBeTruthy();
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
    const { onFired } = renderDialog(null, {
      rows: [ROWS[0]!, { ...ROWS[1]!, outputIds: [] }],
      records,
    });
    expect(await screen.findByText('StarCraft Promo · 4 renders')).toBeTruthy();
    expect(reviewLine('Root / Spain')).toBe('All formats2 renders');
    expect(reviewLine('Root')).toBe('Square, Story2 renders');

    await next();
    await next();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 4 renders' }));
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    const fired = batchPreflightMock.mock.calls[1]?.[0] as { records: ApiRenderBatchRecord[] };
    expect(fired.records[1]).toEqual(records[1]!);
    expect('outputIds' in fired.records[1]!).toBe(false);
  }, 30_000);

  test('a replacing row counts one render on its own line, the same as the header', async () => {
    // A spreadsheet import can hand a row its ad before the dialog opens.
    renderDialog(BINDING, { rows: [{ ...ROWS[0]!, delivery: HERO_STORY }, ROWS[1]!] });
    expect(await screen.findByText('StarCraft Promo · 2 renders')).toBeTruthy();
    expect(reviewLine('Root')).toBe('One format1 render');
    expect(reviewLine('Root / Spain')).toBe('Story1 render');
  }, 30_000);

  test('a guardrail refusal says why and does not let the batch move on', async () => {
    batchPreflightMock.mockImplementationOnce(async () => {
      throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
        guardrails: [
          { code: 'BRAND_COLOR_OUTSIDE_PALETTE', message: 'Use a permitted brand color.' },
        ],
      });
    });
    renderDialog();
    expect(await screen.findByText('Use a permitted brand color.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
  }, 30_000);

  test('Cancel closes without firing anything', async () => {
    const { onClose } = renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createBatchMock).not.toHaveBeenCalled();
  }, 30_000);
});

describe('RenderPreflightDialog · Deliver + Confirm', () => {
  test('Library only: fires the confirmed token and omits bindingId on the default environment', async () => {
    const { onFired } = renderDialog(null);
    await next();
    expect(screen.getByText(/Every render is saved to this brand’s Library/)).toBeTruthy();
    await next();
    expect(screen.getByText('3 renders · Library')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 renders' }));
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(['job-1', 'job-2']));

    const fired = batchPreflightMock.mock.calls[1]?.[0];
    expect(fired).toEqual({
      brandId: BRAND,
      templateKey: '133',
      contractHash: 'hash',
      records: RECORDS,
    });
    expect(createBatchMock.mock.calls[0]?.[0]).toEqual({ confirmationToken: 'batch-token' });
    expect(toastSuccess).toHaveBeenCalledWith('2 renders queued');
  }, 30_000);

  test('Slack ready: add a client channel, and the fired batch posts there', async () => {
    const { onFired } = renderDialog();
    await next();
    const channel = await screen.findByLabelText<HTMLSelectElement>('Slack channel');
    expect([...channel.options].map((option) => option.text)).toEqual([
      'Don’t post to Slack',
      '#renders · Ops',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Add a channel/ }));
    fireEvent.change(await screen.findByLabelText('Channel to add'), { target: { value: 'C2' } });
    const role = screen.getByLabelText<HTMLSelectElement>('Channel role');
    expect(role.value).toBe('ops');
    expect(screen.getByText('Client — posts only after the render passes its check')).toBeTruthy();
    fireEvent.change(role, { target: { value: 'client' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));

    await waitFor(() =>
      expect(createDestinationMock).toHaveBeenCalledWith({
        brandId: BRAND,
        role: 'client',
        channelId: 'C2',
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLSelectElement>('Slack channel').value).toBe(CLIENT.id),
    );
    expect(
      screen.getByText('A client channel gets a post only after the render passes its check.'),
    ).toBeTruthy();

    await next();
    expect(screen.getByText('3 renders · Library · #client-review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 renders' }));
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
    renderDialog();
    await next();
    const link = await screen.findByRole('link', { name: 'Connect Slack in Settings' });
    expect(link.getAttribute('href')).toBe('/settings?section=connections');
    expect(screen.queryByLabelText('Slack channel')).toBeNull();
    cleanup();

    listDestinationsMock.mockImplementation(async () =>
      destinations({ state: 'not_installed', destinations: [] }),
    );
    renderDialog();
    await next();
    expect(await screen.findByRole('link', { name: 'Reinstall Slack in Settings' })).toBeTruthy();
  }, 30_000);

  test('without a Slack connection the brand’s channels still post; only adding one needs it', async () => {
    // Posting uses the destination's own installation, never the person's.
    listDestinationsMock.mockImplementation(async () =>
      destinations({ state: 'not_connected', workspaceName: null, destinations: [OPS] }),
    );
    const { onFired } = renderDialog();
    await next();
    const channel = await screen.findByLabelText<HTMLSelectElement>('Slack channel');
    expect(screen.getByRole('link', { name: 'Connect Slack in Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add a channel/ })).toBeNull();
    fireEvent.change(channel, { target: { value: OPS.id } });

    await next();
    expect(screen.getByText('3 renders · Library · #renders')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 renders' }));
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[1]?.[0]).toMatchObject({
      slack: { destinationId: OPS.id },
    });
  }, 30_000);

  test('Slack failures while adding a channel read as the picker’s own words, never a code', async () => {
    listSlackChannelsMock.mockImplementationOnce(async () => {
      throw new ApiError('slack_not_installed', 409, undefined, { error: 'slack_not_installed' });
    });
    renderDialog();
    await next();
    fireEvent.click(await screen.findByRole('button', { name: /Add a channel/ }));
    expect(
      await screen.findByText(/The Continuum app is no longer installed in your Slack workspace/),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('slack_not_installed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    createDestinationMock.mockImplementationOnce(async () => {
      throw new ApiError('slack_channel_not_found', 404, undefined, {
        error: 'slack_channel_not_found',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /Add a channel/ }));
    fireEvent.change(await screen.findByLabelText('Channel to add'), { target: { value: 'C2' } });
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
    renderDialog();
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
    const { onFired } = renderDialog();
    await next();
    expect(
      await screen.findByText(
        'Slack delivery isn’t available yet. Renders still go to the Library.',
      ),
    ).toBeTruthy();
    await next();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 renders' }));
    await waitFor(() => expect(onFired).toHaveBeenCalledTimes(1));
  }, 30_000);

  test('Meta replace: one format for the row, per-record delivery and Slack in the fired batch', async () => {
    listDestinationsMock.mockImplementation(async () =>
      destinations({}, { connected: true, adAccountId: 'act_1', adAccountName: 'StarCraft Ads' }),
    );
    const { onFired } = renderDialog();
    await next();
    fireEvent.change(await screen.findByLabelText('Slack channel'), { target: { value: OPS.id } });

    fireEvent.click(await screen.findByRole('button', { name: 'Replace an ad for Root' }));
    fireEvent.click(await screen.findByRole('button', { name: /Summer launch/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Spain 18–34/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Hero story/ }));

    // Root renders two formats; a replace swaps one creative, so Next waits for the choice.
    const format = await screen.findByLabelText<HTMLSelectElement>('Format for Root');
    expect(screen.getByText('Choose one format for each ad replacement.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
    fireEvent.change(format, { target: { value: 'story' } });
    expect(screen.getByText('StarCraft Promo · 2 renders')).toBeTruthy();

    await next();
    expect(
      screen.getByText('2 renders · Library · #renders · 1 ad replacement held for approval'),
    ).toBeTruthy();
    expect(screen.getByText('replaces Hero story · Story')).toBeTruthy();
    expect(screen.getByText(/Nothing changes in Ads Manager until someone approves/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 renders' }));
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(['job-1', 'job-2']));
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
    });
  }, 30_000);

  test('a refused confirm keeps the dialog open, says why, and fires nothing', async () => {
    const { onFired } = renderDialog();
    await next();
    await next();
    // The routes answer `{ error: code, detail }`; toApiError puts the code in the message.
    batchPreflightMock.mockImplementationOnce(async () => {
      throw new ApiError('render_delivery_ad_changed', 409, undefined, {
        error: 'render_delivery_ad_changed',
        detail: 'render_delivery_ad_changed',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 renders' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'That ad’s creative changed after it was picked. Pick the ad again.',
    );
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(onFired).not.toHaveBeenCalled();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm 3 renders' }).disabled,
    ).toBe(false);
  }, 30_000);
});
