'use client';
import type { NodeProps, Node as ReactFlowNode } from '@xyflow/react';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudioStore } from '../stores/useStudioStore';
import type { PublisherNodeData } from '../types';
import { ImplementationNode } from './ImplementationNode';
export function PaidPublisherBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<PublisherNodeData>>) {
  const inputs =
    data.format === 'carousel'
      ? [...(data.assetSlots ?? [])]
          .sort((a, b) => a.order - b.order)
          .map((slot, index) => ({ id: `asset-${slot.id}`, label: `Card ${index + 1}` }))
      : [
          {
            id: data.format === 'video' ? 'video-in' : 'image-in',
            label: data.format === 'video' ? 'Video' : 'Image',
          },
        ];
  return (
    <ImplementationNode
      id={id}
      selected={selected}
      title="Paid Ad"
      icon={Megaphone}
      summary={data.targetAdName ?? 'Choose a campaign, ad set and ad'}
      status={
        data.publishedAt
          ? 'Creative replaced · previous creative retained for restore'
          : data.targetAdId
            ? 'Ready for replacement review · workflow never applies automatically'
            : 'Configure a Meta ad to replace its creative'
      }
      error={data.error}
      inputs={inputs}
    >
      <Button
        size="sm"
        className="ml-auto"
        onClick={() => {
          const store = useStudioStore.getState();
          store.setNodes(store.nodes.map((node) => ({ ...node, selected: node.id === id })));
        }}
      >
        Review creative
      </Button>
    </ImplementationNode>
  );
}
