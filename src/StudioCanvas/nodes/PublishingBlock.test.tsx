import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import { OrganicPublisherBlock, PaidPublisherBlock } from './PublishingBlock';

// Publisher nodes are terminal delivery handoffs — a canvas run never executes
// them. The node must SAY so (never look like a runnable step) and flip to a
// delivered state once the handoff completes.

const baseProps: Omit<ComponentProps<typeof OrganicPublisherBlock>, 'data'> = {
  id: 'pub1',
  selected: false,
  type: 'organicPublisher',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

function renderNode(node: React.ReactElement) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>{node}</ReactFlowProvider>
    </ToastProvider>,
  );
}

describe('PublisherBlock delivery-handoff state', () => {
  beforeEach(() => {
    // brandId undefined ⇒ the target-search effect no-ops (no network in tests).
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  // bun:test does not register testing-library's auto-cleanup, so without this
  // each render stacked in the same document and getByTestId found two nodes.
  afterEach(cleanup);

  it('declares the organic node is a delivery handoff before anything is delivered', () => {
    const { getByTestId } = renderNode(
      <OrganicPublisherBlock {...baseProps} data={{ format: 'image', assetSlots: [] }} />,
    );
    expect(getByTestId('publisher-handoff-state').textContent).toContain('Delivery handoff');
    expect(getByTestId('publisher-handoff-state').textContent).toContain(
      'a canvas run never publishes',
    );
  });

  it('flips the organic node to a delivered state after attachment', () => {
    const { getByTestId } = renderNode(
      <OrganicPublisherBlock
        {...baseProps}
        data={{ format: 'image', assetSlots: [], publishedAt: '2026-07-24T00:00:00.000Z' }}
      />,
    );
    expect(getByTestId('publisher-handoff-state').textContent).toContain('attached to the draft');
  });

  it('flips the paid node to a delivered state after a creative replacement', () => {
    const { getByTestId } = renderNode(
      <PaidPublisherBlock
        {...baseProps}
        type="paidPublisher"
        data={{ format: 'image', assetSlots: [], publishedAt: '2026-07-24T00:00:00.000Z' }}
      />,
    );
    expect(getByTestId('publisher-handoff-state').textContent).toContain('ad creative replaced');
  });
});
