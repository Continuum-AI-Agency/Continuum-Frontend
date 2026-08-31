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
import { AlertTriangle, Copy, Layers, Plus, Trash2, Unlink } from 'lucide-react';
import React from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import {
  ELEMENT_ONBOARDING_COPY,
  ElementsPanel,
} from '@/components/ai-studio/elements/ElementsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ELEMENT_CATEGORY_LABEL,
  type ElementCategory,
  type ElementRecord,
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
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
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

  // Three distinct absences. "Never bound" is a node placed from the palette without an
  // Element chosen — that user needs a way IN (pick one, or create the brand's first),
  // not a deletion warning. "Not found yet" is a pending query. "Not found ever" is an
  // Element somebody deleted out from under this node.
  const unbound = !data.elementId;
  const unavailable = Boolean(data.elementId) && !element && !isLoading;

  const bindElement = (chosen: ElementRecord) => {
    updateNodeData(id, {
      elementId: chosen.id,
      elementName: chosen.name,
      elementCategory: chosen.category,
    });
    triggerSave();
  };
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
                {/* `nodrag` belongs on the CONTROLS, never on the body — the same defect the
                    layer editor and the video reference carried (Airtable #284/#297). The
                    Element picker below keeps it, because that one really is a control. */}
                <NodeContent className="relative flex-1 min-h-0 p-0 bg-muted/30">
                  {unbound && !isLoading ? (
                    <ElementNodeSetup brandId={brandId} elements={elements} onBind={bindElement} />
                  ) : unavailable ? (
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
                      loading="lazy"
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

                  {unbound ? null : (
                    <div className="absolute bottom-0 left-0 right-0 truncate border-t border-subtle bg-surface/90 px-2 py-1 text-3xs text-secondary backdrop-blur">
                      {name}
                    </div>
                  )}
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

/**
 * The way IN for a node that has no Element yet. A brand with Elements gets a one-click
 * picker; a brand with none gets the onboarding sentence and the EXISTING creation flow —
 * the same ElementsPanel the toolbar mounts, opened straight on its create form. Once an
 * Element exists (created or picked), `onBind` stamps it and the node becomes the normal
 * bound face.
 */
function ElementNodeSetup({
  brandId,
  elements,
  onBind,
}: {
  brandId?: string;
  elements: ElementRecord[];
  onBind: (element: ElementRecord) => void;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <>
      {elements.length > 0 ? (
        <div className="nodrag nowheel flex h-full w-full flex-col gap-1.5 overflow-y-auto p-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Choose an Element
          </p>
          {elements.map((candidate) => (
            <Button
              key={candidate.id}
              type="button"
              variant="outline"
              size="sm"
              className="w-full shrink-0 justify-between gap-2"
              onClick={() => onBind(candidate)}
            >
              <span className="truncate">{candidate.name}</span>
              <span className="shrink-0 text-2xs text-muted-foreground">
                {ELEMENT_CATEGORY_LABEL[candidate.category] ?? candidate.category}
              </span>
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full shrink-0 justify-start"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Element
          </Button>
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>No Elements yet</EmptyTitle>
            <EmptyDescription>{ELEMENT_ONBOARDING_COPY}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create an Element
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <ElementsPanel
        open={createOpen}
        onOpenChange={setCreateOpen}
        brandId={brandId}
        initialView="create"
      />
    </>
  );
}
