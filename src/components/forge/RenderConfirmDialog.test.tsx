/**
 * RenderConfirmDialog against a mocked render API.
 *
 * What this guards: ONE batch preflight signs exactly what Render spends — each row's own
 * delivery (a replace narrowed to its one format), the set's default ad set as the batch-level
 * `delivery` (never merged into a row), its Slack room, approval rooms and Final, and only the
 * "Render anyway" ticks a person made. A refusal that a tick can override is asked, never
 * assumed; one that cannot is said, and nothing renders. A brand with no ad account renders to
 * the Library whatever the set says. A token about to lapse is re-signed before it is spent.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type {
  ApiRenderBatchRecord,
  ApiRenderJob,
  ApiRenderTemplateContract,
  ForgeRenderSetSettings,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/errors';

const signed = (token = 'batch-token', expiresAt = '2999-01-01T00:00:00.000Z') => ({
  confirmationToken: token,
  expiresAt,
  readiness: {
    state: 'READY',
    totalRows: 2,
    readyRows: 2,
    blockedRows: 0,
    unknownRows: 0,
    findings: [],
  },
});
const batchPreflightMock = mock(
  async (_input: Record<string, unknown>): Promise<unknown> => signed(),
);
const JOBS = [
  { id: '11111111-1111-4111-8111-111111111111', status: 'queued', taskUid: 't1' },
  { id: '11111111-1111-4111-8111-111111111112', status: 'queued', taskUid: 't2' },
] as unknown as ApiRenderJob[];
const createBatchMock = mock(async (_input: unknown) => ({ batchId: 'b', jobs: JOBS }));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { batchPreflight: batchPreflightMock, createBatch: createBatchMock },
}));
const ROOM = {
  id: '77777777-7777-4777-8777-777777777771',
  platform: 'slack' as const,
  role: 'client',
  name: 'client-review',
  activeApprovers: 1,
  requestedApprovers: 0,
};
mock.module('@/lib/library/renderApprovals', () => ({
  fetchApprovalDestinations: async () => ({ destinations: [ROOM] }),
}));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
import type { MetaPickerState, RenderPreflightRow } from './DeliveryTargetPicker';
import { type FiredRow, RenderConfirmDialog } from './RenderConfirmDialog';

installPickerDomGlobals();

const BRAND = '22222222-2222-4222-8222-222222222222';
const SET = '33333333-3333-4333-8333-333333333333';
const OPS = { id: '66666666-6666-4666-8666-666666666661', channelName: 'renders' };

const CONTRACT = {
  template: {
    key: '133',
    name: 'forge_bench_starcraft',
    displayName: 'StarCraft Promo',
    contractHash: 'hash',
    outputKinds: ['image'],
  },
  variables: [{ key: 'headline', label: 'Headline' }],
  outputs: [
    { id: 'square', label: 'Square', ratio: '1:1', mediaType: 'image/png', encode: null },
    { id: 'story', label: 'Story', ratio: '9:16', mediaType: 'image/png', encode: null },
  ],
} as unknown as ApiRenderTemplateContract;

const AD_SET = {
  action: 'create' as const,
  adAccountId: 'act_1',
  campaignId: 'c1',
  campaignName: 'Summer launch',
  adsetId: 's1',
  adsetName: 'Spain 18–34',
  adStatus: 'PAUSED' as const,
};
const REPLACE = {
  action: 'replace' as const,
  adAccountId: 'act_1',
  campaignId: 'c1',
  campaignName: 'Summer launch',
  adsetId: 's1',
  adsetName: 'Spain 18–34',
  adId: '1201',
  adName: 'Hero story',
  expectedCreativeId: 'cr_1',
};
const CONNECTED: MetaPickerState = {
  connected: true,
  adAccountId: 'act_1',
  adAccountName: 'StarCraft Ads',
  adAccounts: [{ id: 'act_1', name: 'StarCraft Ads' }],
};
const SETTINGS: ForgeRenderSetSettings = {
  metaTarget: AD_SET,
  slackDestinationId: OPS.id,
  approvalDestinationIds: [ROOM.id],
  final: true,
};

const ROWS: RenderPreflightRow[] = [
  {
    rowId: 'root',
    label: 'Root',
    labelPath: ['Root'],
    outputIds: ['square'],
    delivery: REPLACE,
  },
  { rowId: 'spain', label: 'Spain', labelPath: ['Root', 'Spain'], outputIds: ['story'] },
];
const RECORDS: ApiRenderBatchRecord[] = ROWS.map((row) => ({
  label: row.label,
  renderSetId: SET,
  renderSetRowId: row.rowId,
  variables: { headline: 'Hola' },
  outputIds: row.outputIds,
}));

function setup(
  over: Partial<{
    rows: RenderPreflightRow[];
    settings: ForgeRenderSetSettings;
    meta: MetaPickerState;
    finalBlocked: string | null;
  }> = {},
) {
  const onFired = mock((_fired: FiredRow[]) => undefined);
  const onOpenChange = mock((_open: boolean) => undefined);
  const rows = over.rows ?? ROWS;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RenderConfirmDialog
        open
        onOpenChange={onOpenChange}
        brandId={BRAND}
        bindingId={null}
        contract={CONTRACT}
        rows={rows}
        records={RECORDS.slice(0, rows.length)}
        settings={over.settings ?? SETTINGS}
        calls={[]}
        meta={over.meta ?? CONNECTED}
        slack={{ state: 'ready', workspaceName: 'Continuum', destinations: [OPS as never] }}
        outputs={CONTRACT.outputs}
        finalBlocked={over.finalBlocked ?? null}
        onDeliveryChange={() => undefined}
        onChangeSettings={() => undefined}
        onFired={onFired}
      />
    </QueryClientProvider>,
  );
  return { onFired, onOpenChange, dialog: screen.getByRole('dialog') };
}

const renderButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /^Render \d+ files?$/ });

beforeEach(() => {
  batchPreflightMock.mockReset();
  batchPreflightMock.mockImplementation(async () => signed());
  createBatchMock.mockClear();
});
afterEach(() => cleanup());

describe('RenderConfirmDialog', () => {
  test('one preflight signs the set’s delivery, and a row’s own target wins over its default', async () => {
    const { dialog, onFired, onOpenChange } = setup();
    await waitFor(() => expect(renderButton().disabled).toBe(false));
    expect(batchPreflightMock).toHaveBeenCalledTimes(1);
    const sent = batchPreflightMock.mock.calls[0]![0] as {
      records: Array<{ delivery?: unknown; outputIds?: string[] }>;
    } & Record<string, unknown>;
    expect(sent).toMatchObject({
      delivery: AD_SET,
      slack: { destinationId: OPS.id },
      approvalDestinationIds: [ROOM.id],
      final: true,
    });
    // The replacing row carries its own ad and its one file; the other takes the set's default.
    expect(sent.records[0]).toMatchObject({ delivery: REPLACE, outputIds: ['square'] });
    expect(sent.records[1]?.delivery).toBeUndefined();
    expect(sent.acceptMissingFonts).toBeUndefined();

    const ads = within(dialog).getByRole('list', { name: 'Meta ads' });
    expect(ads.textContent).toContain('replaces Hero story');
    expect(ads.textContent).toContain('new paused ad in Summer launch › Spain 18–34 (set default)');
    expect(within(dialog).getByText(/#renders/)).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByText(/client-review approval/)).toBeTruthy());

    fireEvent.click(renderButton());
    await waitFor(() => expect(createBatchMock).toHaveBeenCalledTimes(1));
    expect(createBatchMock.mock.calls[0]?.[0]).toEqual({ confirmationToken: 'batch-token' });
    // Signed once, spent once.
    expect(batchPreflightMock).toHaveBeenCalledTimes(1);
    expect(onFired.mock.calls[0]?.[0].map((item) => [item.rowId, item.job.id])).toEqual([
      ['root', JOBS[0]!.id],
      ['spain', JOBS[1]!.id],
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('a replace with more than one format left blocks Render until the row is narrowed', async () => {
    setup({ rows: [{ ...ROWS[0]!, outputIds: ['square', 'story'] }] });
    expect(await screen.findByText('Choose one format for each ad replacement.')).toBeTruthy();
    expect(renderButton().disabled).toBe(true);
  });

  test('an overridable refusal is a tick; only the tick re-signs with the flag', async () => {
    batchPreflightMock.mockImplementation(async (request) => {
      if (!request.acceptLinkedLineMismatch)
        throw new ApiError('Headline needs 2 lines.', 400, 'render_linked_line_count', {
          detail: 'Headline needs 2 lines.',
        });
      return signed();
    });
    const { dialog } = setup();
    const tick = await within(dialog).findByRole('checkbox', {
      name: /Render anyway — a split headline has the wrong number of lines/,
    });
    expect(renderButton().disabled).toBe(true);
    expect(createBatchMock).not.toHaveBeenCalled();
    fireEvent.click(tick);
    await waitFor(() =>
      expect(batchPreflightMock.mock.calls.at(-1)?.[0]).toMatchObject({
        acceptLinkedLineMismatch: true,
      }),
    );
    await waitFor(() => expect(renderButton().disabled).toBe(false));
  });

  test('a refusal no tick can override says why, and renders nothing', async () => {
    batchPreflightMock.mockImplementation(async () => {
      throw new ApiError('render_set_revision_conflict', 409, 'render_set_revision_conflict', {
        detail: 'This set changed elsewhere.',
      });
    });
    const { dialog } = setup();
    expect(await within(dialog).findByText(/Fix the row in the grid/)).toBeTruthy();
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0);
    expect(renderButton().disabled).toBe(true);
  });

  test('a brand with no ad account renders to the Library, whatever the set says', async () => {
    const { dialog } = setup({
      rows: [ROWS[1]!],
      meta: { connected: false, adAccountId: null, adAccountName: null, adAccounts: [] },
    });
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[0]![0].delivery).toBeUndefined();
    expect(within(dialog).queryAllByRole('list', { name: 'Meta ads' })).toHaveLength(0);
  });

  test('someone who cannot render a Final gets a Proof, even when the set says Final', async () => {
    const { dialog } = setup({ finalBlocked: 'Only a brand owner or admin can render a Final.' });
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[0]![0].final).toBeUndefined();
    expect(within(dialog).getByRole('radio', { name: 'Final' }).hasAttribute('data-disabled')).toBe(
      true,
    );
  });

  test('a token about to lapse is re-signed before it is spent', async () => {
    batchPreflightMock.mockImplementationOnce(async () =>
      signed('stale-token', new Date(Date.now() + 1_000).toISOString()),
    );
    batchPreflightMock.mockImplementation(async () => signed('fresh-token'));
    setup();
    await waitFor(() => expect(renderButton().disabled).toBe(false));
    fireEvent.click(renderButton());
    await waitFor(() => expect(createBatchMock).toHaveBeenCalledTimes(1));
    expect(createBatchMock.mock.calls[0]?.[0]).toEqual({ confirmationToken: 'fresh-token' });
  });
});
