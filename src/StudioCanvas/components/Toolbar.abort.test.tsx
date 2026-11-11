import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// Abort used to latch forever: cancel() set the hook's cancelled flag and only an uncalled
// reset() cleared it, so every later Run on that canvas returned "Execution cancelled".

mock.module('@/lib/api/http', () => ({
  http: { request: mock(() => Promise.resolve({ elements: [] })) },
}));
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

type Controls = {
  executeGeneration: (nodeId: string, payload: never) => Promise<{ error?: string }>;
};
const payload = { medium: 'image', prompt: 'a sneaker', brand_id: 'brand-1' } as never;

let started = 0;
let releaseFirstRun: () => void = () => undefined;
const results: Record<string, string | undefined> = {};

mock.module('../utils/executeWorkflow', () => ({
  executeWorkflow: async (controls: Controls) => {
    started += 1;
    const runNumber = started;
    // The first run is mid-node when Abort lands, then reaches its next node.
    if (runNumber === 1) await new Promise<void>((resolve) => (releaseFirstRun = resolve));
    results[`run${runNumber}`] = (
      await controls.executeGeneration(`node-${runNumber}`, payload)
    ).error;
  },
}));

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { ToastProvider } = await import('@/components/ui/ToastProvider');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { ReactFlowProvider } = await import('@xyflow/react');
const { installPickerDomGlobals } = await import(
  '@/components/automations/workspace/pickers/pickerTestHarness'
);
const { useStudioStore } = await import('../stores/useStudioStore');
const { Toolbar } = await import('./Toolbar');

installPickerDomGlobals();

const renderToolbar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ReactFlowProvider>
          <Toolbar />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

const backendError = 'Backend reached: no image returned';
const originalFetch = globalThis.fetch;

describe('Toolbar abort', () => {
  beforeEach(() => {
    started = 0;
    for (const key of Object.keys(results)) delete results[key];
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1' });
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `event: error\ndata: {"message":"${backendError}","code":"image_empty_response"}\n\n`,
              ),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('keeps the aborted run cancelled and lets the next run execute', async () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Flow' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abort' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Flow' }));

    // The next run waits for the aborted one instead of running beside it.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toBe(1);

    releaseFirstRun();
    await waitFor(() => expect(results.run2).toBeDefined());

    expect(results.run1).toBe('Execution cancelled');
    expect(results.run2).toContain(backendError);
  });

  it('does not start a run that was aborted while it waited', async () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Flow' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abort' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Flow' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abort' }));

    releaseFirstRun();
    await waitFor(() => expect(results.run1).toBe('Execution cancelled'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(started).toBe(1);
  });
});
