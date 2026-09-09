import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';

global.getComputedStyle = global.window.getComputedStyle.bind(global.window);
(global as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver;

const show = mock(() => {});
mock.module('@/components/ui/ToastProvider', () => ({
  TOAST_VARIANTS: ['success', 'info', 'warning', 'error'] as const,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  ToastError: class ToastError extends Error {},
  coerceToastOptions: (_error: unknown, fallback: unknown) => fallback,
  useToastContext: () => ({ show }),
  useToast: () => ({ show }),
  throwToastError: (options: { title: string }) => {
    throw new Error(options.title);
  },
}));

const createWorkflow = mock(async () => ({}));
mock.module('@/lib/ai-studio/workflowActions', () => ({
  createAiStudioWorkflowAction: createWorkflow,
}));

const publishPipeline = mock(async () => ({}));
const draftPipelineGuide = mock(async () => ({
  description: 'Creates approved character launch images.',
  agent_guide: {
    version: 1 as const,
    use_when: ['A launch needs character imagery.'],
    avoid_when: [],
    input_guidance: [],
    invocation_notes: [],
  },
}));
mock.module('@/lib/ai-studio/pipelines', () => ({ draftPipelineGuide, publishPipeline }));

// The REAL store, seeded per test. Mocking the store MODULE instead leaks into every file
// that runs after this one in the same `bun test` invocation — it took the whole
// StudioCanvas/components directory from 3 failures to 38.
const { useStudioStore } = await import('../stores/useStudioStore');
const { SaveWorkflowDialog } = await import('./SaveWorkflowDialog');

type StoreNode = ReturnType<typeof useStudioStore.getState>['nodes'][number];
type StoreEdge = ReturnType<typeof useStudioStore.getState>['edges'][number];

const BRAND = '868a01f9-101b-4e0e-8392-6358a127ad97';

const GEN = { id: 'gen', type: 'nanoGen', position: { x: 0, y: 0 }, data: {} } as StoreNode;
const REF = { id: 'ref', type: 'image', position: { x: 10, y: 0 }, data: {} } as StoreNode;
const EDGE = {
  id: 'ref->gen',
  source: 'ref',
  target: 'gen',
  targetHandle: 'ref-image',
} as StoreEdge;

const renderPanel = (selection?: StoreNode[]) => {
  useStudioStore.setState({ brandId: BRAND, nodes: [GEN, REF], edges: [EDGE] });
  return render(
    <SaveWorkflowDialog
      brandProfileId={BRAND}
      open
      showTrigger={false}
      {...(selection ? { selection } : {})}
    />,
  );
};

async function chooseSelect(name: RegExp, optionName: string) {
  const trigger = screen.getByRole('combobox', { name });
  fireEvent.pointerDown(trigger);
  fireEvent.pointerUp(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
  await waitFor(() => expect(screen.queryByRole('option', { name: optionName })).toBeNull());
}

beforeEach(() => {
  createWorkflow.mockClear();
  draftPipelineGuide.mockClear();
  publishPipeline.mockClear();
});

afterEach(() => {
  cleanup();
  useStudioStore.setState({ nodes: [], edges: [] });
});

describe('SaveWorkflowDialog mounted without a trigger', () => {
  // The canvas context menu opens this with `showTrigger={false}`. Keeping the Popover and
  // merely hiding its trigger left the content with nothing to anchor to and it never became
  // visible. The context-menu test greened straight through that because it only asserted
  // the callback ran — and a Popover query would have too, since the content still mounts.
  // These assert the triggerless BRANCH, which is the thing a person actually sees.
  it('renders the save panel when open', () => {
    renderPanel();
    expect(screen.getByTestId('save-workflow-panel')).toBeDefined();
    expect(screen.getByLabelText('Name')).toBeDefined();
  });

  it('renders nothing while closed', () => {
    useStudioStore.setState({ brandId: BRAND, nodes: [GEN], edges: [] });
    render(<SaveWorkflowDialog brandProfileId={BRAND} open={false} showTrigger={false} />);
    expect(screen.queryByTestId('save-workflow-panel')).toBeNull();
  });

  it('names the scope when a selection was handed in', () => {
    renderPanel([GEN]);
    // Heading AND submit button both name the scope — that agreement is the point.
    expect(screen.getAllByText('Save selection')).toHaveLength(2);
    expect(screen.getByText(/from your selection/)).toBeDefined();
  });

  it('falls back to the whole canvas when the selection is empty', () => {
    renderPanel([]);
    expect(screen.getByRole('button', { name: 'Save workflow' })).toBeDefined();
    expect(screen.getByText(/2 nodes and 1 connection/)).toBeDefined();
    expect(screen.queryByText(/from your selection/)).toBeNull();
  });

  // A scoped save persists only the edges wholly inside the selection — otherwise the saved
  // subgraph re-applies with wires dangling to nodes that were left behind.
  it('persists only the edges inside the selection', async () => {
    renderPanel([GEN]);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hero shot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));

    await waitFor(() => expect(createWorkflow).toHaveBeenCalledTimes(1));
    const payload = createWorkflow.mock.calls[0]?.[0] as unknown as {
      name: string;
      nodes: { id: string }[];
      edges: unknown[];
    };
    expect(payload.name).toBe('Hero shot');
    expect(payload.nodes.map((node) => node.id)).toEqual(['gen']);
    expect(payload.edges).toEqual([]);
  });

  it('publishes authored Element input and candidate output semantics', async () => {
    renderPanel([GEN]);
    const pipeline = screen.getByRole('button', { name: 'Pipeline' });
    fireEvent.pointerDown(pipeline);
    fireEvent.pointerUp(pipeline);
    fireEvent.click(pipeline);

    await chooseSelect(/reference image input type/i, 'Element');
    await chooseSelect(/reference image element category/i, 'Character');
    await chooseSelect(/image output type/i, 'Element candidate');
    await chooseSelect(/image candidate category/i, 'Character');
    fireEvent.change(screen.getByLabelText(/image candidate rights note/i), {
      target: { value: 'Brand-owned fictional character.' },
    });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Character launch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft guide' }));
    await screen.findByDisplayValue('A launch needs character imagery.');
    fireEvent.click(screen.getByRole('button', { name: 'Publish pipeline' }));

    await waitFor(() => expect(publishPipeline).toHaveBeenCalledTimes(1));
    expect(createWorkflow).not.toHaveBeenCalled();
    const payload = publishPipeline.mock.calls[0]?.[0] as unknown as {
      pipeline: {
        inputPorts: Array<{ dataType?: string; pipelineBinding?: unknown }>;
        outputPorts: Array<{ dataType?: string; pipelineBinding?: unknown }>;
      };
    };
    expect(
      payload.pipeline.inputPorts.find((port) => port.dataType === 'image')?.pipelineBinding,
    ).toEqual({ kind: 'element', allowedCategories: ['character'] });
    expect(
      payload.pipeline.outputPorts.find((port) => port.dataType === 'image')?.pipelineBinding,
    ).toEqual({
      kind: 'element_candidate',
      category: 'character',
      rightsNote: 'Brand-owned fictional character.',
    });
  });
});
