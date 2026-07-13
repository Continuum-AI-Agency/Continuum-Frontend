// The store is driven for real here rather than mock.module'd. bun's mock.module
// is process-wide: replacing useStudioStore with a bare selector stub stripped
// setState/getState off the module for every spec that ran afterwards in the
// same process, which is exactly how a passing suite hides a broken one.
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { useNodeTitler } from './useNodeTitler';

const mockInvoke = mock(async () => ({ data: { title: 'Ocean Dawn Haiku' }, error: null }));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke: mockInvoke } }),
}));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function seedNode() {
  const node = {
    id: 'n1',
    type: 'string',
    position: { x: 0, y: 0 },
    data: { label: 'Untitled' },
  } as unknown as StudioNode;
  useStudioStore.setState({ nodes: [node], edges: [], saveTrigger: 0 });
}

const nodeLabel = () => useStudioStore.getState().nodes[0]?.data.label;
const saveTrigger = () => useStudioStore.getState().saveTrigger;

beforeEach(() => {
  mockInvoke.mockClear();
  seedNode();
});

afterEach(() => cleanup());

describe('useNodeTitler', () => {
  it('does not request a title while the node is executing', async () => {
    renderHook(() =>
      useNodeTitler({ id: 'n1', value: 'Write a haiku about the ocean', isExecuting: true }),
    );
    await act(async () => {
      await wait(1200);
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('does not request a title for prompts shorter than the minimum', async () => {
    renderHook(() => useNodeTitler({ id: 'n1', value: 'hi there', isExecuting: false }));
    await act(async () => {
      await wait(1200);
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('invokes the edge function once the prompt settles and writes the title to the node label', async () => {
    const prompt = 'Write a haiku about the ocean at dawn';
    renderHook(() => useNodeTitler({ id: 'n1', value: prompt, isExecuting: false }));
    await act(async () => {
      await wait(1200);
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][0]).toBe('prompt-title');
    expect(mockInvoke.mock.calls[0][1]).toMatchObject({ body: { prompt } });
    expect(nodeLabel()).toBe('Ocean Dawn Haiku');
    expect(saveTrigger()).toBe(1);
  });
});
