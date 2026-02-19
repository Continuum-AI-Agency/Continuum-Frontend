import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer, useEdges } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { BaseNodeData } from '../types';
import { VideoIcon, UploadIcon } from '@radix-ui/react-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { useToast } from '@/components/ui/ToastProvider';
import { useNodeSelection } from '../contexts/PresenceContext';
import { cn } from '@/lib/utils';
import { Node as CanvasNode, NodeContent, NodeHeader } from '@/components/ai-elements/node';
import { AspectRatio } from '@/components/ui/aspect-ratio';

export interface VideoNodeData extends BaseNodeData {
  video?: string;
  fileName?: string;
}

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"


const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export function VideoReferenceNode({ id, data, selected }: NodeProps<ReactFlowNode<VideoNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const edges = useEdges();
  const [preview, setPreview] = useState<string | undefined>(data.video);
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  // Calculate connection counts for tooltips
  const videoConnections = edges.filter(edge => edge.source === id && edge.sourceHandle === 'video').length;

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        updateNodeData(id, { video: result, fileName: file.name });
        triggerSave();
      };
      reader.readAsDataURL(file);
    }
  }, [id, triggerSave, updateNodeData]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const fileToDataUrl = useCallback((file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  }), []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        show({
          title: 'Unsupported asset',
          description: 'Only video files can be dropped here.',
          variant: 'warning',
        });
        return;
      }
      try {
        const result = await fileToDataUrl(file);
        setPreview(result);
        updateNodeData(id, { video: result, fileName: file.name });
        triggerSave();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read dropped file';
        show({
          title: 'Drop failed',
          description: message,
          variant: 'error',
        });
      }
      return;
    }

    const rawPayload =
      event.dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
      event.dataTransfer.getData(RF_DRAG_MIME) ||
      event.dataTransfer.getData(TEXT_MIME);

    if (!rawPayload) return;

    const resolved = await resolveCreativeAssetDrop(rawPayload, resolveDroppedBase64);
    if (resolved.status === 'error') {
      show({
        title: resolved.title,
        description: resolved.description,
        variant: resolved.variant ?? 'error',
      });
      return;
    }

    if (resolved.nodeType !== 'video') {
      show({
        title: 'Unsupported asset',
        description: 'Only video assets can be dropped here.',
        variant: 'warning',
      });
      return;
    }

    setPreview(resolved.dataUrl);
    updateNodeData(id, { video: resolved.dataUrl, fileName: resolved.fileName });
    triggerSave();
  }, [fileToDataUrl, id, triggerSave, updateNodeData, show]);

  return (
    <TooltipProvider>
      <div 
        className={cn(
          "relative group w-full h-full min-w-[180px] min-h-[180px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
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
        className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
      >
        <NodeHeader className="!h-7 !px-3 !py-1 cursor-grab items-center justify-between gap-0 rounded-none bg-muted/60 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <span>Video Reference</span>
          <label htmlFor={`video-file-${id}`} className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
            <UploadIcon className="h-3 w-3" />
          </label>
        </NodeHeader>
        <NodeContent className="relative flex-1 min-h-0 p-0 nodrag bg-muted/30">
            <label
              htmlFor={`video-file-${id}`}
              className="cursor-pointer flex h-full w-full items-center justify-center transition-colors hover:bg-muted/40"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
                {preview ? (
                    <div className="h-full w-full bg-black/80">
                      <AspectRatio ratio={16 / 9} className="h-full w-full">
                        <video
                          src={preview}
                          className="h-full w-full object-contain"
                          muted
                          loop
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => e.currentTarget.pause()}
                        />
                      </AspectRatio>
                    </div>
                ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <VideoIcon />
                        </EmptyMedia>
                        <EmptyTitle>Upload Video</EmptyTitle>
                        <EmptyDescription>Drag & drop or click</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                )}
            </label>
            <Input
                id={`video-file-${id}`}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileUpload}
            />

            {data.fileName && (
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-surface/90 backdrop-blur border-t border-subtle text-[9px] text-secondary truncate">
                    {data.fileName}
                </div>
            )}
        </NodeContent>
      </CanvasNode>

      <Tooltip>
        <TooltipTrigger asChild>
          <Handle
            type="source"
            position={Position.Right}
            id="video"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
            className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Video Output: {videoConnections} connections</p>
        </TooltipContent>
      </Tooltip>
    </div>
    </TooltipProvider>
  );
}
