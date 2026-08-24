// The canvas face of a saved Element. It binds to the Element by id and re-reads it,
// so regenerating a reference reaches every canvas already using it — the node stores
// a pointer, never a copy. It has ONE source handle (`image`) and no inputs.
//
// What it emits is decided by `elementNodeEmission` in lib/ai-studio/elements: the
// pinned reference when one is set, otherwise the members up to the category's
// fallback ceiling, and NOTHING at all when the Element is gone. The node paints the
// same three states so what the user sees is what the model gets.

import { ELEMENT_IMAGE_OUTPUT_HANDLE } from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
} from '@xyflow/react';
import { AlertTriangle, Copy, Layers, Trash2, Unlink } from 'lucide-react';
import type React from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ELEMENT_CATEGORY_LABEL,
  type ElementCategory,
  elementDefaultReferenceAssetId,
  elementNodeEmission,
  useElements,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { ElementNodeData as CanvasElementNodeData } from '../types';

/**
 * The canvas type plus what the drop stamps on the node.
 *
 * HANDOFF (f-runtime owns types/index.ts): fold these three optional fields into
 * `ElementNodeData` there and this extension deletes itself. They are last-known
 * values, not a cache of the Element: the node paints before the Elements query
 * resolves, and a DELETED Element can still say which one it was.
 */
export interface ElementNodeData extends CanvasElementNodeData {
  elementName?: string;
  elementCategory?: string;
  previewUrl?: string;
}

export function ElementNode({ id, data, selected }: NodeProps<ReactFlowNode<ElementNodeData>>) {
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const detachNodeConnections = useStudioStore((state) => state.detachNodeConnections);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);
  const brandId = useStudioStore((state) => state.brandId);
  const edges = useEdges();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const { elements, isLoading } = useElements(brandId);
  const element = data.elementId
    ? elements.find((candidate) => candidate.id === data.elementId)
    : undefined;

  const emission = elementNodeEmission(element);
  const previewAssetId = element
    ? (elementDefaultReferenceAssetId(element) ?? element.members[0]?.assetId)
    : undefined;
  const signedUrls = useSignedAssetUrls(brandId, previewAssetId ? [previewAssetId] : []);
  const preview = (previewAssetId ? signedUrls[previewAssetId] : undefined) ?? data.previewUrl;

  // "Not found yet" and "not found ever" are different: the first is a pending query,
  // the second is an Element somebody deleted out from under this node.
  const unavailable = !element && !isLoading;
  const name = element?.name ?? data.elementName ?? 'Element';
  const category = (element?.category ?? data.elementCategory) as ElementCategory | undefined;
  const categoryLabel = category ? (ELEMENT_CATEGORY_LABEL[category] ?? category) : undefined;

  const imageConnections = edges.filter(
    (edge) => edge.source === id && edge.sourceHandle === ELEMENT_IMAGE_OUTPUT_HANDLE,
  ).length;

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                'relative group h-full w-full min-w-[180px] min-h-[180px] rounded-xl transition-shadow',
                isSelectedByOther && 'selected-by-other',
              )}
              style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
              data-testid="element-node"
            >
              <NodeResizer
                minWidth={160}
                minHeight={160}
                keepAspectRatio
                isVisible={selected}
                lineClassName="border-brand-primary/60"
                handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
              />
              <CanvasNode
                handles={{ target: false, source: false }}
                selected={selected}
                className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm"
              >
                <NodeContent className="relative flex-1 min-h-0 p-0 nodrag bg-muted/30">
                  {unavailable ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <AlertTriangle />
                        </EmptyMedia>
                        <EmptyTitle>Element unavailable</EmptyTitle>
                        <EmptyDescription>
                          {`“${name}” is no longer in this brand’s Elements. This node sends nothing.`}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : preview ? (
                    // biome-ignore lint/performance/noImgElement: canvas nodes paint signed
                    // storage URLs that next/image cannot resolve at build time.
                    <img
                      src={preview}
                      alt={`${name} reference`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Layers />
                        </EmptyMedia>
                        <EmptyTitle>{name}</EmptyTitle>
                        <EmptyDescription>
                          {isLoading ? 'Loading…' : 'No reference yet'}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}

                  {categoryLabel && !unavailable ? (
                    <Badge
                      variant="secondary"
                      className="absolute left-2 top-2 z-20 h-5 px-2 text-2xs"
                    >
                      {categoryLabel}
                    </Badge>
                  ) : null}

                  {emission?.mode === 'fallback' ? (
                    <Badge
                      variant="outline"
                      className="absolute right-2 top-2 z-20 h-5 bg-background/90 px-2 text-2xs"
                    >
                      {`No reference — sending ${emission.refs.length} ${
                        emission.refs.length === 1 ? 'image' : 'images'
                      }`}
                    </Badge>
                  ) : null}

                  {emission && emission.droppedCount > 0 ? (
                    <Badge
                      variant="destructive"
                      className="absolute bottom-7 right-2 z-20 h-5 px-2 text-2xs"
                    >
                      {`${emission.droppedCount} of ${
                        emission.droppedCount + emission.refs.length
                      } reference images dropped`}
                    </Badge>
                  ) : null}

                  <div className="absolute bottom-0 left-0 right-0 truncate border-t border-subtle bg-surface/90 px-2 py-1 text-3xs text-secondary backdrop-blur">
                    {name}
                  </div>
                </NodeContent>
              </CanvasNode>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={ELEMENT_IMAGE_OUTPUT_HANDLE}
                      style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
                      className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
                    />
                  }
                />
                <TooltipContent>
                  <p>Image Output: {imageConnections} connections</p>
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>Element</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={getConnectedEdges(id).length === 0}
            onClick={() => detachNodeConnections(id)}
          >
            <Unlink className="mr-2 h-4 w-4" />
            Detach connections
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => deleteNode(id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
  );
}
