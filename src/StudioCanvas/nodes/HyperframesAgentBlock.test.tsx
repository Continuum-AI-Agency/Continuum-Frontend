import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ClientRenderContext } from '@/lib/client-render/ClientRenderProvider';
import {
  markRenderStartedHere,
  resetRendersStartedHere,
  shouldAutoRunClientRenderJob,
} from '@/lib/client-render/ownedRuns';
import { clearVideoAspectCache } from '../hooks/useSnapToVideoAspect';
import { useStudioStore } from '../stores/useStudioStore';
import type { HyperframesAgentNodeData } from '../types';
import { HyperframesAgentBlock } from './HyperframesAgentBlock';

const NODE_ID = 'hyper-1';

const baseProps: Omit<ComponentProps<typeof HyperframesAgentBlock>, 'data'> = {
  id: NODE_ID,
  selected: false,
  type: 'hyperframesAgent',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const hyperData = (overrides: Partial<HyperframesAgentNodeData> = {}): HyperframesAgentNodeData =>
  ({
    label: 'HyperFrames Agent',
    model: 'gemini-3.6-flash',
    prompt: '',
    aspectRatio: '16:9',
    durationSeconds: 10,
    fps: 30,
    resolution: '1080p',
    status: 'idle',
    ...overrides,
  }) as HyperframesAgentNodeData;

let originalCreateElement: typeof document.createElement;
let videosCreated: HTMLVideoElement[] = [];

type Queue = NonNullable<ComponentProps<typeof ClientRenderContext.Provider>['value']>;

const renderNode = (data: HyperframesAgentNodeData, queue: Queue | null = null) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [
      {
        id: NODE_ID,
        type: 'hyperframesAgent',
        position: { x: 0, y: 0 },
        data,
        style: { width: 640, height: 360 },
      },
    ],
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ClientRenderContext.Provider value={queue}>
          <ReactFlowProvider>
            <HyperframesAgentBlock {...baseProps} data={data} />
          </ReactFlowProvider>
        </ClientRenderContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const node = () => useStudioStore.getState().nodes.find((n) => n.id === NODE_ID);

const RENDER_JOB = {
  id: 'de3e6121-89d0-49ed-ade8-733e68773003',
  brandId: '1d1eac52-2955-42bd-81b5-a47808214ae2',
  kind: 'hyperframes_agent',
  state: 'ready',
  sourceId: '2b0d1647-fce9-46db-a1ce-49b18973cd96',
  executionSpec: {
    kind: 'hyperframes_agent',
    runId: '2b0d1647-fce9-46db-a1ce-49b18973cd96',
    canvasId: 'e08281d4-a740-497f-b4b2-260f32991379',
    nodeId: NODE_ID,
    origin: { label: 'HyperFrames Agent', viewHref: '/ai-studio' },
  },
} as unknown as Queue['jobs'][number];

const queueWith = (jobs: Queue['jobs'], overrides: Partial<Queue> = {}): Queue =>
  ({
    jobs,
    readyCount: jobs.length,
    inboxOpen: false,
    setInboxOpen: () => undefined,
    run: async () => undefined,
    retry: async () => undefined,
    stop: async () => undefined,
    refresh: async () => undefined,
    canExecute: () => true,
    isRunningLocally: () => false,
    // The real provider answers this with the viewer bound in; the fixture keeps the
    // same predicate so `markRenderStartedHere` still means what it means in the app.
    willAutoRun: (job: Queue['jobs'][number]) => shouldAutoRunClientRenderJob(job),
    ...overrides,
  }) as Queue;

describe('HyperframesAgentBlock rendered-composition preview', () => {
  beforeEach(() => {
    // The video aspect probe is memoized across the module; a stale entry from another
    // suite would answer instantly and this file's detached-element assertions never fire.
    clearVideoAspectCache();
    videosCreated = [];
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === 'video') videosCreated.push(element as HTMLVideoElement);
      return element;
    }) as typeof document.createElement;
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
    resetRendersStartedHere();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    cleanup();
  });

  it('re-snaps the box to the rendered composition, above its resizer minimums', async () => {
    const { container } = renderNode(
      hyperData({ generatedVideoUrl: 'https://example.com/portrait.mp4', status: 'completed' }),
    );

    // The ratio is read from the element ALREADY showing the clip. Measuring with a
    // second, detached element downloaded the same bytes twice — both requests issued
    // in the same instant under the same token, so neither could use the other's cache.
    const rendered = Array.from(container.querySelectorAll('video'));
    const detached = videosCreated.filter((element) => !rendered.includes(element));
    expect(detached).toHaveLength(0);
    const detection = rendered[0];
    if (!detection) throw new Error('the node rendered no video to measure');

    Object.defineProperty(detection, 'videoWidth', { configurable: true, value: 1080 });
    Object.defineProperty(detection, 'videoHeight', { configurable: true, value: 1920 });
    await act(async () => {
      fireEvent.loadedMetadata(detection);
    });

    await waitFor(() => {
      const style = node()?.style as { width: number; height: number };
      expect(style.width / style.height).toBeCloseTo(9 / 16, 2);
    });
    const style = node()?.style as { width: number; height: number };
    expect(style.width).toBeGreaterThanOrEqual(360);
    expect(style.height).toBeGreaterThanOrEqual(360);
    expect((node()?.data as HyperframesAgentNodeData).aspectRatio).toBe('16:9');
  });

  // Airtable #295, both halves of it.
  //
  // The Style pill was floated at `left-2 top-2` over a node that — unlike the four
  // generators using that placement — has a title bar, so it painted over the node's own
  // title and the header read "…mes Agent". And the Card's default width is `w-sm`
  // (384px) while this node is created 420 wide, so the card drew 36px narrower than the
  // box the NodeResizer's handles bound: the "flying point in the end".
  it('puts the grounding chip in the title bar, not over the title', () => {
    const { container, getByTestId } = renderNode(hyperData());

    const titleBar = container.querySelector('[data-slot="card"] > div');
    expect(titleBar?.textContent).toContain('HyperFrames Agent');
    expect(titleBar?.contains(getByTestId('studio-grounding-chip'))).toBe(true);

    // Nothing absolutely positioned is anchored over the bar any more.
    expect(getByTestId('studio-grounding-chip').closest('.absolute')).toBeNull();
  });

  it('draws its card at the full width of the node box, so the resize handles bound it', () => {
    const { container } = renderNode(hyperData());
    const classes = (container.querySelector('[data-slot="card"]')?.className ?? '').split(/\s+/);
    // `w-sm` surviving here is the defect: it pins the card to 384px whatever the node is.
    expect(classes).toContain('size-full');
    expect(classes).not.toContain('w-sm');
  });

  it('scrubs the composition in-node and only fetches metadata', () => {
    const { container } = renderNode(
      hyperData({ generatedVideoUrl: 'https://example.com/clip.mp4', status: 'completed' }),
    );

    expect(container.querySelector('media-controller')).not.toBeNull();
    expect(container.querySelector('media-time-range')).not.toBeNull();
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('playsinline')).not.toBeNull();
    expect(video.className).toContain('object-contain');
  });
  // Airtable #296. The node promised "rendering continues in this tab" over a job that
  // nothing was running: three sat `ready` for days, giving no feedback and offering no
  // way out. A waiting job must say so and be one click from rendering.
  it('offers to render here when the job is waiting for a device', () => {
    const ran: unknown[] = [];
    const { getByText, queryByText } = renderNode(
      hyperData({ status: 'queued', isExecuting: true }),
      queueWith([RENDER_JOB], { run: async (target: unknown) => void ran.push(target) }),
    );

    expect(queryByText(/rendering continues in this tab/i)).toBeNull();
    expect(getByText(/Waiting for a device to render/i)).not.toBeNull();
    fireEvent.click(getByText('Render here'));
    expect(ran).toEqual([RENDER_JOB]);
  });

  it('does not flash "waiting" over a run this tab is about to claim', () => {
    markRenderStartedHere(RENDER_JOB.sourceId as string);
    const { getByText, queryByText } = renderNode(
      hyperData({ status: 'queued', isExecuting: true }),
      queueWith([RENDER_JOB]),
    );

    expect(queryByText('Render here')).toBeNull();
    expect(getByText(/rendering continues in this tab/i)).not.toBeNull();
  });

  it('keeps the in-tab promise while the job is actually being rendered here', () => {
    const { getByText } = renderNode(
      hyperData({ status: 'rendering', isExecuting: true }),
      queueWith([RENDER_JOB], { isRunningLocally: () => true }),
    );
    expect(getByText(/rendering continues in this tab/i)).not.toBeNull();
  });
});
