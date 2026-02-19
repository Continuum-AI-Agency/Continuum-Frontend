import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer } from '@xyflow/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { ImageNodeData, ImageReferenceType } from '../types';
import { ImageIcon, UploadIcon } from '@radix-ui/react-icons';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { useToast } from '@/components/ui/ToastProvider';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEdges } from '@xyflow/react';
import { useNodeSelection } from '../contexts/PresenceContext';
import { cn } from '@/lib/utils';
import { Node as CanvasNode, NodeContent, NodeHeader } from '@/components/ai-elements/node';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export function ImageNode({ id, data, selected }: NodeProps<ReactFlowNode<ImageNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const edges = useEdges();
  const [preview, setPreview] = useState<string | undefined>(data.image);
  const [refType, setRefType] = useState<string>(data.referenceType || 'default');
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  const handleRefTypeChange = useCallback((value: string) => {
    setRefType(value);
    updateNodeData(id, { referenceType: value as ImageReferenceType });
    triggerSave();
  }, [id, updateNodeData, triggerSave]);

  const imageConnections = edges.filter(edge => edge.source === id && edge.sourceHandle === 'image').length;

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        updateNodeData(id, { image: result, fileName: file.name });
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
      if (!file.type.startsWith('image/')) {
        show({
          title: 'Unsupported asset',
          description: 'Only image files can be dropped here.',
          variant: 'warning',
        });
        return;
      }
      try {
        const result = await fileToDataUrl(file);
        setPreview(result);
        updateNodeData(id, { image: result, fileName: file.name });
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

    if (resolved.nodeType !== 'image') {
      show({
        title: 'Unsupported asset',
        description: 'Only image assets can be dropped here.',
        variant: 'warning',
      });
      return;
    }

    setPreview(resolved.dataUrl);
    updateNodeData(id, { image: resolved.dataUrl, fileName: resolved.fileName });
    triggerSave();
  }, [fileToDataUrl, id, updateNodeData, show, triggerSave]);

  return (
    <TooltipProvider>
      <div 
        className={cn(
          "relative group w-full h-full min-w-[200px] min-h-[200px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
      >
      <NodeResizer
        minWidth={200}
        minHeight={200}
        keepAspectRatio={false}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
      >
        <NodeHeader className="!h-7 !px-2 !py-1 cursor-grab items-center justify-between gap-0 rounded-none bg-muted/60 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <span>Image Reference</span>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <Select value={refType} onValueChange={handleRefTypeChange}>
                <SelectTrigger className="h-5 w-[85px] text-[9px] px-1 py-0 border-none bg-transparent hover:bg-black/5 dark:hover:bg-white/5 focus:ring-0 shadow-none text-right">
                <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="color">Color/Theme</SelectItem>
                <SelectItem value="person">Person</SelectItem>
                </SelectContent>
            </Select>
          </div>
        </NodeHeader>
        <NodeContent className="relative flex-1 min-h-0 p-0 nodrag bg-muted/30">
            <Label
              htmlFor={`file-${id}`}
              className="cursor-pointer flex h-full w-full items-center justify-center transition-colors hover:bg-muted/40"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
                {preview ? (
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-default">
                      <img src={preview} alt="Preview" className="h-full w-full object-contain" />
                      <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <UploadIcon className="mr-1 inline-block h-3 w-3" />
                        Replace
                      </div>
                    </div>
                ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <ImageIcon />
                        </EmptyMedia>
                        <EmptyTitle>Upload Image</EmptyTitle>
                        <EmptyDescription>Drag & drop or click</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                )}
            </Label>
            <Input 
                id={`file-${id}`} 
                type="file" 
                accept="image/*" 
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
            id="image"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-image)' }}
            className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Image Output: {imageConnections} connections</p>
        </TooltipContent>
      </Tooltip>
    </div>
    </TooltipProvider>
  );
}
