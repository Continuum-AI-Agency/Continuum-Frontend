// ONE component for all 31 catalog ops. An op is a registry entry in
// `action-registry.ts` plus a runner row in `utils/actions/` — never a React file, and
// never a branch in here. Anything that differs between ops (label, ports, knobs,
// output modality) is read from the registry at render time.

import {
  type ActionId,
  type ActionModality,
  actionDef,
  actionInputPort,
  actionOutputModality,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  isActionId,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { Loader2, Wand2 } from 'lucide-react';
import type React from 'react';
import { useCallback } from 'react';

import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { NodeVideoPreview } from '../../components/NodeVideoPreview';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';
import { useStudioStore } from '../../stores/useStudioStore';
import type { ActionNodeData } from '../../types';
import { configFieldsFor } from '../../utils/actions/actionConfig';
import { isImplementedAction } from '../../utils/actions/runAction';
import { executeWorkflow } from '../../utils/executeWorkflow';
import {
  EDGE_COLOR_BY_MODALITY,
  handleStyle,
  MODALITY_LABEL,
  ModalityPreview,
} from '../modalityPreview';
import { NodeBadge, NodeOverlayNote, NodeTitleBar } from '../NodeChrome';
import { ActionConfigPopover } from './ActionConfigPopover';

export function ActionNode({ id, data, selected }: NodeProps<ReactFlowNode<ActionNodeData>>) {
  const executionControls = useWorkflowExecution();
  const brandId = useStudioStore((state) => state.brandId);
  const roomId = useStudioStore((state) => state.activeRoomId);

  const run = useCallback(async () => {
    await executeWorkflow(executionControls, {
      targetNodeId: id,
      clearDownstream: false,
      brandId,
      roomId,
    });
  }, [brandId, executionControls, id, roomId]);

  const def = actionDef(data.actionId);
  const actionId: ActionId | undefined = isActionId(data.actionId) ? data.actionId : undefined;

  // Handles are DERIVED from the same functions the connection validator consults, so a
  // drawn port can never disagree with an allowed one (studio:handle-parity:bench).
  const graphNode = { id, type: 'action', data: data as Record<string, unknown> };
  const targetHandles = getAllowedTargetHandles(graphNode);
  const sourceHandles = getAllowedSourceHandles(graphNode);
  const outputModality = actionOutputModality(data.actionId);

  const implemented = actionId ? isImplementedAction(actionId) : false;
  const hasConfig = actionId ? configFieldsFor(actionId).length > 0 : false;

  return (
    <div className="relative size-full min-h-[180px] min-w-[200px]">
      <NodeResizer
        minWidth={200}
        minHeight={180}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
      />
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
      >
        <NodeTitleBar
          icon={Wand2}
          label={def?.label ?? 'Pick an operation'}
          title={def?.description}
        >
          {outputModality ? <NodeBadge>{MODALITY_LABEL[outputModality]}</NodeBadge> : null}
          {hasConfig && actionId ? (
            <ActionConfigPopover nodeId={id} actionId={actionId} config={data.config} />
          ) : null}
        </NodeTitleBar>
        {/* The preview IS the body — no inner box, no padding, no rows of chrome. */}
        <NodeContent className="group/preview relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30 p-0">
          {def ? (
            <>
              <ModalityPreview
                modality={outputModality}
                data={data}
                emptyLabel={
                  implemented
                    ? 'Ready to run'
                    : `${def.label} is not available yet — no runner has shipped for it.`
                }
              />
              <Button
                className="nodrag absolute right-1.5 bottom-1.5 z-10 h-6 px-2 text-[11px] opacity-70 transition-opacity group-hover/preview:opacity-100 focus-visible:opacity-100"
                size="sm"
                disabled={!implemented || data.isExecuting}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => void run()}
              >
                {data.isExecuting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                Run
              </Button>
              {data.error ? (
                <NodeOverlayNote tone="destructive">{data.error}</NodeOverlayNote>
              ) : null}
            </>
          ) : (
            <span className="px-3 text-center text-xs text-muted-foreground">
              Choose an operation for this node from the canvas menu.
            </span>
          )}
        </NodeContent>
      </CanvasNode>
      {targetHandles.map((handle, index) => (
        <Handle
          key={handle}
          type="target"
          position={Position.Left}
          id={handle}
          className="studio-handle !size-3"
          style={handleStyle(
            actionInputPort(data.actionId, handle)?.modality,
            targetHandles.length > 1
              ? `${((index + 1) / (targetHandles.length + 1)) * 100}%`
              : undefined,
          )}
        />
      ))}
      {sourceHandles.map((handle) => (
        <Handle
          key={handle}
          type="source"
          position={Position.Right}
          id={handle}
          className="studio-handle !size-3"
          style={handleStyle(outputModality)}
        />
      ))}
    </div>
  );
}
