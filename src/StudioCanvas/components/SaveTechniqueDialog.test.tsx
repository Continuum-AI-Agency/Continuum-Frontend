import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { brandTechniquesQueryKey } from '@/lib/ai-studio/techniques';

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
  listAiStudioWorkflowsAction: mock(async () => []),
  updateAiStudioWorkflowAction: mock(async () => ({})),
  deleteAiStudioWorkflowAction: mock(async () => {}),
}));

const { useStudioStore } = await import('../stores/useStudioStore');
const { SaveTechniqueDialog } = await import('./SaveTechniqueDialog');

type StoreNode = ReturnType<typeof useStudioStore.getState>['nodes'][number];
type StoreEdge = ReturnType<typeof useStudioStore.getState>['edges'][number];

const node = (id: string, type: string, x = 0): StoreNode =>
  ({ id, type, position: { x, y: 0 }, data: {}, selected: true }) as StoreNode;

const BRAND = '868a01f9-101b-4e0e-8392-6358a127ad97';

/**
 * The Add Node → Techniques list is mounted for the whole canvas session
 * (StudioCanvas calls useTechniques), so the save's cache invalidation ALWAYS has an
 * active observer to refetch. `listening` reproduces that, with a queryFn the test
 * controls — a refetch that never settles is exactly the shape of Airtable #282.
 */
function TechniquesListener({ queryFn }: { queryFn: () => Promise<unknown[]> }) {
  useQuery({ queryKey: brandTechniquesQueryKey(BRAND), queryFn });
  return null;
}

const renderDialog = (
  nodes: StoreNode[],
  edges: StoreEdge[],
  options: {
    onOpenChange?: (open: boolean) => void;
    listening?: () => Promise<unknown[]>;
    saveTimeoutMs?: number;
  } = {},
) => {
  useStudioStore.setState({ brandId: BRAND, edges, nodes });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {options.listening ? <TechniquesListener queryFn={options.listening} /> : null}
      <SaveTechniqueDialog
        open
        onOpenChange={options.onOpenChange ?? (() => {})}
        brandProfileId={BRAND}
        nodes={nodes}
        {...(options.saveTimeoutMs === undefined ? {} : { saveTimeoutMs: options.saveTimeoutMs })}
      />
    </QueryClientProvider>,
  );
};

const typeNameAndSave = (name: string) => {
  act(() => {
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  });
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Save technique' }));
  });
};

beforeEach(() => {
  createWorkflow.mockClear();
  show.mockClear();
});

afterEach(() => {
  cleanup();
  useStudioStore.setState({ nodes: [], edges: [] });
});

describe('SaveTechniqueDialog', () => {
  it('shows the inferred contract before anything is saved', () => {
    const generator = node('gen', 'nanoGen');
    renderDialog(
      [generator],
      [{ id: 'e1', source: 'outside', target: 'gen', targetHandle: 'ref-image' } as StoreEdge],
    );

    const ports = screen.getByTestId('technique-ports').textContent ?? '';
    expect(ports).toContain('Reference image (image)');
    expect(ports).toContain('Image (image)');
  });

  it('saves the selected subgraph with a validated technique block', async () => {
    const prompt = node('prompt', 'string', 0);
    const generator = node('gen', 'nanoGen', 400);
    renderDialog(
      [prompt, generator],
      [
        { id: 'inside', source: 'prompt', target: 'gen', targetHandle: 'prompt' } as StoreEdge,
        {
          id: 'crossing',
          source: 'outside',
          target: 'gen',
          targetHandle: 'ref-image',
        } as StoreEdge,
      ],
    );

    act(() => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Palette smash-up' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save technique' }));
    });

    await waitFor(() => expect(createWorkflow).toHaveBeenCalledTimes(1));
    const payload = createWorkflow.mock.calls[0]?.[0] as Record<string, never>;
    const saved = payload as unknown as {
      name: string;
      nodes: unknown[];
      edges: unknown[];
      metadata: { technique: { kind: string; inputPorts: unknown[]; outputPorts: unknown[] } };
    };

    expect(saved.name).toBe('Palette smash-up');
    expect(saved.nodes).toHaveLength(2);
    // The boundary edge is NOT persisted — only what is wholly inside travels.
    expect(saved.edges).toHaveLength(1);
    expect(saved.metadata.technique.kind).toBe('generation');
    expect(saved.metadata.technique.inputPorts).toContainEqual(
      expect.objectContaining({ handleId: 'ref-image', dataType: 'image', origin: 'edge' }),
    );
    expect(saved.metadata.technique.outputPorts).toContainEqual(
      expect.objectContaining({ handleId: 'image', dataType: 'image', origin: 'terminal' }),
    );
  });

  it('will not save without a name', () => {
    renderDialog([node('gen', 'nanoGen')], []);

    expect(
      (screen.getByRole('button', { name: 'Save technique' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('says so instead of saving when nothing is selected', () => {
    renderDialog([], []);

    expect(screen.getByText(/Select the nodes you want to reuse/)).toBeTruthy();
    expect(screen.queryByTestId('technique-ports')).toBeNull();
  });

  // Airtable #282. The insert had already landed; the dialog was waiting on the
  // techniques list to come back before it would close, and that list is fetched by
  // a component that lives as long as the canvas does. A refetch that never settles
  // therefore parked the button on "Saving…" with nothing to show for it.
  it('closes as soon as the row is saved, even while the techniques list is still refetching', async () => {
    const onOpenChange = mock(() => {});
    renderDialog([node('gen', 'nanoGen')], [], {
      onOpenChange,
      listening: () => new Promise<unknown[]>(() => {}),
    });

    typeNameAndSave('Palette smash-up');

    await waitFor(() => expect(createWorkflow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull();
  });

  it('shows the error and gives the button back when the save fails', async () => {
    createWorkflow.mockImplementationOnce(async () => {
      throw new Error('Workflow request failed');
    });
    const onOpenChange = mock(() => {});
    renderDialog([node('gen', 'nanoGen')], [], { onOpenChange });

    typeNameAndSave('Palette smash-up');

    await waitFor(() => expect(screen.getByText('Workflow request failed')).toBeTruthy());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save technique' })).toBeTruthy();
  });

  it('stops waiting on a save that never comes back, instead of spinning forever', async () => {
    createWorkflow.mockImplementationOnce(() => new Promise(() => {}));
    renderDialog([node('gen', 'nanoGen')], [], { saveTimeoutMs: 300 });

    typeNameAndSave('Palette smash-up');

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/never came back/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Save technique' })).toBeTruthy();
  });
});
