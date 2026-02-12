import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoIcon } from '@radix-ui/react-icons';
import type { ExtendVideoNodeData } from '../types';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import { BlockToolbar } from '../components/BlockToolbar';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadAsset } from '../utils/downloadAsset';

export function ExtendVideoBlock({ id, data, selected }: NodeProps<Node<ExtendVideoNodeData>>) {
  const [isHovered, setIsHovered] = useState(false);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const executionControls = useWorkflowExecution();
  const { show } = useToast();

  const handleRun = useCallback(async () => {
    console.info("[studio] run extend video node", { nodeId: id });
    await executeWorkflow(executionControls, { targetNodeId: id, brandId });
  }, [executionControls, id, brandId]);

  const handleDownload = useCallback(() => {
    const success = downloadAsset({
      data: data.generatedVideo as string | Blob | undefined,
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
  }, [data.generatedVideo, id, show]);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "relative group h-full w-full min-w-[260px] min-h-[160px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ 
          ['--other-user-color' as any]: selectingUser?.color 
        }}
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

        <BlockToolbar 
          isVisible={isHovered || !!data.isToolbarVisible}
          onDuplicate={() => duplicateNode(id)}
          onDelete={() => deleteNode(id)}
          onRun={handleRun}
          onDownload={handleDownload}
        />

      <Card className="h-full border border-subtle shadow-md bg-surface flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1 border-b border-subtle text-[10px] font-semibold uppercase tracking-widest text-secondary bg-default/70">
          <span>Extend Video</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-secondary text-xs relative overflow-hidden bg-default/60">
          {data.isExecuting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-default p-4">
              <Skeleton className="w-full h-full bg-muted" />
            </div>
          ) : data.generatedVideo ? (
            <video
              src={data.generatedVideo as string}
              controls
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <VideoIcon className="w-8 h-8 opacity-20" />
              <span className="opacity-50 text-[10px]">Ready to extend video</span>
            </div>
          )}
        </div>
      </Card>

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
          <span className={cn(
            "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
            (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
          )}>
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
          <span className={cn(
            "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
            (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
          )}>
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
    </div>
    </TooltipProvider>
  );
}
