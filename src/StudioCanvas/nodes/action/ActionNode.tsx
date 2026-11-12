import { workflowNodeError } from '../../utils/workflowUiFailure';
// ONE component for all 31 catalog ops. An op is a registry entry in
// `action-registry.ts` plus a runner row in `utils/actions/` — never a React file, and
// never a branch in here. Anything that differs between ops (label, ports, knobs,
// output modality) is read from the registry at render time.

import {
  type ActionId,
  actionDef,
  actionInputPort,
  actionOutputModality,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  isActionId,
  STUDIO_NODE_REGISTRY,
  type StudioNodeType,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { ChevronDown, ChevronUp, Loader2, Wand2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { useStudioMetadata } from '../../hooks/useStudioMetadata';
import { useWorkflowExecution } from '../../hooks/useWorkflowExecution';
import { useStudioStore } from '../../stores/useStudioStore';
import type { ActionNodeData } from '../../types';
import { configFieldsFor } from '../../utils/actions/actionConfig';
import { isImplementedAction } from '../../utils/actions/runAction';
import { executeWorkflow } from '../../utils/executeWorkflow';
import { handleStyle, MODALITY_LABEL, ModalityPreview } from '../modalityPreview';
import { NodeBadge, NodeOverlayNote, NodeTitleBar } from '../NodeChrome';
import { NodeDownloadButton } from '../NodeDownloadButton';
import { ActionBrandNote } from './ActionBrandNote';
import { ActionConfigPopover } from './ActionConfigPopover';

const sourceLabel = (
  node: { type?: string; data?: unknown } | undefined,
  metadata: (source: string) => string,
): string => {
  const nodeData = (node?.data ?? {}) as Record<string, unknown>;
  if (typeof nodeData.label === 'string' && nodeData.label.trim()) return nodeData.label.trim();
  if (typeof nodeData.fileName === 'string' && nodeData.fileName.trim()) {
    return nodeData.fileName.trim();
  }
  const action = actionDef(nodeData.actionId);
  if (action) return metadata(action.label);
  return metadata(STUDIO_NODE_REGISTRY[node?.type as StudioNodeType]?.label ?? 'Input');
};

export function ActionNode({ id, data, selected }: NodeProps<ReactFlowNode<ActionNodeData>>) {
  const translateUi = useUiTranslations('studio');
  const metadata = useStudioMetadata();

  const executionControls = useWorkflowExecution();
  const brandId = useStudioStore((state) => state.brandId);
  const roomId = useStudioStore((state) => state.activeRoomId);
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);

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
  const graphNode = {
    id,
    type: 'action',
    data: data as Record<string, unknown>,
  };
  const targetHandles = getAllowedTargetHandles(graphNode);
  const sourceHandles = getAllowedSourceHandles(graphNode);
  const outputModality = actionOutputModality(data.actionId);

  // Two different "cannot run": no runner has shipped, or the runner is fine and the
  // service behind it is not live. The second one is temporary and says so.
  const heldBack = def?.comingSoon;
  const implemented = actionId ? isImplementedAction(actionId) && !heldBack : false;
  const hasConfig = actionId ? configFieldsFor(actionId).length > 0 : false;
  const orderedPort = def?.inputs.find((port) => (port.max ?? 1) > 1);
  const orderedEdges = orderedPort
    ? edges.filter((edge) => edge.target === id && edge.targetHandle === orderedPort.handle)
    : [];

  const moveInput = (edgeId: string, delta: -1 | 1) => {
    const store = useStudioStore.getState();
    const positions = store.edges.flatMap((edge, index) =>
      edge.target === id && edge.targetHandle === orderedPort?.handle ? [index] : [],
    );
    const current = positions.findIndex((index) => store.edges[index]?.id === edgeId);
    const destination = current + delta;
    if (current < 0 || destination < 0 || destination >= positions.length) return;
    const next = [...store.edges];
    [next[positions[current]], next[positions[destination]]] = [
      next[positions[destination]],
      next[positions[current]],
    ];
    store.setEdges(next);
    store.triggerSave();
  };

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
          label={def ? metadata(def.label) : translateUi('pick_an_operation_e779937c')}
          title={def ? metadata(def.description) : undefined}
        >
          {outputModality ? (
            <NodeBadge>{metadata(MODALITY_LABEL[outputModality])}</NodeBadge>
          ) : null}
          {/* Still no per-op branch in here: which ops have a brand value to name is decided
              inside ActionBrandNote, beside the resolver it reads. */}
          {actionId ? <ActionBrandNote actionId={actionId} /> : null}
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
                    ? metadata('Ready to run')
                    : heldBack
                      ? metadata(heldBack)
                      : translateUi('actionUnavailable', {
                          operation: metadata(def.label),
                        })
                }
              />
              {orderedEdges.length > 0 ? (
                <div className="nodrag absolute bottom-1.5 left-1.5 z-10 max-w-[calc(100%-4.5rem)] space-y-0.5 rounded-md border border-border/60 bg-background/95 p-1 shadow-sm">
                  {orderedEdges.map((edge, index) => {
                    const label = sourceLabel(
                      nodes.find((node) => node.id === edge.source),
                      metadata,
                    );
                    const position = translateUi('orderedInputPosition', {
                      position:
                        orderedEdges.length === 1
                          ? 'both'
                          : index === 0
                            ? 'first'
                            : index === orderedEdges.length - 1
                              ? 'last'
                              : 'other',
                    });
                    return (
                      <div key={edge.id} className="flex min-w-0 items-center gap-0.5 text-2xs">
                        <span className="min-w-0 flex-1 truncate">{`${index + 1} · ${label}${position}`}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5"
                          aria-label={translateUi('move_value0_earlier_46194c47', {
                            value0: String(label),
                          })}
                          disabled={index === 0}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={() => moveInput(edge.id, -1)}
                        >
                          <ChevronUp className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5"
                          aria-label={translateUi('move_value0_later_aef5684d', {
                            value0: String(label),
                          })}
                          disabled={index === orderedEdges.length - 1}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={() => moveInput(edge.id, 1)}
                        >
                          <ChevronDown className="size-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <Button
                className="nodrag absolute left-1.5 top-1.5 z-10 h-6 px-2 text-xs opacity-70 transition-opacity group-hover/preview:opacity-100 focus-visible:opacity-100"
                size="sm"
                disabled={!implemented || data.isExecuting}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => void run()}
              >
                {data.isExecuting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}{' '}
                {translateUi('run_00d60e31')}{' '}
              </Button>
              {/* Every op that lands an image or a clip carries the save; the text ops
                  render nothing here, because the button reads the OUTPUT and a string
                  is not a file (Airtable #288). */}
              <NodeDownloadButton
                nodeType="action"
                data={data}
                baseName={def.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
              />
              {data.error ? (
                <NodeOverlayNote tone="destructive">
                  {workflowNodeError(data, translateUi)}
                </NodeOverlayNote>
              ) : null}
            </>
          ) : (
            <span className="px-3 text-center text-xs text-muted-foreground">
              {' '}
              {translateUi('choose_an_operation_for_this_node_f_fee91761')}{' '}
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
