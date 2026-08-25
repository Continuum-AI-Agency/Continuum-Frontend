import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { CanvasTechniquePort } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

import { ToastProvider } from '@/components/ui/ToastProvider';
import { useModuleFoldStore } from '../stores/useModuleFoldStore';
import { COLLAPSED_NODE_TYPE, type CollapsedModuleData } from '../utils/moduleFold';
import { FOLD_NODE_TYPES, TechniqueNode } from './TechniqueNode';

const MODULE_ID = 'module:aaa';

const port = (
  id: string,
  handleId: string,
  dataType: CanvasTechniquePort['dataType'],
  origin: CanvasTechniquePort['origin'],
  label?: string,
): CanvasTechniquePort => ({ id, nodeRef: `${MODULE_ID}:g`, handleId, dataType, origin, label });

const data: CollapsedModuleData = {
  moduleId: MODULE_ID,
  label: 'Palette smash-up',
  memberCount: 4,
  inputPorts: [
    port('in-1', 'prompt', 'text', 'open', 'Prompt'),
    port('in-2', 'ref-image', 'image', 'edge', 'Reference image'),
  ],
  outputPorts: [port('out-1', 'image', 'image', 'terminal', 'Image')],
};

function renderNode(overrides: Partial<CollapsedModuleData> = {}) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>
        <TechniqueNode
          id={`collapsed-module:${MODULE_ID}`}
          type={COLLAPSED_NODE_TYPE}
          data={{ ...data, ...overrides }}
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

describe('TechniqueNode', () => {
  beforeEach(() => {
    useModuleFoldStore.getState().reset();
  });

  afterEach(cleanup);

  it('names the technique and how much it is hiding', () => {
    const { getByText, getByTestId } = renderNode();

    expect(getByText('Palette smash-up')).toBeDefined();
    expect(getByText('4 nodes folded')).toBeDefined();
    expect(getByTestId('technique-node').getAttribute('data-module-id')).toBe(MODULE_ID);
  });

  it('singularises a one-node module', () => {
    const { getByText } = renderNode({ memberCount: 1 });

    expect(getByText('1 node folded')).toBeDefined();
  });

  it('draws one handle per derived port, keyed by port id', () => {
    // The port id IS the handle id: `foldCollapsedModules` re-anchors boundary edges
    // onto exactly these, and a missing handle is an edge React Flow silently drops.
    const { container } = renderNode();

    expect(handleIds(container, 'left')).toEqual(['in-1', 'in-2']);
    expect(handleIds(container, 'right')).toEqual(['out-1']);
  });

  it('draws a handle for every port even past the labelled dozen', () => {
    const many = Array.from({ length: 15 }, (_, index) =>
      port(`in-x${index}`, `slot-${index}`, 'image', 'edge'),
    );

    const { container } = renderNode({ inputPorts: many });

    expect(handleIds(container, 'left')).toHaveLength(15);
  });

  it('expands the module it stands for', () => {
    useModuleFoldStore.getState().collapseModule(MODULE_ID);
    const { getByTestId } = renderNode();

    fireEvent.click(getByTestId('technique-node-expand'));

    expect(useModuleFoldStore.getState().collapsedModuleIds).toEqual([]);
  });

  it('registers under the view type, never as a StudioNodeType', () => {
    expect(Object.keys(FOLD_NODE_TYPES)).toEqual([COLLAPSED_NODE_TYPE]);
    expect(FOLD_NODE_TYPES[COLLAPSED_NODE_TYPE]).toBe(TechniqueNode);
  });
});
