// The canvas render node under a held batch. A batch held for a template (by any Forge set, any
// tab, or this node) means the node signs nothing more for it: the banner says why, Render waits,
// and no preflight or createBatch is called.

import { afterAll, afterEach, expect, mock, spyOn, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ApiError } from '@/lib/api/errors';

const BRAND = '11111111-1111-4111-8111-111111111111';
const USER = '77777777-7777-4777-8777-777777777777';
const TEMPLATE = {
  key: '133',
  name: 'forge_bench_starcraft',
  bindingId: null,
  environment: 'Continuum_app',
  contractVersion: '1',
  contractHash: 'hash',
  outputKinds: ['image'],
  variableCount: 0,
  previewUrl: null,
  updatedAt: null,
  ratios: ['1:1'],
  sourceAssetId: null,
  fontsMissing: [],
};

const batchPreflight = mock(async () => ({ confirmationToken: 't', batchId: 'b', expiresAt: '' }));
const createBatch = mock(async () => ({ jobs: [] }));
const listJobs = mock(
  async (..._args: unknown[]): Promise<unknown> => ({
    items: [],
    nextCursor: null,
  }),
);
const preflight = mock(async () => ({
  confirmationToken: 'job-token',
  confirmationHash: 'a'.repeat(64),
  expiresAt: '2099-01-01T00:00:00.000Z',
}));
const createJob = mock(
  async (_input: { confirmationToken: string }): Promise<unknown> => ({
    id: 'job',
    status: 'queued',
  }),
);
// mock.module is process-wide and outlives this file: what is mocked here is put back after it,
// or a file run next in the same process reads this file's user and API as its own.
const realModules = {
  '@/StudioCanvas/nodes/api-render/apiRendersApi': {
    ...(await import('@/StudioCanvas/nodes/api-render/apiRendersApi')),
  },
  '@/components/providers/ActiveBrandProvider': {
    ...(await import('@/components/providers/ActiveBrandProvider')),
  },
  '@/lib/supabase/realtime': { ...(await import('@/lib/supabase/realtime')) },
};
afterAll(() => {
  for (const [path, real] of Object.entries(realModules)) mock.module(path, () => real);
});
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listTemplates: async () => ({ items: [TEMPLATE], nextCursor: null, workspace: null }),
    getContract: async () => ({
      template: TEMPLATE,
      variables: [],
      outputs: [],
      fonts: [],
      layout: null,
      divergence: [],
      layerSwitchesNotAsked: [],
      linkedFields: [],
    }),
    listInputSets: async () => ({ items: [], nextCursor: null }),
    listJobs: (...args: unknown[]) => listJobs(...args),
    getJob: async () => null,
    livePreview: async () => {
      throw new Error('no kit');
    },
    batchPreflight,
    createBatch,
    preflight,
    createJob,
  },
}));
mock.module('@/components/providers/ActiveBrandProvider', () => ({
  useActiveBrandContext: () => ({
    permissions: [{ brand_profile_id: BRAND, role: 'owner' }],
    user: { id: USER },
  }),
}));
mock.module('@/lib/supabase/realtime', () => ({ subscribeToPostgresChanges: () => () => {} }));

const { ApiRenderBlock } = await import('./ApiRenderBlock');
const { useStudioStore } = await import('../stores/useStudioStore');
const { forgetPageSession, holdKeyOf } = await import('@/components/forge/renderHold');

afterEach(() => {
  cleanup();
  for (const fn of [batchPreflight, createBatch, preflight, createJob]) fn.mockClear();
  listJobs.mockReset();
  listJobs.mockImplementation(async () => ({ items: [], nextCursor: null }));
  forgetPageSession();
  localStorage.clear();
});

const mountNode = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <ApiRenderBlock
            {...({
              id: 'render-node',
              type: 'apiRender',
              selected: false,
              data: { templateKey: '133', contractHash: 'hash', bindingId: null, variables: {} },
            } as never)}
          />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

test('a held template shows the banner, and Render signs nothing for it', async () => {
  useStudioStore.setState({ brandId: BRAND, nodes: [], edges: [] } as never);
  // Held by another surface or tab: only the stored hold is known here.
  localStorage.setItem(
    holdKeyOf({ userId: USER, brandId: BRAND, bindingId: null, templateKey: '133' }),
    JSON.stringify({ batchId: 'batch-1', heldAt: Date.now() }),
  );
  mountNode();
  const banner = await screen.findByRole('alert');
  expect(banner.textContent).toContain(
    'Retry isn’t available after a reload. Some or all rows may already be rendering. Open Render ledger to check before rendering again.',
  );
  expect(screen.getByRole('button', { name: 'Open Render ledger' })).toBeTruthy();
  const renderButton = screen.getByRole<HTMLButtonElement>('button', { name: /^Render/ });
  expect(renderButton.disabled).toBe(true);
  fireEvent.click(renderButton);
  expect(batchPreflight).not.toHaveBeenCalled();
  expect(createBatch).not.toHaveBeenCalled();
  expect(preflight).not.toHaveBeenCalled();
  expect(createJob).not.toHaveBeenCalled();
});

// The canvas's one-row path (preflight then createJob) is held like a batch of one.
test('a createJob that gets no answer holds the template; Retry re-sends the same single token', async () => {
  useStudioStore.setState({ brandId: BRAND, nodes: [], edges: [] } as never);
  createJob.mockImplementationOnce(async () => {
    throw new ApiError('Service Unavailable', 503, undefined, { error: 'Service Unavailable' });
  });
  mountNode();
  fireEvent.click(await screen.findByRole('button', { name: 'Render 1' }));
  const banner = await screen.findByRole('alert');
  expect(banner.textContent).toContain(
    'Couldn’t confirm with the render service. Some or all rows may already be rendering.',
  );
  // Render waits, and signs nothing more: one preflight, one createJob.
  const renderButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Render 1' });
  expect(renderButton.disabled).toBe(true);
  fireEvent.click(renderButton);
  expect(preflight).toHaveBeenCalledTimes(1);
  expect(createJob).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry this batch' }));
  await waitFor(() => expect(createJob).toHaveBeenCalledTimes(2));
  expect(createJob.mock.calls[1]?.[0]).toEqual({ confirmationToken: 'job-token' });
  expect(createJob.mock.calls[1]?.[0]).toEqual(createJob.mock.calls[0]?.[0]);
  expect(createBatch).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryAllByRole('alert')).toHaveLength(0));
  expect(preflight).toHaveBeenCalledTimes(1);
});

// The check that matters is in Render's own handler: a hold another tab wrote after this node
// drew (no storage event yet, so Render still looks enabled) must still stop the send.
test('Render’s handler reads the hold fresh: written after the node drew, nothing is signed', async () => {
  useStudioStore.setState({ brandId: BRAND, nodes: [], edges: [] } as never);
  mountNode();
  const renderButton = await screen.findByRole<HTMLButtonElement>('button', { name: 'Render 1' });
  await waitFor(() => expect(renderButton.disabled).toBe(false));
  localStorage.setItem(
    holdKeyOf({ userId: USER, brandId: BRAND, bindingId: null, templateKey: '133' }),
    JSON.stringify({ batchId: 'batch-1', heldAt: Date.now(), inflight: true }),
  );
  fireEvent.click(renderButton);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(preflight).not.toHaveBeenCalled();
  expect(batchPreflight).not.toHaveBeenCalled();
  expect(createJob).not.toHaveBeenCalled();
});

test('a render that landed is not shown as failed when the refresh after it fails', async () => {
  useStudioStore.setState({ brandId: BRAND, nodes: [], edges: [] } as never);
  const error = spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    mountNode();
    const renderButton = await screen.findByRole<HTMLButtonElement>('button', { name: 'Render 1' });
    await waitFor(() => expect(renderButton.disabled).toBe(false));
    // The jobs list breaks only now, after the node drew: the refresh after createJob rejects.
    listJobs.mockImplementation(async () => {
      throw new Error('jobs list down');
    });
    fireEvent.click(renderButton);
    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(renderButton.disabled).toBe(false));
    expect(screen.queryByText(/jobs list down|failed/i)).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(
      localStorage.getItem(
        holdKeyOf({ userId: USER, brandId: BRAND, bindingId: null, templateKey: '133' }),
      ),
    ).toBeNull();
  } finally {
    error.mockRestore();
  }
});
