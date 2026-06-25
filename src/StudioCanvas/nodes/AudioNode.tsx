import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer } from '@xyflow/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { AudioNodeData } from '../types';
import { LinkBreak2Icon, PauseIcon, PlayIcon, SpeakerLoudIcon } from '@radix-ui/react-icons';
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
import { useNodeSelection } from '../contexts/PresenceContext';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Copy, Trash2 } from 'lucide-react';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export function AudioNode({ id, data, selected }: NodeProps<ReactFlowNode<AudioNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const detachNodeConnections = useStudioStore((state) => state.detachNodeConnections);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);
  const edges = useEdges();
  const [audioSrc, setAudioSrc] = useState<string | undefined>(data.audio);
  const { show } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

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
    triggerSave();
  }, [fileToDataUrl, id, triggerSave, updateNodeData, show]);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div 
        className={cn(
          "relative group w-full h-full min-w-[180px] min-h-[100px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
      >
      <NodeResizer
        minWidth={160}
        minHeight={100}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
      >
        <NodeContent className="relative flex-1 min-h-0 p-0 bg-muted/30">
            <Label
              htmlFor={`file-${id}`}
              className="cursor-pointer flex h-full w-full items-center justify-center transition-colors hover:bg-muted/40"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
                {audioSrc ? (
                    <div className="flex h-full w-full items-center justify-center p-4">
                        <audio
                          ref={audioRef}
                          src={audioSrc}
                          onEnded={handleEnded}
                          className="hidden"
                        />

                        <div className="nodrag flex w-full max-w-[220px] items-center gap-3 rounded-md border border-border/70 bg-background/90 px-3 py-2 shadow-sm">
                          <button
                            onClick={togglePlay}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
                            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                          >
                            {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
                          </button>

                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-xs font-medium text-foreground">{data.fileName || "Audio File"}</p>
                            <p className="text-2xs text-muted-foreground">{isPlaying ? 'Playing…' : 'Click to play'}</p>
                          </div>

                          <div className="rounded-sm bg-emerald-500/10 p-1.5 text-emerald-600">
                            <SpeakerLoudIcon className="h-4 w-4" />
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
        </NodeContent>
      </CanvasNode>
      
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
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>Audio Reference</ContextMenuLabel>
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
            <LinkBreak2Icon className="mr-2 h-4 w-4" />
            Detach connections
          </ContextMenuItem>
          <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteNode(id)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
  );
}
