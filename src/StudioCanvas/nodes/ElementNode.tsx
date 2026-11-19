// The canvas face of a saved Element. It binds to the Element by id and re-reads it,
// so regenerating a reference reaches every canvas already using it — the node stores
// a pointer, never a copy. Its placement intent decides whether it emits the sheet or
// the canonical motion clip.
//
// What it emits is decided by `elementNodeEmission` in lib/ai-studio/elements: the
// pinned reference when one is set, otherwise the members up to the category's
// fallback ceiling, and NOTHING at all when the Element is gone. The node paints the
// same three states so what the user sees is what the model gets.

import { ELEMENT_IMAGE_OUTPUT_HANDLE, ELEMENT_VIDEO_OUTPUT_HANDLE } from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
} from '@xyflow/react';
import { AlertTriangle, Copy, Layers, Plus, Trash2, Unlink } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { ElementsPanel } from '@/components/ai-studio/elements/ElementsPanel';
import {
  elementCategoryLabel,
  elementUseIntentLabel,
} from '@/components/ai-studio/elements/elementPresentation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  defaultElementUseIntent,
  ELEMENT_USE_INTENTS,
  type ElementCategory,
  type ElementRecord,
  elementDefaultReferenceAssetId,
  elementNodeEmission,
  elementReferenceTypeForUse,
  useElements,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { ElementNodeData } from '../types';

export type { ElementNodeData } from '../types';

export function ElementNode({ id, data, selected }: NodeProps<ReactFlowNode<ElementNodeData>>) {
  const translateUi = useUiTranslations('studio');

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
  const intent =
    data.useIntent ?? (element ? defaultElementUseIntent(element.category) : 'subject');
  const previewAssetId = element
    ? (elementDefaultReferenceAssetId(element) ?? element.members[0]?.assetId)
    : undefined;
  const signedUrls = useSignedAssetUrls(
    brandId,
    [previewAssetId, element?.motionAssetId].filter((value): value is string => Boolean(value)),
  );
  const preview = (previewAssetId ? signedUrls[previewAssetId] : undefined) ?? data.previewUrl;
  const motionUrl =
    (element?.motionAssetId ? signedUrls[element.motionAssetId] : undefined) ?? data.motionUrl;
  // The live Element when it has loaded (the record omits an empty list), else what the
  // last run stamped on the node.
  const styleSlugs = element ? (element.styleSlugs ?? []) : (data.styleSlugs ?? []);

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
      useIntent: defaultElementUseIntent(chosen.category),
      referenceType: elementReferenceTypeForUse(
        chosen.category,
        defaultElementUseIntent(chosen.category),
      ),
    });
    triggerSave();
  };
  const name = element?.name ?? data.elementName ?? translateUi('element_4e5b548d');
  const category = (element?.category ?? data.elementCategory) as ElementCategory | undefined;
  const categoryLabel = category ? elementCategoryLabel(category, translateUi) : undefined;

  const outputHandle =
    intent === 'motion' ? ELEMENT_VIDEO_OUTPUT_HANDLE : ELEMENT_IMAGE_OUTPUT_HANDLE;
  const outputConnections = edges.filter(
    (edge) => edge.source === id && edge.sourceHandle === outputHandle,
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
                        <EmptyTitle>{translateUi('element_unavailable_bb8afce0')}</EmptyTitle>
                        <EmptyDescription>
                          {translateUi('value0_is_no_longer_in_this_brand_s_c963f6f7', {
                            value0: String(name),
                          })}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : intent === 'motion' && motionUrl ? (
                    <video
                      src={motionUrl}
                      muted
                      loop
                      playsInline
                      className="h-full w-full object-contain"
                    />
                  ) : intent !== 'motion' && preview ? (
                    // biome-ignore lint/performance/noImgElement: canvas nodes paint signed
                    // storage URLs that next/image cannot resolve at build time.
                    <img
                      loading="lazy"
                      src={preview}
                      alt={translateUi('value0_reference_a1af46da', { value0: String(name) })}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Layers />
                        </EmptyMedia>
                        <EmptyTitle>
                          {intent === 'motion' ? translateUi('no_motion_clip_f5d31d15') : name}
                        </EmptyTitle>
                        <EmptyDescription>
                          {isLoading
                            ? translateUi('loading_ba3bbbe1')
                            : translateUi('no_reference_yet_f9c4850a')}
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

                  {styleSlugs.length > 0 && !unavailable ? (
                    <div
                      className="absolute left-2 top-8 z-20 flex max-w-[calc(100%-1rem)] flex-wrap gap-1"
                      data-testid="element-node-styles"
                    >
                      {styleSlugs.map((slug) => (
                        <Badge
                          key={slug}
                          variant="outline"
                          className="h-5 bg-background/90 px-1.5 font-mono text-3xs"
                        >
                          /{slug}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {intent !== 'motion' && emission?.mode === 'fallback' ? (
                    <Badge
                      variant="outline"
                      className="absolute right-2 top-2 z-20 h-5 bg-background/90 px-2 text-2xs"
                    >
                      {translateUi('no_reference_sending_value0_value1_ac76fb07', {
                        value0: String(emission.refs.length),
                        value1: String(emission.refs.length === 1 ? 'image' : 'images'),
                      })}
                    </Badge>
                  ) : null}

                  {intent !== 'motion' && emission && emission.droppedCount > 0 ? (
                    <Badge
                      variant="destructive"
                      className="absolute bottom-7 right-2 z-20 h-5 px-2 text-2xs"
                    >
                      {translateUi('value0_of_value1_reference_images_d_6619fd35', {
                        value0: String(emission.droppedCount),
                        value1: String(emission.droppedCount + emission.refs.length),
                      })}
                    </Badge>
                  ) : null}

                  {unbound ? null : (
                    <div className="absolute bottom-0 left-0 right-0 truncate border-t border-subtle bg-surface/90 px-2 py-1 text-3xs text-secondary backdrop-blur">
                      {name}
                    </div>
                  )}

                  {!unbound && !unavailable ? (
                    <Select
                      value={intent}
                      onValueChange={(value) => {
                        const useIntent = value as ElementNodeData['useIntent'];
                        updateNodeData(id, {
                          useIntent,
                          referenceType: element
                            ? elementReferenceTypeForUse(element.category, useIntent ?? 'subject')
                            : 'default',
                        });
                        triggerSave();
                      }}
                    >
                      <SelectTrigger
                        aria-label={translateUi('element_use_e91f7c26')}
                        className="nodrag absolute bottom-7 left-2 z-20 h-6 w-28 bg-background/90 px-2 text-3xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ELEMENT_USE_INTENTS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {elementUseIntentLabel(value, translateUi)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </NodeContent>
              </CanvasNode>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={outputHandle}
                      style={{
                        ['--edge-color' as keyof React.CSSProperties]:
                          intent === 'motion' ? 'var(--edge-video)' : 'var(--edge-image)',
                      }}
                      className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
                    />
                  }
                />
                <TooltipContent>
                  <p>
                    {intent === 'motion'
                      ? translateUi('video_d534be82')
                      : translateUi('image_1aa4cb0b')}{' '}
                    {translateUi('output_457f4957')} {outputConnections}{' '}
                    {translateUi('connections_1e5fac86')}{' '}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>{translateUi('element_4e5b548d')}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" /> {translateUi('duplicate_02cdaabf')}{' '}
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={getConnectedEdges(id).length === 0}
            onClick={() => detachNodeConnections(id)}
          >
            <Unlink className="mr-2 h-4 w-4" /> {translateUi('detach_connections_ea1e2b08')}{' '}
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => deleteNode(id)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> {translateUi('delete_e2d0a549')}{' '}
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
  const translateUi = useUiTranslations('studio');

  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <>
      {elements.length > 0 ? (
        <div className="nodrag nowheel flex h-full w-full flex-col gap-1.5 overflow-y-auto p-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {' '}
            {translateUi('choose_an_element_a5f12fb6')}{' '}
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
                {elementCategoryLabel(candidate.category, translateUi)}
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
            <Plus className="mr-2 h-4 w-4" /> {translateUi('new_element_45e3dc5d')}{' '}
          </Button>
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>{translateUi('no_elements_yet_d2dff1dd')}</EmptyTitle>
            <EmptyDescription>{translateUi('elementOnboarding')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {translateUi('create_an_element_574bb0e4')}{' '}
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
