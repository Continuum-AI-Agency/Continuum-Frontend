import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type BatchItem, MAX_BATCH_ITEMS } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type Edge, ReactFlowProvider } from '@xyflow/react';

import { useStudioStore } from '../../stores/useStudioStore';
import type { BatchNodeData, StudioNode } from '../../types';
import { BatchNode } from './BatchNode';

const NODE_ID = 'batch-1';

const textItem = (value: string): BatchItem => ({ id: `t-${value}`, kind: 'text', value });
const imageItem = (id: string): BatchItem => ({
  id,
  kind: 'image',
  url: `https://storage/${id}.png`,
  label: id,
});

const renderNode = (
  data: Partial<BatchNodeData> = {},
  upstream: { nodes?: StudioNode[]; edges?: Edge[] } = {},
) => {
  const nodeData: BatchNodeData = {
    items: data.items ?? [],
    itemType: data.itemType ?? null,
    combine: data.combine ?? 'zip',
  };
  useStudioStore.setState({
    brandId: 'brand-1',
    edges: upstream.edges ?? [],
    nodes: [
      { id: NODE_ID, type: 'batch', position: { x: 0, y: 0 }, data: nodeData } as StudioNode,
      ...(upstream.nodes ?? []),
    ],
  });
  return render(
    <ReactFlowProvider>
      <BatchNode
        id={NODE_ID}
        type="batch"
        data={nodeData}
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
    </ReactFlowProvider>,
  );
};

const storedItems = (): BatchItem[] =>
  (useStudioStore.getState().nodes.find((node) => node.id === NODE_ID)?.data.items ??
    []) as BatchItem[];

const pasteCsv = (text: string) => {
  fireEvent.click(screen.getByText('Paste CSV'));
  fireEvent.change(screen.getByTestId('batch-node-csv'), { target: { value: text } });
  fireEvent.click(screen.getByText('Add column 1'));
};

describe('BatchNode', () => {
  beforeEach(() => {
    useStudioStore.setState({ nodes: [], edges: [], brandId: undefined });
  });

  afterEach(() => {
    cleanup();
    useStudioStore.setState({ nodes: [], edges: [] });
  });

  it('refuses a mismatched kind and says so in the node, not only in a toast', () => {
    renderNode({ items: [imageItem('a')], itemType: 'image' });

    pasteCsv('headline one\nheadline two');

    const refusal = screen.getByTestId('batch-node-refusal').textContent ?? '';
    expect(refusal).toContain('This batch holds images');
    expect(refusal).toContain('start a second batch instead');
    // The refusal is not cosmetic: the mismatched rows really did not land.
    expect(storedItems()).toHaveLength(1);
  });

  it('refuses the item past the cap and names the ceiling', () => {
    const full = Array.from({ length: MAX_BATCH_ITEMS }, (_unused, index) =>
      textItem(`row-${index}`),
    );
    renderNode({ items: full, itemType: 'text' });

    pasteCsv('one too many');

    expect(screen.getByTestId('batch-node-refusal').textContent ?? '').toContain(
      `A batch holds at most ${MAX_BATCH_ITEMS} items`,
    );
    expect(storedItems()).toHaveLength(MAX_BATCH_ITEMS);
  });

  it('counts the items against the cap in the header', () => {
    renderNode({ items: [textItem('a'), textItem('b')], itemType: 'text' });

    expect(screen.getByTestId('batch-node-count').textContent).toBe(`2/${MAX_BATCH_ITEMS}`);
    expect(screen.getByTestId('batch-node-kind').textContent).toBe('text');
    expect(screen.getAllByTestId('batch-node-item')).toHaveLength(2);
  });

  it('splits a wired string node into one item per part, and settles there', () => {
    const source = {
      id: 'copy-1',
      type: 'string',
      position: { x: -200, y: 0 },
      data: { value: 'hook one\nhook two\nhook three' },
    } as unknown as StudioNode;

    renderNode(
      {},
      {
        nodes: [source],
        edges: [{ id: 'e1', source: 'copy-1', target: NODE_ID, targetHandle: 'items' } as Edge],
      },
    );

    // Every synced row is keyed by its source edge, which is what stops the effect from
    // re-adding the same three parts on the re-render its own write causes.
    expect(storedItems().map((item) => item.value)).toEqual(['hook one', 'hook two', 'hook three']);
    expect(storedItems().map((item) => item.id)).toEqual([
      'edge:copy-1:0',
      'edge:copy-1:1',
      'edge:copy-1:2',
    ]);
  });

  it('reads the first CSV column only, quoted commas included', () => {
    renderNode();

    pasteCsv('"Run, then walk",ignored\nsecond,also ignored\n');

    expect(storedItems().map((item) => item.value)).toEqual(['Run, then walk', 'second']);
    expect(screen.queryByTestId('batch-node-refusal')).toBeNull();
  });
});
