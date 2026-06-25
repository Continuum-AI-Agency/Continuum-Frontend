import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer, HandleProps, useEdges, useNodeId } from '@xyflow/react';
import { useStudioStore } from '../stores/useStudioStore';
import { VideoGenNodeData } from '../types';
import { CreativeSkillMenu, toggleSkillId } from '../components/CreativeSkillMenu';
import { CopyIcon, DownloadIcon, PlayIcon, TrashIcon, VideoIcon } from '@radix-ui/react-icons';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadAsset } from '../utils/downloadAsset';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useNodeSelection } from '../contexts/PresenceContext';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { snapNodeDimensionsToAspectRatio } from '../utils/aspectRatioSizing';

const LimitedHandle = ({ maxConnections, isConnectable, ...props }: HandleProps & { maxConnections?: number }) => {
  const edges = useEdges();
  const nodeId = useNodeId();
  const handleId = props.id ?? null;

  const connectionCount = edges.filter((edge) => {
    if (!nodeId) return false;

    if (props.type === 'target') {
      return edge.target === nodeId && (edge.targetHandle ?? null) === handleId;
    }

    return edge.source === nodeId && (edge.sourceHandle ?? null) === handleId;
  }).length;

  const withinLimit = !maxConnections || connectionCount < maxConnections;
  const baseConnectable = isConnectable ?? true;

  return <Handle {...props} isConnectable={baseConnectable && withinLimit} />;
};

export function VeoFastBlock({ id, data, selected }: NodeProps<ReactFlowNode<VideoGenNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const flowEdges = useEdges();
  const executionControls = useWorkflowExecution();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const [isHovered, setIsHovered] = useState(false);
  const isToolbarVisible = selected || isHovered || !!data.isToolbarVisible;
  const generatorDescription = `${data.model === 'veo-3.1' ? 'Veo 3.1' : 'Veo 3.1 Fast'} • ${data.resolution ?? '720p'} • ${data.aspectRatio ?? '16:9'}`;

  // Calculate connection counts for tooltips
  const promptConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'prompt-in').length;
  const negativeConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'negative').length;
  const firstFrameConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'first-frame').length;
  const lastFrameConnections = flowEdges.filter(edge => edge.target === id && edge.targetHandle === 'last-frame').length;

  const handleModelChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as VideoGenNodeData),
          model: value as VideoGenNodeData['model'],
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode]
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => {
        const nextDimensions = snapNodeDimensionsToAspectRatio({
          aspectRatio: value,
          currentWidth: node.style?.width ?? node.width ?? node.measured?.width,
          currentHeight: node.style?.height ?? node.height ?? node.measured?.height,
          minWidth: 300,
          minHeight: 170,
          fallbackWidth: 512,
        });

        return {
          ...node,
          data: {
            ...(node.data as VideoGenNodeData),
            aspectRatio: value as '16:9' | '9:16',
          },
          style: {
            ...(node.style ?? {}),
            width: nextDimensions.width,
            height: nextDimensions.height,
          },
        };
      });
      triggerSave();
    },
    [id, triggerSave, updateNode]
  );

  const handleResolutionChange = useCallback(
    (value: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as VideoGenNodeData),
          resolution: value as VideoGenNodeData['resolution'],
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode]
  );

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      updateNode(id, (node) => ({
        ...node,
        data: {
          ...(node.data as VideoGenNodeData),
          skillIds: toggleSkillId((node.data as VideoGenNodeData).skillIds, skillId),
        },
      }));
      triggerSave();
    },
    [id, triggerSave, updateNode]
  );

  const handleRun = useCallback(async () => {
    console.info("[studio] run veo-fast node", { nodeId: id });
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId]);

  const fileBaseName = `video-${id}`;

  const displayVideo = (data.generatedVideo as string | Blob | undefined) ?? data.generatedVideoUrl;

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: displayVideo as string | Blob | undefined,
      baseName: fileBaseName,
      fallbackExtension: 'mp4',
    });

    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Run the node to generate a video before downloading.',
        variant: 'warning',
      });
    }
  }, [displayVideo, fileBaseName, show]);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div
        className={cn(
          "relative group h-full w-full min-w-[300px] min-h-[170px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      <NodeResizer 
        minWidth={300} 
        minHeight={170} 
        isVisible={selected} 
        lineClassName="border-brand-primary/60" 
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />

      <Toolbar
        isVisible={isToolbarVisible}
        position={Position.Top}
        className="gap-1.5 border-border/80 bg-background/95 shadow-lg backdrop-blur-sm"
      >
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRun} title="Run Node">
            <PlayIcon className="h-4 w-4" />
          </Button>
      </Toolbar>

       <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="h-full w-full overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
      >
        <NodeContent className="relative flex-1 min-h-0 p-0 bg-muted/30 group/preview">
            <AspectRatio ratio={(data.aspectRatio ?? '16:9') === '16:9' ? 16 / 9 : 9 / 16} className="h-full w-full overflow-hidden bg-muted">
            {data.isExecuting ? (
              <div className="w-full h-full flex items-center justify-center bg-muted p-4">
                      <GenerationPulseLoader />
              </div>
            ) : displayVideo ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black/85">
                <video
                  src={displayVideo as string}
                  controls
                  className="w-full h-full object-contain"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="nodrag absolute right-2 top-2 z-20 h-7 w-7 border border-border/70 bg-background/90 opacity-90 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDownload();
                  }}
                  title="Download Output"
                  aria-label="Download generated video"
                >
                  <DownloadIcon className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-secondary gap-2">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-default text-secondary">
                      <VideoIcon />
                    </EmptyMedia>
                    <EmptyTitle>No Video</EmptyTitle>
                    <EmptyDescription>Generated video will appear here</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
            </AspectRatio>
        </NodeContent>
      </CanvasNode>

      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
        style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Handle
              type="source"
              position={Position.Right}
              id="video"
              className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>Generated Video Output</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Handles Container - Outside of Card to prevent clipping */}
      <div className="absolute -left-2 top-0 bottom-0 flex flex-col justify-evenly py-4 pointer-events-none h-full z-20">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="prompt-in"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                Prompt
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Prompt: {promptConnections}/1</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative pointer-events-auto group/handle"
              style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
            >
              <LimitedHandle
                type="target"
                position={Position.Left}
                id="negative"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
              />
              <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                Negative Prompt
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Negative Prompt: {negativeConnections}/1</p>
          </TooltipContent>
        </Tooltip>

        {/* Always Frames Mode for Veo Fast */}
        <Tooltip>
            <TooltipTrigger asChild>
            <div
                className="relative pointer-events-auto group/handle"
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
            >
                <LimitedHandle
                type="target"
                position={Position.Left}
                id="first-frame"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                />
                <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                First Frame
                </span>
            </div>
            </TooltipTrigger>
            <TooltipContent>
            <p>First Frame: {firstFrameConnections}/1</p>
            </TooltipContent>
        </Tooltip>

        <Tooltip>
            <TooltipTrigger asChild>
            <div
                className="relative pointer-events-auto group/handle"
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
            >
                <LimitedHandle
                type="target"
                position={Position.Left}
                id="last-frame"
                maxConnections={1}
                className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125"
                />
                <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-2xs font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
                Last Frame
                </span>
            </div>
            </TooltipTrigger>
            <TooltipContent>
            <p>Last Frame: {lastFrameConnections}/1</p>
            </TooltipContent>
        </Tooltip>
      </div>

      <div className={cn(
        "pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-background/85 px-2 py-0.5 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity",
        (selected || isHovered) ? "opacity-100" : "opacity-0"
      )}>
        {generatorDescription}
      </div>
     </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Veo Fast</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Model</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-40">
              <ContextMenuCheckboxItem checked={(data.model || 'veo-3.1-fast') === 'veo-3.1'} onClick={() => handleModelChange('veo-3.1')}>
                Veo 3.1
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem checked={(data.model || 'veo-3.1-fast') === 'veo-3.1-fast'} onClick={() => handleModelChange('veo-3.1-fast')}>
                Veo 3.1 Fast
              </ContextMenuCheckboxItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Aspect Ratio</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {['16:9', '9:16'].map((value) => (
                <ContextMenuCheckboxItem
                  key={value}
                  checked={(data.aspectRatio ?? '16:9') === value}
                  onClick={() => handleAspectRatioChange(value)}
                >
                  {value}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Resolution</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {(['720p', '1080p', '4k'] as const).map((value) => (
                <ContextMenuCheckboxItem
                  key={value}
                  checked={(data.resolution ?? '720p').toLowerCase() === value.toLowerCase()}
                  onClick={() => handleResolutionChange(value)}
                >
                  {value}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <CreativeSkillMenu
            brandId={brandId}
            selectedSkillIds={data.skillIds ?? []}
            onToggle={handleToggleSkill}
          />
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRun}>
            <PlayIcon className="mr-2 h-4 w-4" />
            Run Node
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <CopyIcon className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDownload} disabled={!displayVideo}>
            <DownloadIcon className="mr-2 h-4 w-4" />
            Download Output
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteNode(id)}>
            <TrashIcon className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
   );
 }
