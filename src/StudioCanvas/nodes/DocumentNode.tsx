import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer } from '@xyflow/react';
import { Card } from '@/components/ui/card';
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

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export function DocumentNode({ id, data, selected }: NodeProps<Node<DocumentNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
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
  }, [data.documents, id, updateNodeData]);

  const removeDocument = useCallback((index: number) => {
    const currentDocs = data.documents || [];
    const newDocs = [...currentDocs];
    newDocs.splice(index, 1);
    updateNodeData(id, { documents: newDocs });
  }, [data.documents, id, updateNodeData]);

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
      <div 
        className={cn(
          "relative group w-full h-full min-w-[200px] min-h-[200px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ 
          ['--other-user-color' as any]: selectingUser?.color 
        }}
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
      <Card className="w-full h-full border border-subtle bg-surface shadow-sm overflow-hidden p-0 relative flex flex-col">
        <div className="flex items-center justify-between px-3 py-1 border-b border-subtle text-[10px] font-semibold uppercase tracking-widest text-secondary bg-default/70 cursor-grab">
          <span>Documents ({documents.length})</span>
          <Label htmlFor={`doc-upload-${id}`} className="cursor-pointer hover:text-primary transition-colors">
            <UploadIcon className="w-3 h-3" />
          </Label>
        </div>
        
        <div className="relative flex-1 min-h-0 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
            {documents.length > 0 ? (
                <div className="flex-1 overflow-y-auto p-2 space-y-2 nodrag">
                    {documents.map((doc, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded border border-border shadow-sm group/item">
                            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400">
                                <FileTextIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{doc.name}</p>
                                <p className="text-[9px] text-muted-foreground uppercase">{doc.type}</p>
                            </div>
                            <button 
                                onClick={() => removeDocument(index)}
                                className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
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
                        className="cursor-pointer flex flex-col items-center justify-center w-full h-full hover:opacity-70 transition-opacity"
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
        </div>
      </Card>
      
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
    </TooltipProvider>
  );
}
