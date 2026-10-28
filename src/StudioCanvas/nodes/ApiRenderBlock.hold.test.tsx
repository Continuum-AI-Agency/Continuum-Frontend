// The canvas render node under a held batch. A batch held for a template (by any Forge set, any
// tab, or this node) means the node signs nothing more for it: the banner says why, Render waits,
// and no preflight or createBatch is called.

import { afterEach, expect, mock, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';

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
const preflight = mock(async () => ({ confirmationToken: 't' }));
const createJob = mock(async () => ({ id: 'job' }));
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
    listJobs: async () => ({ items: [], nextCursor: null }),
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
  forgetPageSession();
  localStorage.clear();
});

test('a held template shows the banner, and Render signs nothing for it', async () => {
  useStudioStore.setState({ brandId: BRAND, nodes: [], edges: [] } as never);
  // Held by another surface or tab: only the stored hold is known here.
  localStorage.setItem(
    holdKeyOf({ userId: USER, brandId: BRAND, bindingId: null, templateKey: '133' }),
    JSON.stringify({ batchId: 'batch-1', heldAt: Date.now() }),
  );
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
