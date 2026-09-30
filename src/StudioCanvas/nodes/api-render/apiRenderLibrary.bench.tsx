/** UI regression bench. Provider transport is stubbed; the real local runtime bench
 * is studio:implementation:e2e:bench. Covers cards, discovery, input and recovery wiring. */
import { afterEach, expect, mock, test } from 'bun:test';
import { type ApiRenderJob, type ApiRenderVariable, createNodeData } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';

const brandId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const variable = (over: Partial<ApiRenderVariable> = {}): ApiRenderVariable => ({
  key: 'headline',
  label: 'Headline',
  kind: 'text',
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  ...over,
});
const template = {
  key: '166',
  bindingId: assetId,
  name: 'Demo template',
  displayName: null,
  contractHash: 'hash',
  ratios: ['1:1'],
  contractSource: 'template_forge',
  sourceAssetId: null,
  fontsMissing: 0,
};
const output = {
  id: 'square',
  kind: 'image' as const,
  fileName: 'square.png',
  mimeType: 'image/png',
  url: 'https://example.test/square.png',
  width: 1080,
  height: 1080,
  assetId,
  versionId,
};
const job = {
  id: assetId,
  brandId,
  templateKey: '166',
  status: 'finished',
  outputs: [output],
  error: null,
} as ApiRenderJob;
let eligible = true;
const requests: Array<Record<string, unknown>> = [];
let checkpointError = false;
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      abortSignal: () => query,
      maybeSingle: async () => ({
        data: { nodes: useStudioStore.getState().nodes },
        error: checkpointError ? { message: 'offline' } : null,
      }),
    };
    return { schema: () => ({ from: () => query }) };
  },
}));
mock.module('./apiRendersApi', () => ({
  apiRendersApi: {
    listTemplates: async () => ({
      items: [template],
      workspace: {
        renderEligible: eligible,
        state: eligible ? 'ready' : 'env_plane_undeployed',
        detail: 'Templates shown here are from the shared workspace.',
      },
    }),
    listJobs: async () => ({ items: [], nextCursor: null }),
    getJob: async () => job,
    listInputSets: async () => ({ items: [], nextCursor: null }),
    getContract: async () => ({
      template,
      variables: [variable()],
      layout: null,
      fonts: [],
      outputs: [],
    }),
    preflight: async (value: Record<string, unknown>) => {
      requests.push(value);
      return { confirmationToken: 'signed', renderInput: value.variables };
    },
    createJob: async () => job,
  },
}));
mock.module('./CanvasRenderPreview', () => ({ CanvasRenderPreview: () => null }));
const { useStudioStore } = await import('../../stores/useStudioStore');
const { ForgeRenderSettings } = await import('../ForgeRenderSettings');
const { ApiRenderBlock } = await import('../ApiRenderBlock');
const { runImplementationNode } = await import('../../utils/runImplementationNode');
function Harness({ settings = false }: { settings?: boolean }) {
  const node = useStudioStore((state) => state.nodes.find((value) => value.id === 'render')!);
  return settings ? (
    <ForgeRenderSettings id="render" data={node.data as never} />
  ) : (
    <ApiRenderBlock
      id="render"
      data={node.data as never}
      selected={false}
      type="apiRender"
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
function mount(data: Record<string, unknown> = {}, settings = false) {
  useStudioStore.setState({
    brandId,
    activeRoomId: 'ui-bench',
    nodes: [
      {
        id: 'render',
        type: 'apiRender',
        position: { x: 0, y: 0 },
        ...createNodeData('apiRender', data),
      },
    ],
    edges: [],
    triggerSave: () => undefined,
  } as never);
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <Harness settings={settings} />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  eligible = true;
  requests.length = 0;
  checkpointError = false;
});
test('card keeps configuration off canvas and selects the inspector', () => {
  mount();
  expect(screen.queryByPlaceholderText('Search templates…')).toBeNull();
  expect((screen.getByRole('button', { name: 'Render' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Configure Forge Render' }));
  expect(useStudioStore.getState().nodes[0]?.selected).toBe(true);
  expect(document.querySelector('[data-handleid="collection"]')).not.toBeNull();
});
test('inspector respects the server workspace eligibility verdict', async () => {
  eligible = false;
  mount({}, true);
  const button = await screen.findByRole('button', { name: 'Choose template…' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  expect(
    await screen.findByText('Templates shown here are from the shared workspace.'),
  ).toBeTruthy();
});
test('searchable discovery loads the template contract and exposes its fields', async () => {
  mount({}, true);
  const button = await screen.findByRole('button', { name: 'Choose template…' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  fireEvent.click(await screen.findByText('Demo template'));
  await waitFor(() => expect(useStudioStore.getState().nodes[0]?.data.contractHash).toBe('hash'));
  expect(await screen.findByLabelText('Headline')).toBeTruthy();
});
test('brand switch invalidates contract, variables and previous render recovery', async () => {
  mount(
    {
      templateKey: '166',
      contractHash: 'hash',
      variables: { headline: 'old' },
      renderRequestIds: [assetId],
    },
    true,
  );
  await act(async () => useStudioStore.setState({ brandId: versionId }));
  await waitFor(() => expect(useStudioStore.getState().nodes[0]?.data.templateKey).toBeNull());
  expect(useStudioStore.getState().nodes[0]?.data.variables).toEqual({});
  expect(useStudioStore.getState().nodes[0]?.data.renderRequestIds ?? []).toEqual([]);
});
test('card and workflow share Library-only rendering, all outputs and retry ids', async () => {
  mount({
    templateKey: '166',
    contractHash: 'hash',
    variableDefinitions: [variable()],
    variables: { headline: 'Exact copy' },
    deliveryEnabled: true,
    delivery: { action: 'create', adAccountId: 'a', campaignId: 'c', adsetId: 's' },
  });
  let result: Awaited<ReturnType<typeof runImplementationNode>>;
  await act(async () => {
    result = await runImplementationNode('render');
  });
  expect(result!.type).toBe('render');
  expect(requests[0]?.delivery).toBeUndefined();
  expect(useStudioStore.getState().nodes[0]?.data.renderOutputs).toEqual([
    {
      jobId: job.id,
      outputId: output.id,
      kind: 'image',
      fileName: output.fileName,
      assetId,
      versionId,
    },
  ]);
  const requestId = requests[0]?.requestId;
  await act(async () => {
    await runImplementationNode('render');
  });
  expect(requests[1]?.requestId).toBe(requestId);
  useStudioStore
    .getState()
    .updateNodeData('render', { renderRequestIds: [], renderInputSignature: undefined });
  await act(async () => {
    await runImplementationNode('render');
  });
  expect(requests[2]?.requestId).toBe(requestId);
  useStudioStore.getState().updateNodeData('render', {
    renderEpoch: 'explicit-new-render',
    renderRequestIds: [],
    renderInputSignature: undefined,
  });
  await act(async () => {
    await runImplementationNode('render');
  });
  expect(requests[3]?.requestId).not.toBe(requestId);
});
test('missing required fields refuse before any job is submitted', async () => {
  mount({
    templateKey: '166',
    contractHash: 'hash',
    variableDefinitions: [variable({ required: true })],
  });
  await act(async () => {
    await expect(runImplementationNode('render')).rejects.toThrow('required');
  });
  expect(requests).toHaveLength(0);
  expect(useStudioStore.getState().nodes[0]?.data.isExecuting).toBe(false);
});

test('an unreadable Canvas checkpoint refuses before submitting a render', async () => {
  mount({ templateKey: '166', contractHash: 'hash', variableDefinitions: [variable()] });
  checkpointError = true;
  await act(async () => {
    await expect(runImplementationNode('render')).rejects.toThrow('checkpoint');
  });
  expect(requests).toHaveLength(0);
});
