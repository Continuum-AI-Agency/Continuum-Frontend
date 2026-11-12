import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PUBLISH_IMAGE_INPUT_HANDLE } from '@continuum/contracts';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@/components/library/__tests__/renderWithCreativeI18n';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { PaidPublisherBlock } from './PublishingBlock';
import { publishingApi } from './publish/publishingApi';

// The paid node previews and confirms from the same button, so a double-click used to
// mint the preview token on click one and swap the live Meta creative on click two.

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

const publisherData = {
  format: 'image' as const,
  assetSlots: [],
  adAccountId: 'act_1',
  campaignId: 'cmp_1',
  adsetId: 'as_1',
  targetAdId: 'ad_1',
  expectedCreativeId: 'cr_1',
};

function LivePublisher() {
  const node = useStudioStore((state) => state.nodes.find((candidate) => candidate.id === 'pub1'));
  return <PaidPublisherBlock {...baseProps} data={(node?.data ?? publisherData) as never} />;
}

const original = { ...publishingApi };
const replacePaid = mock(async (input: { mode: 'preview' | 'confirm' }) =>
  input.mode === 'preview'
    ? {
        mode: 'preview' as const,
        confirmToken: 'tok-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        requiresApproval: true,
      }
    : {
        mode: 'confirm' as const,
        replacementId: 'rep-1',
        adId: 'ad_1',
        previousCreativeId: 'cr_1',
        creativeId: 'cr_2',
        appliedAt: '2026-11-10T00:00:00.000Z',
      },
);

describe('PaidPublisherBlock confirm', () => {
  beforeEach(() => {
    replacePaid.mockClear();
    publishingApi.replacePaid = replacePaid as never;
    publishingApi.searchPaid = (async () => ({ adAccountId: 'act_1', items: [] })) as never;
    useStudioStore.setState({
      brandId: 'brand-1',
      nodes: [
        { id: 'img1', type: 'image', position: { x: 0, y: 0 }, data: { assetId: 'asset-1' } },
        { id: 'pub1', type: 'paidPublisher', position: { x: 0, y: 0 }, data: publisherData },
      ] as unknown as StudioNode[],
      edges: [
        { id: 'e1', source: 'img1', target: 'pub1', targetHandle: PUBLISH_IMAGE_INPUT_HANDLE },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    Object.assign(publishingApi, original);
  });

  it('treats a double-click as one preview, and confirms only on a separate click', async () => {
    render(
      <ToastProvider>
        <ReactFlowProvider>
          <LivePublisher />
        </ReactFlowProvider>
      </ToastProvider>,
    );

    const button = () => screen.getByRole('button', { name: /replacement/ });
    fireEvent.click(button(), { detail: 1 });
    await waitFor(() => expect(button().textContent).toContain('Confirm replacement'));
    fireEvent.click(button(), { detail: 2 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(replacePaid.mock.calls.map(([input]) => input.mode)).toEqual(['preview']);

    fireEvent.click(button(), { detail: 1 });
    await waitFor(() => expect(replacePaid).toHaveBeenCalledTimes(2));
    expect(replacePaid.mock.calls[1]?.[0].mode).toBe('confirm');
  });
});
