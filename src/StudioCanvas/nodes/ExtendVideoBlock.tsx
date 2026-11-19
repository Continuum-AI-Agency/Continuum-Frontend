import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { Copy, Download, Play, Trash2, Video } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
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
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { NodeVideoPreview } from '../components/NodeVideoPreview';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useSnapToVideoAspect } from '../hooks/useSnapToVideoAspect';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { ExtendVideoNodeData } from '../types';
import { downloadAsset } from '../utils/downloadAsset';
import { executeWorkflow } from '../utils/executeWorkflow';

// Mirrors the NodeResizer minimums below: a snap under them would produce a style
// the node cannot actually render at, which is the ratio-lying bug this guards.
const EXTEND_VIDEO_NODE_BOUNDS = { minWidth: 260, minHeight: 160, fallbackWidth: 400 };

export function ExtendVideoBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<ExtendVideoNodeData>>) {
  const translateUi = useUiTranslations('studio');

  const [isHovered, setIsHovered] = useState(false);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();

  const handleRun = useCallback(async () => {
    console.info('[studio] run extend video node', { nodeId: id });
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId]);

  const displayVideo = (data.generatedVideo as string | Blob | undefined) ?? data.generatedVideoUrl;

  // An extension inherits the source clip's shape, and the source is whatever was
  // wired in — so the node has no requested ratio to size itself from and must
  // learn it from the clip it produced. Bounds mirror the NodeResizer minimums.
  useSnapToVideoAspect({ nodeId: id, src: displayVideo, bounds: EXTEND_VIDEO_NODE_BOUNDS });

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      translate: translateUi,
      data: displayVideo as string | Blob | undefined,
      baseName: `extended-video-${id}`,
      fallbackExtension: 'mp4',
    });

    if (!success) {
      show({
        title: translateUi('download_unavailable_2f180e49'),
        description: translateUi('run_the_node_to_generate_a_video_be_b9d88bf3'),
        variant: 'warning',
      });
    }
  }, [displayVideo, id, show, translateUi]);

  const isToolbarVisible = selected || isHovered || !!data.isToolbarVisible;
  const generatorDescription = translateUi('extend_video_e4d1e89c');

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            // biome-ignore lint/a11y/noStaticElementInteractions: hover-only affordance on a canvas node wrapper; the node's controls carry the real semantics
            <div
              className={cn(
                'relative group h-full w-full min-w-[260px] min-h-[160px] rounded-xl transition-shadow',
                isSelectedByOther && 'selected-by-other',
              )}
              style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <NodeResizer
                minWidth={260}
                minHeight={160}
                isVisible={selected}
                lineClassName="border-brand-primary/60"
                handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
              />

              <Toolbar
                isVisible={isToolbarVisible}
                position={Position.Top}
                className="gap-1.5 border-border/80 bg-background/95 shadow-lg backdrop-blur-sm"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleRun}
                  title={translateUi('run_node_79567976')}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </Toolbar>

              <CanvasNode
                handles={{ target: false, source: false }}
                selected={selected}
                className="h-full w-full overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* The node's own box carries the ratio (useSnapToVideoAspect) and the
                    video fills it with object-contain. A Radix AspectRatio used to sit
                    here: it sized itself from the WIDTH, ignored h-full, and the
                    overflow-hidden card clipped the overflow into what read as extreme
                    zoom (Airtable #232) — and it hardcoded 16:9 for a node whose output
                    is whatever shape the source clip was. */}
                <NodeContent className="relative flex-1 p-0 flex items-center justify-center overflow-hidden bg-muted/30 text-xs text-secondary group/preview">
                  <div className="relative h-full w-full overflow-hidden bg-muted">
                    {data.isExecuting ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted p-4">
                        <GenerationPulseLoader />
                      </div>
                    ) : displayVideo ? (
                      <NodeVideoPreview src={displayVideo as string}>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="nodrag absolute right-2 top-2 z-20 h-7 w-7 border border-border/70 bg-background/90 opacity-90 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDownload();
                          }}
                          title={translateUi('download_output_b86e2324')}
                          aria-label={translateUi('download_generated_video_d30b5aa4')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </NodeVideoPreview>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <Video className="h-8 w-8 opacity-20" />
                        <span className="text-2xs opacity-50">
                          {translateUi('ready_to_extend_video_36be70f6')}
                        </span>
                      </div>
                    )}
                  </div>
                </NodeContent>
              </CanvasNode>

              <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 pointer-events-none">
                <div
                  className="relative flex flex-col items-center group/handle"
                  style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
                >
                  <Handle
                    type="target"
                    position={Position.Left}
                    id="video"
                    className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
                  />
                  <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                    {' '}
                    {translateUi('video_input_4116f980')}{' '}
                  </span>
                </div>

                <div
                  className="relative flex flex-col items-center group/handle"
                  style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
                >
                  <Handle
                    type="target"
                    position={Position.Left}
                    id="prompt"
                    className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
                  />
                  <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                    {' '}
                    {translateUi('prompt_optional_f2087c97')}{' '}
                  </span>
                </div>
              </div>

              <div
                className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Handle
                        type="source"
                        position={Position.Right}
                        id="video"
                        className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
                      />
                    }
                  />
                  <TooltipContent>
                    <p>{translateUi('extended_video_output_9b1107e9')}</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-background/85 px-2 py-0.5 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity',
                  selected || isHovered ? 'opacity-100' : 'opacity-0',
                )}
              >
                {generatorDescription}
              </div>
            </div>
          }
        />
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>{translateUi('extend_video_e4d1e89c')}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRun}>
            <Play className="mr-2 h-4 w-4" /> {translateUi('run_node_79567976')}{' '}
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" /> {translateUi('duplicate_02cdaabf')}{' '}
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDownload} disabled={!displayVideo}>
            <Download className="mr-2 h-4 w-4" /> {translateUi('download_output_b86e2324')}{' '}
          </ContextMenuItem>
          <ContextMenuSeparator />
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
