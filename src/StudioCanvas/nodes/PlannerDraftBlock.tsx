'use client';
import { DRAFT_OUTPUT_HANDLE, PLANNER_DRAFT_TEXT_INPUT_HANDLE } from '@continuum/contracts';
import type { NodeProps, Node as ReactFlowNode } from '@xyflow/react';
import { CalendarRange, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudioStore } from '../stores/useStudioStore';
import type { PlannerDraftNodeData } from '../types';
import { runImplementationNode } from '../utils/runImplementationNode';
import { ImplementationNode } from './ImplementationNode';
import { mediaInputHandles } from './PlannerDraftSettings';

export { mediaInputHandles, upstreamCaption } from './PlannerDraftSettings';

export function PlannerDraftBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<PlannerDraftNodeData>>) {
  const busy = useStudioStore((state) =>
    Boolean(state.nodes.find((node) => node.id === id)?.data.isExecuting),
  );
  return (
    <ImplementationNode
      id={id}
      selected={selected}
      title="Planner Draft"
      icon={CalendarRange}
      summary={
        data.targetTitle ??
        (data.targetDraftId ? 'Saved Planner draft' : 'Choose a draft or create one')
      }
      status={
        busy
          ? 'Saving to Planner…'
          : data.savedAt
            ? 'Saved · ready for publishing review'
            : `${data.platform ?? 'No platform'} · ${data.format ?? 'image'} · saves during workflow run`
      }
      error={data.error}
      inputs={[
        { id: PLANNER_DRAFT_TEXT_INPUT_HANDLE, label: 'Caption' },
        ...mediaInputHandles(data),
      ]}
      outputs={[{ id: DRAFT_OUTPUT_HANDLE, label: 'Saved draft' }]}
    >
      <Button
        size="sm"
        className="ml-auto"
        disabled={busy || !(data.targetDraftId || (data.platform && data.platformAccountId))}
        onClick={() => void runImplementationNode(id).catch(() => undefined)}
      >
        <Save className="size-3.5" aria-hidden /> {busy ? 'Saving…' : 'Save draft'}
      </Button>
    </ImplementationNode>
  );
}
