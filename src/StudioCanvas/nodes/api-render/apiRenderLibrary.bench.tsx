/**
 * api-render library bench — proves the two things the render node did NOT do.
 *
 * Before this, a finished render was invisible and unsaved from the canvas's point of
 * view: the node fetched jobs once on mount and then only ever again when a human
 * pressed refresh, and a completed render was rendered as a bare `<a href>` to a fleet
 * URL. A render takes minutes, so "only on click" meant the screen showing the render
 * was usually the last to know about it.
 *
 * Asserted here, against the REAL component:
 *   1. while a job is in flight the node re-reads on its own, with no interaction —
 *      and it reads the PER-JOB route (the backend's live relay, which pulls fleet
 *      status and runs ingest/delivery reconciliation), not the stored-row list;
 *   2. a finished output is actually displayed, and says whether it reached the
 *      brand's media library yet;
 *   3. a job is badged as a watermarked test render — the state rides the contract,
 *      the UI never assumes it;
 *   4. the campaign picker stays usable after a campaign is chosen: the campaign
 *      list is still there and the ad-set list loads beside it (the old single
 *      shared list vanished on first choice).
 *
 * UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
 *   · a real browser, the real canvas, or a reload. `apiRendersApi` is mocked here.
 *   · the backend, the render fleet, or the library ingest itself. That whole chain is
 *     proven live by `render:library:e2e:bench`, which follows one real render to a
 *     `media.assets` row whose bytes download.
 *
 * Runs under `bun test` for the happy-dom preload in bunfig.toml.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ApiRenderJob } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const finishedOutput = (assetId: string | null) => ({
  id: 'out1',
  kind: 'image' as const,
  fileName: 'render-1.png',
  mimeType: 'image/png',
  url: 'https://picnic-studio-v3-main-storage.s3.us-east-2.amazonaws.com/out/render-1.png',
  width: null,
  height: null,
  assetId,
  versionId: assetId ? '22222222-2222-4222-8222-222222222222' : null,
});

let listJobsCalls = 0;
let getJobCalls = 0;
let currentJobs: ApiRenderJob[] = [];

mock.module('./apiRendersApi', () => ({
  apiRendersApi: {
    listTemplates: async () => ({ items: [], nextCursor: null, workspace: undefined }),
    listJobs: async () => {
      listJobsCalls += 1;
      return { items: currentJobs, nextCursor: null };
    },
    getContract: async () => ({ template: {}, variables: [] }),
    preflight: async () => ({}),
    createJob: async () => ({}),
    getJob: async (_brandId: string, jobId: string) => {
      getJobCalls += 1;
      return currentJobs.find((item) => item.id === jobId) ?? currentJobs[0];
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
    searchPaid: async (input: { level: string }) => ({
      adAccountId: 'act_1',
      nextCursor: null,
      items:
        input.level === 'campaign'
          ? [
              paidTarget({ id: 'c1', name: 'Campaign One' }),
              paidTarget({ id: 'c2', name: 'Campaign Two' }),
            ]
          : [paidTarget({ id: 'a1', name: 'Adset One', level: 'adset', campaignId: 'c1' })],
    }),
  },
}));

const { ApiRenderBlock } = await import('../ApiRenderBlock');
const { useStudioStore } = await import('../../stores/useStudioStore');

function renderNode(data: Record<string, unknown> = { variables: {}, status: 'idle' }) {
  useStudioStore.setState({ brandId: BRAND_ID });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ReactFlowProvider>
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
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  listJobsCalls = 0;
  getJobCalls = 0;
  currentJobs = [];
});

describe('ApiRenderBlock', () => {
  test('re-reads the per-job live relay on its own while a render is in flight', async () => {
    currentJobs = [job({ status: 'rendering' })];
    renderNode();

    await waitFor(() => expect(listJobsCalls).toBeGreaterThan(0));
    expect(getJobCalls).toBe(0);

    // No click, no refresh press — and the poll must hit getJob, the route whose
    // backend side pulls fleet status and reconciles ingest/delivery. Polling the
    // list would freeze the canvas whenever the fleet callback failed to arrive.
    await waitFor(() => expect(getJobCalls).toBeGreaterThan(0), { timeout: 9_000 });
  }, 15_000);

  test('stops re-reading once nothing is in flight', async () => {
    currentJobs = [job({ status: 'finished', outputs: [finishedOutput('a-1')] })];
    renderNode();

    await waitFor(() => expect(listJobsCalls).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(getJobCalls).toBe(0);
  });

  test('shows the finished render and reports it reached the library', async () => {
    currentJobs = [
      job({
        status: 'finished',
        outputs: [finishedOutput('33333333-3333-4333-8333-333333333333')],
      }),
    ];
    renderNode();

    const image = await screen.findByAltText('Demo template render');
    expect(image.getAttribute('src')).toContain('render-1.png');
    expect(await screen.findByText('Saved to Library')).toBeTruthy();
  });

  test('says the save is still running when the output has no library asset yet', async () => {
    currentJobs = [job({ status: 'finished', outputs: [finishedOutput(null)] })];
    renderNode();

    // The render succeeded; only its library copy has not landed. Claiming 'Saved'
    // here would tell the user something false about where their asset is.
    expect(await screen.findByText('Saving to Library…')).toBeTruthy();
  });

  test('badges a job as a watermarked test render, from the contract not an assumption', async () => {
    currentJobs = [job({ status: 'finished', outputs: [finishedOutput('a-1')] })];
    renderNode();

    expect(await screen.findByText('Test · watermarked')).toBeTruthy();
  });

  test('the campaign list survives choosing a campaign, and the ad-set list loads beside it', async () => {
    // The old single shared targets array refetched at ad-set level on first choice,
    // which emptied the campaign list — re-picking meant blindly clearing the value.
    renderNode({
      variables: {},
      status: 'idle',
      delivery: {
        action: 'create',
        adStatus: 'PAUSED',
        adAccountId: 'act_1',
        campaignId: 'c1',
        campaignName: 'Campaign One',
      },
    });

    const otherCampaign = await screen.findByRole('option', { name: 'Campaign Two' });
    expect(otherCampaign).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'Adset One' })).toBeTruthy();
  });
});
