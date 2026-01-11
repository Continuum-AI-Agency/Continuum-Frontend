import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, useEdges } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { BaseNodeData } from '../types';
import { VideoIcon, UploadIcon } from '@radix-ui/react-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { useToast } from '@/components/ui/ToastProvider';

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

export function VideoReferenceNode({ id, data }: NodeProps<Node<VideoNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const edges = useEdges();
  const [preview, setPreview] = useState<string | undefined>(data.video);
  const { show } = useToast();

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
      };
      reader.readAsDataURL(file);
    }
  }, [id, updateNodeData]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
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

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
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
  }, [fileToDataUrl, id, updateNodeData, show]);

  return (
    <TooltipProvider>
      <div className="relative group w-48 h-48" onDragOver={handleDragOver} onDrop={handleDrop}>
      <Card className="w-full h-full border border-slate-200 shadow-sm overflow-hidden p-0 relative">
        <div className="absolute inset-0">
            <label
              htmlFor={`video-file-${id}`}
              className="cursor-pointer flex items-center justify-center w-full h-full hover:bg-slate-50 transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
                {preview ? (
                    <>
                        <video
                          src={preview}
                          className="h-full w-full object-cover"
                          muted
                          loop
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => e.currentTarget.pause()}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            <UploadIcon className="w-6 h-6 text-white" />
                            <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">Replace</span>
                        </div>
                    </>
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
        </div>

        {data.fileName && (
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-white/90 backdrop-blur border-t text-[9px] text-slate-600 truncate">
                {data.fileName}
            </div>
        )}
      </Card>

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
