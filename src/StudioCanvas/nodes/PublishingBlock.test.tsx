import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import { OrganicPublishBlock } from './OrganicPublishBlock';
import { PaidPublisherBlock } from './PublishingBlock';

// Publisher nodes are terminal delivery handoffs — a canvas run never executes
// them. The node must SAY so (never look like a runnable step) and flip to a
// delivered state once the handoff completes.

const baseProps: Omit<ComponentProps<typeof PaidPublisherBlock>, 'data'> = {
  id: 'pub1',
  selected: false,
  type: 'paidPublisher',
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

  it('declares the organic publish node never posts from a run', () => {
    const { getByTestId } = renderNode(
      <OrganicPublishBlock {...baseProps} type="organicPublish" data={{}} />,
    );
    expect(getByTestId('publisher-handoff-state').textContent).toContain(
      'A canvas run never publishes',
    );
  });

  it('refuses to publish until a saved draft is wired in', () => {
    const { getByRole, getByText } = renderNode(
      <OrganicPublishBlock {...baseProps} type="organicPublish" data={{}} />,
    );
    expect(getByText('Wire a Planner Draft into this node.')).toBeTruthy();
    expect((getByRole('button', { name: /Post now/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports the live post once it is published', () => {
    const { getByTestId } = renderNode(
      <OrganicPublishBlock
        {...baseProps}
        type="organicPublish"
        data={{ publishedAt: '2026-08-17T00:00:00.000Z', platformPostId: 'ig-42' }}
      />,
    );
    expect(getByTestId('publisher-handoff-state').textContent).toContain('Published');
    expect(getByTestId('publisher-handoff-state').textContent).toContain('ig-42');
  });

  it('flips the paid node to a delivered state after a creative replacement', () => {
    const { getByTestId } = renderNode(
      <PaidPublisherBlock
        {...baseProps}
        data={{ format: 'image', assetSlots: [], publishedAt: '2026-07-24T00:00:00.000Z' }}
      />,
    );
    expect(getByTestId('publisher-handoff-state').textContent).toContain('ad creative replaced');
  });
});
