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
    <div className="relative size-full min-h-[220px] min-w-[280px]">
      <NodeResizer
        minWidth={280}
        minHeight={220}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
      />
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
      >
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
          <Wand2 className="size-3.5 shrink-0" />
          <span className="truncate">{def?.label ?? 'Pick an operation'}</span>
          {outputModality ? (
            <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {MODALITY_LABEL[outputModality]}
            </span>
          ) : null}
        </div>
        <NodeContent className="flex h-full flex-col gap-2 p-2">
          {def ? null : (
            <p className="text-xs text-muted-foreground">
              Choose an operation for this node from the canvas menu.
            </p>
          )}
          {def ? (
            <>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
                  {def.description}
                </p>
                {hasConfig && actionId ? (
                  <ActionConfigPopover nodeId={id} actionId={actionId} config={data.config} />
                ) : null}
              </div>
              <div className="flex min-h-24 flex-1 items-center justify-center overflow-hidden rounded border bg-black/90">
                <ModalityPreview
                  modality={outputModality}
                  data={data}
                  emptyLabel={implemented ? 'Ready to run' : 'Not available yet'}
                />
              </div>
              {implemented ? null : (
                <p className="text-xs text-muted-foreground">
                  {def.label} is not available yet — no runner has shipped for it.
                </p>
              )}
              {data.error ? <p className="text-xs text-destructive">{data.error}</p> : null}
              <Button
                className="nodrag h-8"
                size="sm"
                disabled={!implemented || data.isExecuting}
                onClick={() => void run()}
              >
                {data.isExecuting ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                Run
              </Button>
            </>
          ) : null}
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
