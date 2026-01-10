import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, useEdges } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { BaseNodeData } from '../types';
import { VideoIcon, UploadIcon } from '@radix-ui/react-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

import { cn } from '@/lib/utils';

export function VideoReferenceNode({ id, data }: NodeProps<Node<VideoNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const edges = useEdges();
  const [preview, setPreview] = useState<string | undefined>(data.video);

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

  return (
    <TooltipProvider>
      <div className="relative group w-48 h-48">
      <Card className="w-full h-full border border-slate-200 shadow-sm overflow-hidden p-0 relative">
        <div className="absolute inset-0">
            <label htmlFor={`video-file-${id}`} className="cursor-pointer flex items-center justify-center w-full h-full hover:bg-slate-50 transition-colors">
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
            className="!bg-pink-500 !w-4 !h-4 !border-2 !border-white shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
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