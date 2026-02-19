"use client";
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { type CreativeData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent 
} from '@/components/ai-elements/node';
import { Image as ImageIcon, Copy, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useCampaignStore } from '../stores/useCampaignStore';
import { EditableLabel } from '../components/EditableLabel';

import { Separator } from '@/components/ui/separator';

export const CreativeNode = memo(({ id, data, selected }: NodeProps<CreativeData>) => {
  const { duplicateNode, removeNode, updateNodeData } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleTypeChange = useCallback((assetType: 'image' | 'video') => {
    updateNodeData(id, { assetType });
  }, [id, updateNodeData]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node 
          handles={{ target: true, source: false }}
          selected={selected}
          className="hover:shadow-md transition-shadow cursor-pointer"
        >
          <NodeHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-pink-500/10 p-1.5 text-pink-500">
                <ImageIcon className="h-4 w-4" />
              </div>
              <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Creative
              </NodeTitle>
            </div>
          </NodeHeader>

          <NodeContent className="flex flex-col items-center gap-2">
            <h3 className="w-full font-semibold text-foreground text-sm truncate">
              <EditableLabel value={data.label} onSave={handleLabelSave} />
            </h3>
            <Separator className="my-1 opacity-50" />
            <div className="relative group w-full">
              {data.thumbnailUrl ? (
                <img src={data.thumbnailUrl} className="aspect-square w-full rounded-md object-cover" alt="Creative Preview" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <ImageIcon className="h-8 w-8 opacity-20" />
                </div>
              )}
              <Badge variant="secondary" className="absolute bottom-1 right-1 text-[8px] px-1 py-0 opacity-80">
                {data.assetType?.toUpperCase() || 'IMAGE'}
              </Badge>
            </div>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Creative Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ImageIcon className="mr-2 h-4 w-4" />
              Asset Type
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuCheckboxItem 
                checked={data.assetType === 'image' || !data.assetType} 
                onClick={() => handleTypeChange('image')}
              >
                Image
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem 
                checked={data.assetType === 'video'} 
                onClick={() => handleTypeChange('video')}
              >
                Video
              </ContextMenuCheckboxItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

CreativeNode.displayName = 'CreativeNode';
