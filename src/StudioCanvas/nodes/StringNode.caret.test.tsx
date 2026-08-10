import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { StringNode } from './StringNode';

// Ticket #262 — every keystroke threw the caret to the end of the Text Block, so
// the middle of a prompt could not be edited at all.
//
// The cause is a timing seam, not a bad handler: `data` reaches a node through
// React Flow's INTERNAL store, which the `nodes` prop only refreshes inside a
// passive effect (StoreUpdater). StringNode also subscribes to the whole
// `useStudioStore` nodes array (for inherited grounding), so a keystroke
// re-rendered it SYNCHRONOUSLY with the still-stale `data.value` while the DOM
// already held the new text. React rewrote the DOM value to the stale string,
// then rewrote it again when the effect landed — and a programmatic value
// assignment collapses the caret to the end.
//
// These tests drive the real StringNode inside a real ReactFlow so that seam is
// exercised rather than simulated.

(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: { invoke: async () => ({ data: null, error: new Error('offline in test') }) },
  }),
}));

const nodeTypes = { string: StringNode };

const seedNode = (value: string): StudioNode =>
  ({
    id: 'n1',
    type: 'string',
    position: { x: 0, y: 0 },
    data: { value },
  }) as unknown as StudioNode;

function Canvas() {
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <div style={{ width: 800, height: 600 }}>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
          </div>
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const mountCanvas = async (value: string) => {
  useStudioStore.setState({ brandId: undefined, nodes: [seedNode(value)], edges: [] });
  const utils = render(<Canvas />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const textarea = utils.getByTestId('studio-string-node-textarea') as HTMLTextAreaElement;
  textarea.focus();
  fireEvent.focus(textarea);
  return { ...utils, textarea };
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

const typeAt = async (textarea: HTMLTextAreaElement, caret: number, char: string) => {
  const next = `${textarea.value.slice(0, caret)}${char}${textarea.value.slice(caret)}`;
  textarea.selectionStart = caret;
  textarea.selectionEnd = caret;
  await act(async () => {
    fireEvent.change(textarea, {
      target: { value: next, selectionStart: caret + 1, selectionEnd: caret + 1 },
    });
  });
};

describe('StringNode mid-prompt editing (#262)', () => {
  beforeEach(() => {
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  afterEach(cleanup);

  it('keeps the caret where the user typed instead of jumping to the end', async () => {
    const { textarea } = await mountCanvas('HELLO WORLD');

    await typeAt(textarea, 5, 'X');

    expect(textarea.value).toBe('HELLOX WORLD');
    expect(textarea.selectionStart).toBe(6);

    // The React Flow store catches up one passive-effect tick later; the caret
    // must survive that second render too.
    await settle();
    expect(textarea.value).toBe('HELLOX WORLD');
    expect(textarea.selectionStart).toBe(6);
  });

  it('survives several consecutive keystrokes in the middle of the text', async () => {
    const { textarea } = await mountCanvas('HELLO WORLD');

    await typeAt(textarea, 5, 'A');
    await typeAt(textarea, 6, 'B');
    await typeAt(textarea, 7, 'C');
    await settle();

    expect(textarea.value).toBe('HELLOABC WORLD');
    expect(textarea.selectionStart).toBe(8);
    expect((useStudioStore.getState().nodes[0].data as { value: string }).value).toBe(
      'HELLOABC WORLD',
    );
  });

  it('does not let a remote snapshot clobber the box the user is typing in', async () => {
    const { textarea } = await mountCanvas('HELLO WORLD');

    await typeAt(textarea, 5, 'X');

    // A realtime merge lands mid-edit with a peer's older text.
    await act(async () => {
      useStudioStore.getState().setNodes([seedNode('SOMEONE ELSE TEXT')]);
    });
    await settle();

    expect(textarea.value).toBe('HELLOX WORLD');
    expect(textarea.selectionStart).toBe(6);
  });

  it('re-asserts the typed text into the store when the box loses focus', async () => {
    const { textarea } = await mountCanvas('HELLO WORLD');

    await typeAt(textarea, 5, 'X');
    await act(async () => {
      useStudioStore.getState().setNodes([seedNode('SOMEONE ELSE TEXT')]);
    });
    await act(async () => {
      fireEvent.blur(textarea);
    });
    await settle();

    expect((useStudioStore.getState().nodes[0].data as { value: string }).value).toBe(
      'HELLOX WORLD',
    );
  });

  it('mirrors external writes (enrichment stream) while the box is not focused', async () => {
    const { textarea } = await mountCanvas('HELLO WORLD');
    await act(async () => {
      fireEvent.blur(textarea);
    });

    await act(async () => {
      useStudioStore.getState().updateNodeData('n1', { value: 'ENRICHED PROMPT' });
    });
    await settle();

    expect(textarea.value).toBe('ENRICHED PROMPT');
  });
});
