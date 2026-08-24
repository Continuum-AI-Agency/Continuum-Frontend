import { afterEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { NanoGenNodeData } from '../types';
import { ImageGenBlock } from './ImageGenBlock';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const baseProps: Omit<ComponentProps<typeof ImageGenBlock>, 'data'> = {
  id: 'img1',
  selected: false,
  type: 'nanoGen',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const renderNode = (data: NanoGenNodeData) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <ImageGenBlock {...baseProps} data={data} />
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
const openModelPicker = async (data: NanoGenNodeData) => {
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
 * The picker used to be hardcoded JSX: every model always clickable, no notion of
 * whether the workspace could reach it. Picking FLUX.2 Max on a workspace without fal
 * credits turned the node red with "Generation failed — Forbidden" (Airtable #248).
 */
describe('ImageGenBlock model picker', () => {
  const nodeData = (overrides: Partial<NanoGenNodeData> = {}): NanoGenNodeData =>
    ({
      model: 'nano-banana-2',
      positivePrompt: 'a sneaker',
      aspectRatio: '1:1',
      ...overrides,
    }) as NanoGenNodeData;

  afterEach(() => {
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
    cleanup();
  });

  it('says what the fal tier needs instead of letting it fail opaquely', async () => {
    await openModelPicker(nodeData());

    expect(modelItem('FLUX.2 Max').textContent).toContain('Needs fal credits');
    // GPT Image 2 is an Azure model (contracts image-size.ts pins its note to 'Azure');
    // only the flux tier carries the fal note. Asserting fal copy here was the bug.
    expect(modelItem('GPT Image 2').textContent).toContain('Azure');
  });

  it('states the size ceiling of a one-size model up front, not at the 400', async () => {
    await openModelPicker(nodeData());

    expect(modelItem('Nano Banana 2 Lite').textContent).toContain('1K only');
    expect(modelItem('Nano Banana').textContent).toContain('1024px only');
  });

  it('checks the selected model on every item, including one selected only by default', async () => {
    await openModelPicker(nodeData({ model: 'flux-2-pro' }));
    expect(modelItem('FLUX.2 Pro').getAttribute('aria-checked')).toBe('true');
    // Half the items used to read `data.model` and half the defaulted `model`, so a node
    // born on the default showed nothing checked at all.
    for (const other of ['Nano Banana', 'Nano Banana 2 Lite', 'GPT Image 2', 'FLUX.2 Max']) {
      expect(modelItem(other).getAttribute('aria-checked')).toBe('false');
    }

    cleanup();
    await openModelPicker({ positivePrompt: 'a sneaker' } as NanoGenNodeData);
    expect(modelItem('Nano Banana 2 Lite').getAttribute('aria-checked')).toBe('true');
  });

  it('greys the model out for the session once a run comes back model_unavailable', async () => {
    await openModelPicker(nodeData());
    expect(modelItem('FLUX.2 Max').getAttribute('aria-disabled')).not.toBe('true');
    cleanup();

    // The refused run. The node records the refusal as it renders its error panel.
    renderNode(
      nodeData({
        model: 'flux-2-max',
        error: 'FLUX.2 Max is not enabled on this workspace.',
        errorCode: 'model_unavailable',
      }),
    );
    cleanup();

    await openModelPicker(nodeData());
    const refused = modelItem('FLUX.2 Max');
    expect(refused.getAttribute('aria-disabled')).toBe('true');
    expect(refused.textContent).toContain('Not enabled on this workspace');
    // A refusal of one fal model must not disable the rest of the picker.
    expect(modelItem('Nano Banana 2').getAttribute('aria-disabled')).not.toBe('true');
  });
});
