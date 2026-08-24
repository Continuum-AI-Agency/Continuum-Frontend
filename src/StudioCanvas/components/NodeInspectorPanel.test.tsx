import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';

global.getComputedStyle = global.window.getComputedStyle.bind(global.window);
(global as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver;

// The panel renders inside a ReactFlow <Panel>, which needs the flow store context.
// The stub REFLECTS `position` instead of dropping it: a stub that swallows props is
// how a panel that renders top-LEFT passed a suite that claimed it was top-right.
mock.module('@/components/ai-elements/panel', () => ({
  Panel: ({ children, position }: { children: React.ReactNode; position?: string }) => (
    <div data-panel-position={position}>{children}</div>
  ),
}));

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
  listAiStudioWorkflowsAction: mock(async () => []),
  updateAiStudioWorkflowAction: mock(async () => ({})),
  deleteAiStudioWorkflowAction: mock(async () => {}),
}));

// Brand data: static, so the REAL GroundingPopover renders instead of a stub — the
// reuse is the thing under test, not a marker component.
mock.module('@/lib/brands/useBrandBook.client', () => ({
  useBrandBook: () => ({
    brandBook: null,
    brandTokens: {
      colors: [{ name: 'Primary', hex: '#000000' }],
      typography: [{ name: 'Body', family: 'Inter' }],
      voice: 'Direct',
      imagery: null,
      personality: null,
      audience: null,
      logo: null,
    },
    isLoading: false,
    isError: false,
  }),
}));
mock.module('@/lib/brands/useBrandDirectionPieces.client', () => ({
  useBrandDirectionPieces: () => ({ pieces: [], isLoading: false }),
}));
mock.module('@/lib/brands/useBrandDesignSections.client', () => ({
  useBrandDesignSections: () => ({ sections: [], isLoading: false }),
}));
mock.module('@/lib/organic/skills', () => ({
  useBrandSkills: () => ({ all: [], skills: [], templates: [], isLoading: false }),
}));

const { useStudioStore } = await import('../stores/useStudioStore');
const { NodeInspectorPanel } = await import('./NodeInspectorPanel');

type StoreNode = ReturnType<typeof useStudioStore.getState>['nodes'][number];

const seed = (...nodes: Array<Partial<StoreNode> & { id: string; type: string }>) => {
  useStudioStore.setState({
    brandId: 'brand-1',
    saveTrigger: 0,
    nodes: nodes.map(
      (node) =>
        ({ position: { x: 0, y: 0 }, data: {}, selected: true, ...node }) as StoreNode,
    ),
  });
};

const data = (index = 0) =>
  useStudioStore.getState().nodes[index].data as Record<string, unknown>;

describe('NodeInspectorPanel', () => {
  beforeEach(() => {
    show.mockClear();
  });

  afterEach(() => {
    cleanup();
    useStudioStore.setState({ nodes: [] });
  });

  it('renders nothing while no node is selected', () => {
    seed({ id: 'v1', type: 'videoGen', selected: false });
    render(<NodeInspectorPanel />);
    expect(screen.queryByTestId('node-inspector')).toBeNull();
  });

  it('anchors itself top-right, where the canvas expects a selection panel', () => {
    seed({ id: 'v1', type: 'videoGen', data: { model: 'veo-3.1-fast' } });
    render(<NodeInspectorPanel />);

    const panel = screen.getByTestId('node-inspector').closest('[data-panel-position]');
    expect(panel?.getAttribute('data-panel-position')).toBe('top-right');
  });

  it('renders the video generator section for a selected video node', () => {
    seed({ id: 'v1', type: 'videoGen', data: { model: 'veo-3.1', resolution: '720p' } });
    render(<NodeInspectorPanel />);

    expect(screen.getByTestId('node-inspector')).toBeTruthy();
    expect(screen.getByText('Video Generator')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Veo 3.1 Fast/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1080p' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'First / Last Frame' })).toBeTruthy();
  });

  it('writes a model change through the store and persists it', () => {
    seed({ id: 'v1', type: 'videoGen', data: { model: 'veo-3.1-fast' } });
    render(<NodeInspectorPanel />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Seedance 2.0/ }));
    });

    expect(data().model).toBe('seedance-2.0');
    expect(useStudioStore.getState().saveTrigger).toBe(1);
  });

  it('coerces an illegal pair rather than writing it — 1080p forces 8 seconds', () => {
    seed({
      id: 'v1',
      type: 'videoGen',
      data: { model: 'veo-3.1', resolution: '720p', durationSeconds: 4 },
    });
    render(<NodeInspectorPanel />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '1080p' }));
    });

    expect(data().resolution).toBe('1080p');
    expect(data().durationSeconds).toBe(8);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('re-snaps the node box on an aspect-ratio change', () => {
    seed({
      id: 'v1',
      type: 'videoGen',
      data: { model: 'veo-3.1-fast', aspectRatio: '16:9' },
      style: { width: 512, height: 288 },
    });
    render(<NodeInspectorPanel />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '9:16' }));
    });

    const style = useStudioStore.getState().nodes[0].style as { width: number; height: number };
    expect(data().aspectRatio).toBe('9:16');
    expect(style.height).toBeGreaterThan(style.width);
  });

  it('renders the image generator section, with no size picker for a size-less model', () => {
    seed({ id: 'i1', type: 'nanoGen', data: { model: 'nano-banana' } });
    render(<NodeInspectorPanel />);

    expect(screen.getByText('Image Generator')).toBeTruthy();
    expect(screen.getByText(/takes no size parameter/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '2K' })).toBeNull();
  });

  it('offers the size ladder once a model that accepts one is selected', () => {
    seed({ id: 'i1', type: 'nanoGen', data: { model: 'nano-banana-2' } });
    render(<NodeInspectorPanel />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '2K' }));
    });

    expect(data().imageSize).toBe('2K');
  });

  it('renders the omni section and locks the ratio once a chain exists', () => {
    seed({
      id: 'o1',
      type: 'omniGen',
      data: { model: 'gemini-omni-flash', variations: [{ id: 'a' }] },
    });
    render(<NodeInspectorPanel />);

    expect(screen.getByText('Omni Generator')).toBeTruthy();
    expect(screen.getByRole('button', { name: '9:16' }).hasAttribute('disabled')).toBe(true);
  });

  it('edits the extendVideo continuation prompt', () => {
    seed({ id: 'e1', type: 'extendVideo', data: { prompt: '' } });
    render(<NodeInspectorPanel />);

    act(() => {
      fireEvent.change(screen.getByLabelText('Prompt'), {
        target: { value: 'the camera pushes in' },
      });
    });

    expect(data().prompt).toBe('the camera pushes in');
  });

  it('falls back to the generic section for a type with no hand-written one', () => {
    seed({ id: 'f1', type: 'frameExtract', data: { selector: 'last', outputWidth: 1024 } });
    render(<NodeInspectorPanel />);

    expect(screen.getByText('Frame Extract')).toBeTruthy();
    expect(screen.getByText('selector')).toBeTruthy();
    expect(screen.getByText('last')).toBeTruthy();
    expect(screen.getByText('outputWidth')).toBeTruthy();
  });

  it('reuses GroundingPopover inside the panel for a generation node', () => {
    seed({ id: 'v1', type: 'videoGen', data: { model: 'veo-3.1-fast' } });
    render(<NodeInspectorPanel />);

    // The popover's own copy — proves the shared editor is mounted, not reimplemented.
    expect(screen.getByText('Enforce brand book')).toBeTruthy();
    expect(screen.getByText(/What this generation is allowed to draw on/)).toBeTruthy();
  });

  it('writes a brand-book toggle from inside the panel', () => {
    seed({ id: 'v1', type: 'videoGen', data: { model: 'veo-3.1-fast' } });
    render(<NodeInspectorPanel />);

    // Enforcement is default-ON (`DEFAULT_BRAND_BOOK_PIECES`), so the first click
    // clears it and the second puts the whole book back.
    act(() => {
      fireEvent.click(screen.getByText('Enforce brand book'));
    });
    expect(data().brandBookPieces).toEqual([]);

    act(() => {
      fireEvent.click(screen.getByText('Enforce brand book'));
    });
    expect(data().brandBookPieces).toEqual(['full']);
    expect(useStudioStore.getState().saveTrigger).toBe(2);
  });

  it('omits grounding for a node type that carries none', () => {
    seed({ id: 'f1', type: 'frameExtract', data: { selector: 'first' } });
    render(<NodeInspectorPanel />);

    expect(screen.queryByText('Enforce brand book')).toBeNull();
  });

  it('summarises a multi-selection instead of editing one node', () => {
    seed(
      { id: 'v1', type: 'videoGen', data: { model: 'veo-3.1-fast' } },
      { id: 'i1', type: 'nanoGen', data: { model: 'nano-banana-2' } },
    );
    render(<NodeInspectorPanel />);

    expect(screen.getByText('2 nodes selected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '1080p' })).toBeNull();
    expect(screen.getByText('Video Generator')).toBeTruthy();
    expect(screen.getByText('Image Generator')).toBeTruthy();
  });

  it('fires the bulk actions with the selected ids', () => {
    const runSelection = mock((_ids: string[]) => {});
    const enforce = mock(() => {});
    seed(
      { id: 'v1', type: 'videoGen', data: {} },
      { id: 'i1', type: 'nanoGen', data: {} },
    );
    render(
      <NodeInspectorPanel onRunSelection={runSelection} onEnforceBrandBook={enforce} />,
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Run selection/ }));
      fireEvent.click(screen.getByRole('button', { name: /Enforce brand book/ }));
    });

    expect(runSelection).toHaveBeenCalledTimes(1);
    expect(runSelection.mock.calls[0][0]).toEqual(['v1', 'i1']);
    expect(enforce).toHaveBeenCalledTimes(1);
  });

  it('hides a bulk action the shell did not wire', () => {
    seed(
      { id: 'v1', type: 'videoGen', data: {} },
      { id: 'i1', type: 'nanoGen', data: {} },
    );
    render(<NodeInspectorPanel />);

    expect(screen.queryByRole('button', { name: /Run selection/ })).toBeNull();
  });

  it('offers Save as technique at any selection size', () => {
    seed({ id: 'v1', type: 'videoGen', data: {} });
    render(<NodeInspectorPanel />);
    expect(screen.getByRole('button', { name: /Save as technique/ })).toBeTruthy();
    cleanup();

    seed({ id: 'v1', type: 'videoGen', data: {} }, { id: 'i1', type: 'nanoGen', data: {} });
    render(<NodeInspectorPanel />);
    expect(screen.getByRole('button', { name: /Save as technique/ })).toBeTruthy();
  });

  it('keeps the save dialog unmounted until it is asked for', () => {
    seed({ id: 'i1', type: 'nanoGen', data: {} });
    // The dialog invalidates the techniques query on save, so it needs a client
    // once it mounts. The app root provides one; the panel alone does not.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <NodeInspectorPanel />
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId('save-technique-dialog')).toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Save as technique/ }));
    });

    expect(screen.getByTestId('save-technique-dialog')).toBeTruthy();
    expect(screen.getByText('Save selection as technique')).toBeTruthy();
  });

  it('closing the panel clears the selection', () => {
    seed({ id: 'v1', type: 'videoGen', data: {} });
    render(<NodeInspectorPanel />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    });

    expect(useStudioStore.getState().nodes.every((node) => !node.selected)).toBe(true);
  });
});
