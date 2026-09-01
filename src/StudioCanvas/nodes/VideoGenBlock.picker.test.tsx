import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { VideoGenNodeData } from '../types';
import { VideoGenBlock } from './VideoGenBlock';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const baseProps: Omit<ComponentProps<typeof VideoGenBlock>, 'data'> = {
  id: 'vid1',
  selected: false,
  type: 'videoGen',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const renderNode = (data: VideoGenNodeData) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <VideoGenBlock {...baseProps} data={data} />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

const byText = (selector: string, text: string): HTMLElement => {
  const match = Array.from(document.querySelectorAll(selector)).find((node) =>
    node.textContent?.startsWith(text),
  );
  if (!match) throw new Error(`no ${selector} starting with "${text}"`);
  return match as HTMLElement;
};

/** Right-click the node, then open its Model submenu — the picker under test. */
const openModelPicker = async (data: VideoGenNodeData) => {
  renderNode(data);
  await act(async () => {
    fireEvent.contextMenu(document.querySelector('[data-testid="studio-node-preview"]') as Element);
  });
  await act(async () => {
    fireEvent.click(byText('[role="menuitem"]', 'Model'));
  });
};

const modelItem = (label: string): HTMLElement => byText('[role="menuitemcheckbox"]', label);

/*
 * Airtable #293, the fourth filing of this theme after #139 and #248. The video list
 * showed provider and nothing else — "Kling Omni · Fal", "Pixverse V6 · Fal" — while the
 * image picker one node over already said "FLUX.2 Pro — Needs fal credits". Picking a Fal
 * model that is out of reach turned the node red after the generation was attempted.
 */
describe('#293 VideoGenBlock model picker', () => {
  const nodeData = (overrides: Partial<VideoGenNodeData> = {}): VideoGenNodeData =>
    ({
      model: 'veo-3.1-fast',
      prompt: 'a bottle on a counter',
      ...overrides,
    }) as VideoGenNodeData;

  // `useStudioStore` is a module singleton shared across every test file in the process,
  // so a mocked action has to be put back or it leaks into the next file.
  let originalUpdateNode: unknown;

  beforeEach(() => {
    originalUpdateNode = useStudioStore.getState().updateNode;
  });

  afterEach(() => {
    useStudioStore.setState({
      brandId: undefined,
      nodes: [],
      edges: [],
      updateNode: originalUpdateNode as never,
    });
    cleanup();
  });

  it('greys out the Fal models and says they are returning soon', async () => {
    await openModelPicker(nodeData());

    for (const label of ['Kling Omni', 'Pixverse V6', 'Seedance 2.0']) {
      const item = modelItem(label);
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(item.textContent).toContain('Returning soon');
    }
  });

  it('cannot select a model that is returning soon', async () => {
    // The picker is the last line of defence here: the backend is unchanged, so a click
    // that got through would reach it and come back as a failed generation.
    const updateNode = mock();
    useStudioStore.setState({ updateNode });

    await openModelPicker(nodeData());
    await act(async () => {
      fireEvent.click(modelItem('Kling Omni'));
    });
    expect(updateNode).not.toHaveBeenCalled();

    // Positive control: the same click on a reachable model DOES write.
    await act(async () => {
      fireEvent.click(modelItem('Veo 3.1'));
    });
    expect(updateNode).toHaveBeenCalled();
  });

  it('leaves every reachable model selectable and unannotated', async () => {
    await openModelPicker(nodeData());

    for (const label of ['Veo 3.1', 'Veo 3.1 Fast', 'Veo 3.1 Lite']) {
      const item = modelItem(label);
      expect(item.getAttribute('aria-disabled')).not.toBe('true');
      expect(item.textContent).not.toContain('Returning soon');
    }
  });

  it('checks the selected model, including one selected only by default', async () => {
    await openModelPicker(nodeData({ model: 'veo-3.1' }));
    expect(modelItem('Veo 3.1 Fast').getAttribute('aria-checked')).toBe('false');

    cleanup();
    await openModelPicker({ prompt: 'a bottle on a counter' } as VideoGenNodeData);
    expect(modelItem('Veo 3.1 Fast').getAttribute('aria-checked')).toBe('true');
  });
});
