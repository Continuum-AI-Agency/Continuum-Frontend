import React, { useCallback } from 'react';
import { Handle, Position, NodeProps, Node as ReactFlowNode, NodeResizer } from '@xyflow/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { DocumentNodeData } from '../types';
import { FileTextIcon, UploadIcon, Cross2Icon } from '@radix-ui/react-icons';
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

export function DocumentNode({ id, data, selected }: NodeProps<ReactFlowNode<DocumentNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const edges = useEdges();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  
  const documents = data.documents || [];

  const docConnections = edges.filter(edge => edge.source === id && edge.sourceHandle === 'document').length;

  const fileToDataUrl = useCallback((file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  }), []);

  const addDocuments = useCallback((newDocs: Array<{name: string, content: string, type: 'pdf' | 'txt'}>) => {
    const currentDocs = data.documents || [];
    updateNodeData(id, { documents: [...currentDocs, ...newDocs] });
    triggerSave();
  }, [data.documents, id, triggerSave, updateNodeData]);

  const removeDocument = useCallback((index: number) => {
    const currentDocs = data.documents || [];
    const newDocs = [...currentDocs];
    newDocs.splice(index, 1);
    updateNodeData(id, { documents: newDocs });
    triggerSave();
  }, [data.documents, id, triggerSave, updateNodeData]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newDocs: Array<{name: string, content: string, type: 'pdf' | 'txt'}> = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const content = await fileToDataUrl(file);
          const type = file.type === 'application/pdf' ? 'pdf' : 'txt';
          newDocs.push({ name: file.name, content, type });
        } catch (error) {
          console.error("Failed to read file", file.name, error);
        }
      }
      
      if (newDocs.length > 0) {
        addDocuments(newDocs);
      }
    }
  }, [addDocuments, fileToDataUrl]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const newDocs: Array<{name: string, content: string, type: 'pdf' | 'txt'}> = [];
      let rejectedCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('text/') && file.type !== 'application/pdf') {
          rejectedCount++;
          continue;
        }
        
        try {
          const content = await fileToDataUrl(file);
          const type = file.type === 'application/pdf' ? 'pdf' : 'txt';
          newDocs.push({ name: file.name, content, type });
        } catch (error) {
          console.error("Failed to read file", file.name, error);
        }
      }

      if (rejectedCount > 0) {
        show({
          title: 'Some files ignored',
          description: `${rejectedCount} file(s) were not text or PDF.`,
          variant: 'warning',
        });
      }

      if (newDocs.length > 0) {
        addDocuments(newDocs);
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

    if (resolved.nodeType !== 'document') {
      show({
        title: 'Unsupported asset',
        description: 'Only document assets can be dropped here.',
        variant: 'warning',
      });
      return;
    }

    addDocuments([{ 
        name: resolved.fileName || 'Document', 
        content: resolved.dataUrl, 
        type: resolved.mimeType === 'application/pdf' ? 'pdf' : 'txt' 
    }]);

  }, [fileToDataUrl, addDocuments, show]);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
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
        minWidth={180}
        minHeight={180}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
      />
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
      >
        <NodeContent className="relative flex-1 min-h-0 p-0 flex flex-col bg-muted/30 group/preview">
            <Label
              htmlFor={`doc-upload-${id}`}
              className="absolute right-2 top-2 z-20 cursor-pointer rounded bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/preview:opacity-100"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <UploadIcon className="w-3 h-3" />
            </Label>
            {documents.length > 0 ? (
                <div className="flex-1 space-y-2 overflow-y-auto p-2 nodrag">
                    {documents.map((doc, index) => (
                        <div key={index} className="group/item flex items-center gap-2 rounded-md border border-border/70 bg-background/90 p-2 shadow-sm">
                            <div className="rounded bg-amber-500/10 p-1.5 text-amber-600">
                                <FileTextIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="truncate text-xs font-medium text-foreground">{doc.name}</p>
                                <p className="text-[9px] uppercase text-muted-foreground">{doc.type}</p>
                            </div>
                            <button 
                                onClick={() => removeDocument(index)}
                                className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
                            >
                                <Cross2Icon className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                    <Label
                        htmlFor={`doc-upload-${id}`}
                        className="cursor-pointer flex h-full w-full flex-col items-center justify-center transition-opacity hover:opacity-80"
                    >
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <FileTextIcon />
                                </EmptyMedia>
                                <EmptyTitle>No Documents</EmptyTitle>
                                <EmptyDescription>Drag & drop text/PDF</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </Label>
                </div>
            )}
            
            <Input 
                id={`doc-upload-${id}`} 
                type="file" 
                accept=".txt,.pdf" 
                multiple
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
            id="document"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-document, #f59e0b)' }}
            className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Document Output: {docConnections} connections</p>
        </TooltipContent>
      </Tooltip>
    </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>Document Context</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
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
