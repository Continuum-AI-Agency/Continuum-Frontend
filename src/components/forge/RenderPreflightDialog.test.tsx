/**
 * RenderPreflightDialog against a mocked render API: it lists exactly the rows × formats it was
 * handed, Confirm sends ONE batch preflight carrying those records (with each row's delivery
 * applied) and fires the confirmed token, and a refusal keeps the dialog open with nothing fired.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  ApiRenderBatchRecord,
  ApiRenderDeliveryTarget,
  ApiRenderTemplateContract,
} from '@continuum/contracts';

const batchPreflightMock = mock(async (_input: unknown) => ({ confirmationToken: 'batch-token' }));
const createBatchMock = mock(async (_input: unknown) => ({
  batchId: '99999999-9999-4999-8999-999999999999',
  jobs: [{ id: 'job-1' }, { id: 'job-2' }],
}));
const toastSuccess = mock((_message: string) => undefined);
const toastError = mock((_message: string) => undefined);

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { batchPreflight: batchPreflightMock, createBatch: createBatchMock },
}));
mock.module('@/components/ui/toast-imperative', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  outputs: [
    { id: 'square', label: 'Square', ratio: '1:1' },
    { id: 'story', label: 'Story', ratio: '9:16' },
  ],
} as unknown as ApiRenderTemplateContract;

const REPLACE: ApiRenderDeliveryTarget = {
  action: 'replace',
  adAccountId: 'act_1',
  campaignId: 'c1',
  adsetId: 's1',
  adId: 'ad_1',
};

const ROWS: RenderPreflightRow[] = [
  { rowId: 'root', label: 'Root', labelPath: ['Root'], outputIds: ['square', 'story'] },
  {
    rowId: 'spain',
    label: 'Spain',
    labelPath: ['Root', 'Spain'],
    outputIds: ['story'],
    delivery: REPLACE,
  },
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

function renderDialog(bindingId: string | null = BINDING) {
  const onFired = mock((_ids: string[]) => undefined);
  const onClose = mock(() => undefined);
  render(
    <RenderPreflightDialog
      open
      brandId={BRAND}
      bindingId={bindingId}
      templateKey="133"
      contractHash="hash"
      contract={CONTRACT}
      rows={ROWS}
      records={RECORDS}
      onDeliveryChange={() => undefined}
      onClose={onClose}
      onFired={onFired}
    />,
  );
  return { onFired, onClose };
}

afterEach(() => {
  cleanup();
  for (const fn of [batchPreflightMock, createBatchMock, toastSuccess, toastError]) fn.mockClear();
});

describe('RenderPreflightDialog', () => {
  test('reviews exactly the rows and formats it was handed', async () => {
    renderDialog();
    expect(await screen.findByText('Render 2 rows')).toBeTruthy();
    expect(screen.getByText(/StarCraft Promo/)).toBeTruthy();
    expect(screen.getByText('Root')).toBeTruthy();
    expect(screen.getByText('Square, Story')).toBeTruthy();
    expect(screen.getByText('Root / Spain')).toBeTruthy();
    expect(screen.getByText('Story')).toBeTruthy();
    expect(batchPreflightMock).not.toHaveBeenCalled();
  }, 30_000);

  test('Confirm preflights the batch, fires the confirmed token, and reports the job ids', async () => {
    const { onFired } = renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(onFired).toHaveBeenCalledWith(['job-1', 'job-2']));

    expect(batchPreflightMock).toHaveBeenCalledTimes(1);
    expect(batchPreflightMock.mock.calls[0]?.[0]).toEqual({
      brandId: BRAND,
      bindingId: BINDING,
      templateKey: '133',
      contractHash: 'hash',
      records: [RECORDS[0], { ...RECORDS[1], delivery: REPLACE }],
    });
    expect(createBatchMock.mock.calls[0]?.[0]).toEqual({ confirmationToken: 'batch-token' });
    expect(toastSuccess).toHaveBeenCalledWith('2 renders queued');
  }, 30_000);

  test('omits bindingId on the default environment', async () => {
    renderDialog(null);
    fireEvent.click(await screen.findByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(batchPreflightMock).toHaveBeenCalledTimes(1));
    expect(batchPreflightMock.mock.calls[0]?.[0]).not.toHaveProperty('bindingId');
  }, 30_000);

  test('a refused preflight fires nothing and says why', async () => {
    batchPreflightMock.mockImplementationOnce(async () => {
      throw new Error('render_contract_hash_mismatch');
    });
    const { onFired } = renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(onFired).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Confirm/ }).disabled).toBe(false);
  }, 30_000);

  test('Cancel closes without a network call', async () => {
    const { onClose } = renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(batchPreflightMock).not.toHaveBeenCalled();
  }, 30_000);
});
