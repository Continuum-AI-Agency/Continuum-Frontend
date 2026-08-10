import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps, ReactNode } from 'react';
import * as RealToolbar from '@/components/ai-elements/toolbar';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { NanoGenNodeData, StudioNode } from '../types';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// React Flow's NodeToolbar portals into a live <ReactFlow /> renderer, which a bare-node
// render does not have, so the variation switch never reaches the DOM. Substitute a
// toolbar with the SAME visibility contract and no portal — bun's module mocks are
// process-wide, so honouring `isVisible` is what keeps every other node's test (none of
// which makes a toolbar visible) rendering exactly as it did before.
mock.module('@/components/ai-elements/toolbar', () => ({
  ...RealToolbar,
  Toolbar: ({ isVisible, children }: { isVisible?: boolean; children: ReactNode }) =>
    isVisible ? <div>{children}</div> : null,
}));

import { ImageGenBlock } from './ImageGenBlock';

const baseProps: Omit<ComponentProps<typeof ImageGenBlock>, 'data'> = {
  id: 'gen1',
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

const drawnSourceHandleIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('[data-handleid]'))
    .filter((element) => element.getAttribute('data-handlepos') === 'right')
    .map((element) => element.getAttribute('data-handleid') ?? '')
    .filter(Boolean);

const nodeData = (overrides: Partial<NanoGenNodeData> = {}): NanoGenNodeData =>
  ({
    model: 'nano-banana-2',
    positivePrompt: 'a sneaker',
    aspectRatio: '1:1',
    // The variation switch lives on the node toolbar, which only exists while shown.
    isToolbarVisible: true,
    ...overrides,
  }) as NanoGenNodeData;

const fourVariations = [
  { preview: 'blob:1' },
  { preview: 'blob:2' },
  { preview: 'blob:3' },
  { preview: 'blob:4' },
];

const variationEdge = (sourceHandle: string) => ({
  id: `e-${sourceHandle}`,
  source: 'gen1',
  sourceHandle,
  target: 'consumer',
  targetHandle: 'ref-image',
  type: 'dataType',
});

const seedGraph = (data: NanoGenNodeData, handleIds: string[]) => {
  useStudioStore.setState({ nodes: [], edges: [] });
  useStudioStore.getState().setNodes([
    { id: 'gen1', position: { x: 0, y: 0 }, type: 'nanoGen', data },
    {
      id: 'consumer',
      position: { x: 400, y: 0 },
      type: 'nanoGen',
      data: nodeData({ maxReferenceImages: 14 }),
    },
  ] as StudioNode[]);
  useStudioStore.getState().setEdges(handleIds.map(variationEdge));
};

/*
 * Switching a node from 4 variations back to 1 left "a point connected to nowhere"
 * (Airtable #259): the handle count followed `generatedImages.length`, so a finished
 * 4-up run kept drawing four handles, and the collapse RE-POINTED the surviving edges
 * at `image` instead of removing them — two variations then fed one target and
 * normalizeEdges dropped the duplicate silently.
 */
describe('ImageGenBlock variation collapse', () => {
  afterEach(() => {
    useStudioStore.setState({ nodes: [], edges: [] });
    cleanup();
  });

  it('draws one output handle per REQUESTED variation, not per generated image', () => {
    const { container } = renderNode(
      nodeData({ variationCount: 1, generatedImages: fourVariations }),
    );

    expect(drawnSourceHandleIds(container)).toEqual(['image']);
  });

  it('still draws the full set while four are requested', () => {
    const { container } = renderNode(
      nodeData({ variationCount: 4, generatedImages: fourVariations }),
    );

    expect(drawnSourceHandleIds(container)).toEqual(['image', 'image-1', 'image-2', 'image-3']);
  });

  it('removes the edges on the handles it stops drawing, and says how many', () => {
    const data = nodeData({ variationCount: 4, generatedImages: fourVariations });
    seedGraph(data, ['image', 'image-1', 'image-2', 'image-3']);
    expect(useStudioStore.getState().edges).toHaveLength(4);

    const { getByTitle, container } = renderNode(data);
    fireEvent.click(getByTitle('Generate 1 variation'));

    // The surviving edge is the one on the only handle the node still draws.
    expect(useStudioStore.getState().edges.map((edge) => edge.sourceHandle)).toEqual(['image']);
    expect(useStudioStore.getState().nodes[0].data.variationCount).toBe(1);
    expect(document.body.textContent).toContain('Removed 3 connections');
    expect(container.textContent).not.toContain('Removed');
  });

  it('leaves the graph alone when the collapsed variations were never wired', () => {
    const data = nodeData({ variationCount: 4 });
    seedGraph(data, ['image']);

    const { getByTitle } = renderNode(data);
    fireEvent.click(getByTitle('Generate 1 variation'));

    expect(useStudioStore.getState().edges.map((edge) => edge.sourceHandle)).toEqual(['image']);
    expect(document.body.textContent).not.toContain('Removed');
  });

  it('does not touch another node’s variation edges', () => {
    const data = nodeData({ variationCount: 4 });
    seedGraph(data, ['image', 'image-2']);
    useStudioStore
      .getState()
      .setEdges([
        ...useStudioStore.getState().edges,
        { ...variationEdge('image-3'), id: 'e-other', source: 'consumer', target: 'gen1' },
      ]);

    const { getByTitle } = renderNode(data);
    fireEvent.click(getByTitle('Generate 1 variation'));

    expect(
      useStudioStore
        .getState()
        .edges.map((edge) => edge.id)
        .sort(),
    ).toEqual(['e-image', 'e-other']);
  });
});
