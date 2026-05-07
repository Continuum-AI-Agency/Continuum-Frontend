import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VideoIcon } from '@radix-ui/react-icons';
import type { ExtendVideoNodeData } from '../types';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadAsset } from '../utils/downloadAsset';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { Button } from '@/components/ui/button';
import { CopyIcon, DownloadIcon, PlayIcon, TrashIcon } from '@radix-ui/react-icons';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export function ExtendVideoBlock({ id, data, selected }: NodeProps<ReactFlowNode<ExtendVideoNodeData>>) {
  const [isHovered, setIsHovered] = useState(false);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();

  const handleRun = useCallback(async () => {
    console.info("[studio] run extend video node", { nodeId: id });
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId]);

  const displayVideo = (data.generatedVideo as string | Blob | undefined) ?? data.generatedVideoUrl;

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: displayVideo as string | Blob | undefined,
      baseName: `extended-video-${id}`,
      fallbackExtension: 'mp4',
    });

    if (!success) {
      show({
        title: 'Download unavailable',
        description: 'Run the node to generate a video before downloading.',
        variant: 'warning',
      });
    }
  }, [displayVideo, id, show]);

  const isToolbarVisible = selected || isHovered || !!data.isToolbarVisible;
  const generatorDescription = 'Extend Video • 16:9';

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div
        className={cn(
          "relative group h-full w-full min-w-[260px] min-h-[160px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRun} title="Run Node">
            <PlayIcon className="h-4 w-4" />
          </Button>
        </Toolbar>

      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="h-full w-full overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
      >
        <NodeContent className="relative flex-1 p-0 flex items-center justify-center overflow-hidden bg-muted/30 text-xs text-secondary group/preview">
          <AspectRatio ratio={16 / 9} className="h-full w-full overflow-hidden bg-muted">
            {data.isExecuting ? (
              <div className="absolute inset-0 flex items-center justify-center bg-muted p-4">
                <GenerationPulseLoader />
              </div>
            ) : displayVideo ? (
              <div className="relative h-full w-full bg-black/85">
                <video
                  src={displayVideo as string}
                  controls
                  className="h-full w-full object-contain"
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <VideoIcon className="h-8 w-8 opacity-20" />
                <span className="text-[10px] opacity-50">Ready to extend video</span>
              </div>
            )}
          </AspectRatio>
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
          <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
            Video Input
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
          <span className="studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/handle:opacity-100">
            Prompt (Optional)
          </span>
        </div>
      </div>

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
            <p>Extended Video Output</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className={cn(
        "pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity",
        (selected || isHovered) ? "opacity-100" : "opacity-0"
      )}>
        {generatorDescription}
      </div>
    </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>Extend Video</ContextMenuLabel>
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
