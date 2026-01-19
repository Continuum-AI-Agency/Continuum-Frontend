import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { AudioNodeData } from '../types';
import { SpeakerLoudIcon, UploadIcon, PlayIcon, PauseIcon } from '@radix-ui/react-icons';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { useToast } from '@/components/ui/ToastProvider';
import { cn } from '@/lib/utils';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEdges } from '@xyflow/react';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export function AudioNode({ id, data, selected }: NodeProps<Node<AudioNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const edges = useEdges();
  const [audioSrc, setAudioSrc] = useState<string | undefined>(data.audio);
  const { show } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioConnections = edges.filter(edge => edge.source === id && edge.sourceHandle === 'audio').length;

  useEffect(() => {
    if (data.audio) {
      setAudioSrc(data.audio);
    }
  }, [data.audio]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setAudioSrc(result);
        updateNodeData(id, { audio: result, fileName: file.name });
      };
      reader.readAsDataURL(file);
    }
  }, [id, updateNodeData]);

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
      if (!file.type.startsWith('audio/')) {
        show({
          title: 'Unsupported asset',
          description: 'Only audio files can be dropped here.',
          variant: 'warning',
        });
        return;
      }
      try {
        const result = await fileToDataUrl(file);
        setAudioSrc(result);
        updateNodeData(id, { audio: result, fileName: file.name });
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

    if (resolved.nodeType !== 'audio') {
      show({
        title: 'Unsupported asset',
        description: 'Only audio assets can be dropped here.',
        variant: 'warning',
      });
      return;
    }

    setAudioSrc(resolved.dataUrl);
    updateNodeData(id, { audio: resolved.dataUrl, fileName: resolved.fileName });
  }, [fileToDataUrl, id, updateNodeData, show]);

  return (
    <TooltipProvider>
      <div className="relative group w-full h-full min-w-[180px] min-h-[100px]" onDragOver={handleDragOver} onDrop={handleDrop}>
      <NodeResizer
        minWidth={160}
        minHeight={100}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />
      <Card className="w-full h-full border border-subtle bg-surface shadow-sm overflow-hidden p-0 relative flex flex-col">
        <div className="flex items-center justify-between px-3 py-1 border-b border-subtle text-[10px] font-semibold uppercase tracking-widest text-secondary bg-default/70 cursor-grab">
          <span>Audio Input</span>
        </div>
        <div className="relative flex-1 min-h-0 nodrag flex flex-col items-center justify-center p-4 bg-slate-50/50 dark:bg-slate-900/50">
            <Label
              htmlFor={`file-${id}`}
              className="cursor-pointer flex flex-col items-center justify-center w-full h-full hover:bg-default/60 transition-colors rounded-md"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
                {audioSrc ? (
                    <div className="flex flex-col items-center gap-3 w-full">
                        <audio 
                          ref={audioRef} 
                          src={audioSrc} 
                          onEnded={handleEnded}
                          className="hidden" 
                        />
                        
                        <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center border-2 border-indigo-200 dark:border-indigo-800">
                          <button 
                            onClick={togglePlay}
                            className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center text-white transition-all shadow-md active:scale-95"
                          >
                            {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6 ml-0.5" />}
                          </button>
                        </div>
                        
                        <div className="text-center w-full px-2">
                          <p className="text-xs font-medium truncate max-w-full text-slate-700 dark:text-slate-300">
                            {data.fileName || "Audio File"}
                          </p>
                          <p className="text-[10px] text-slate-500">Click to play/pause</p>
                        </div>

                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-background/80 backdrop-blur p-1.5 rounded-md shadow-sm border border-border cursor-pointer hover:bg-accent">
                                <UploadIcon className="w-4 h-4 text-muted-foreground" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <SpeakerLoudIcon />
                        </EmptyMedia>
                        <EmptyTitle>Upload Audio</EmptyTitle>
                        <EmptyDescription>Drag & drop or click</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                )}
            </Label>
            <Input 
                id={`file-${id}`} 
                type="file" 
                accept="audio/*" 
                className="hidden" 
                onChange={handleFileUpload}
            />
        </div>
      </Card>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Handle
            type="source"
            position={Position.Right}
            id="audio"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-audio, #10b981)' }}
            className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Audio Output: {audioConnections} connections</p>
        </TooltipContent>
      </Tooltip>
    </div>
    </TooltipProvider>
  );
}
