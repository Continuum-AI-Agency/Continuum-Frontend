// The generic node has to be right for ops it has never heard of, so every assertion
// here is read from the registry rather than hard-coded alongside it.

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import {
  ACTION_IDS,
  type ActionId,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
} from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../../stores/useStudioStore';
import type { ActionNodeData } from '../../types';
import * as runActionModule from '../../utils/actions/runAction';
import { ActionNode } from './ActionNode';

const updateNode = mock();
const triggerSave = mock();

function nodeData(overrides: Partial<ActionNodeData> = {}): ActionNodeData {
  return { actionId: null, config: {}, ...overrides };
}

function renderNode(data: ActionNodeData) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>
        <ActionNode
          id="action-1"
          type="action"
          data={data}
          selected={false}
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable
          selectable
          deletable
        />
      </ReactFlowProvider>
    </ToastProvider>,
  );
}

const handleIds = (container: HTMLElement, position: 'left' | 'right') =>
  Array.from(container.querySelectorAll('[data-handleid]'))
    .filter((element) => element.getAttribute('data-handlepos') === position)
    .map((element) => element.getAttribute('data-handleid') ?? '');

describe('ActionNode', () => {
  beforeEach(() => {
    useStudioStore.setState({ nodes: [], edges: [], updateNode, triggerSave });
    updateNode.mockClear();
    triggerSave.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the registry's label for the op it is set to", () => {
    const { getByText } = renderNode(nodeData({ actionId: 'image.rotate' }));

    expect(getByText('Rotate')).toBeDefined();
    expect(getByText('Image')).toBeDefined();
  });

  it('renders an inert pick-an-operation state, with no handles, when no op is set', () => {
    const { container, getByText, queryByRole } = renderNode(nodeData());

    expect(getByText('Pick an operation')).toBeDefined();
    expect(queryByRole('button', { name: /run/i })).toBeNull();
    expect(container.querySelectorAll('[data-handleid]').length).toBe(0);
  });

  it('previews a text op as text and never as an image', () => {
    // The guard: `action`'s registry entry says producesMedia for every op, so a preview
    // keyed off the node type renders this string as a broken <img>.
    const { container, getByText } = renderNode(
      nodeData({ actionId: 'text.findReplace', value: 'hello replaced world' }),
    );

    expect(getByText('hello replaced world')).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
  });

  it('previews an image op as an image', () => {
    const { container } = renderNode(
      nodeData({ actionId: 'image.rotate', generatedImage: 'data:image/png;base64,abc' }),
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,abc');
  });

  it('disables Run for an op that has no runner, and names it', () => {
    // Every catalog op has a runner as of Wave 3, so the unimplemented state has to be
    // forced. A spy on the live export is scoped and restorable, where mock.module
    // would leak the stub process-wide into sibling test files.
    const spy = spyOn(runActionModule, 'isImplementedAction').mockReturnValue(false);
    try {
      const { getByRole, getByText } = renderNode(nodeData({ actionId: 'image.blur' }));

      expect((getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(true);
      expect(getByText(/^Blur is not available yet/)).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('has a runner for every catalog op, so no real id renders the disabled state', () => {
    // The Wave-3 landing implemented the whole catalog; a real id regressing to
    // unimplemented should fail loudly here rather than silently greying a node.
    const unimplemented = ACTION_IDS.filter((id) => !runActionModule.isImplementedAction(id));
    expect(unimplemented).toEqual([]);
  });

  it('leaves Run enabled for an op that has a runner', () => {
    const { getByRole } = renderNode(nodeData({ actionId: 'image.rotate' }));

    expect((getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('draws exactly the handles the graph contract allows, for every op family', () => {
    for (const actionId of ['image.rotate', 'video.overlay', 'text.concat'] as ActionId[]) {
      const data = nodeData({ actionId });
      const { container } = renderNode(data);
      const graphNode = { id: 'action-1', type: 'action', data: data as Record<string, unknown> };

      expect(handleIds(container, 'left')).toEqual(getAllowedTargetHandles(graphNode));
      expect(handleIds(container, 'right')).toEqual(getAllowedSourceHandles(graphNode));
      cleanup();
    }
  });
});
