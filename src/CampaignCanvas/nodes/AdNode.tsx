"use client";
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { type AdData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent,
  NodeDescription 
} from '@/components/ai-elements/node';
import { CheckCircle2, AlertCircle, XCircle, Megaphone, Edit, Copy, Trash2, Plus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSeparator,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { useCampaignStore } from '../stores/useCampaignStore';
import { EditableLabel } from '../components/EditableLabel';
import { cn } from '@/lib/utils';

import { Separator } from '@/components/ui/separator';

const AD_FORMATS = [
  { value: 'IMAGE', label: 'Single Image' },
  { value: 'VIDEO', label: 'Single Video' },
  { value: 'CAROUSEL', label: 'Carousel' },
  { value: 'COLLECTION', label: 'Collection' },
];

export const AdNode = memo(({ id, data, selected }: NodeProps<AdData>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleHeadlineSave = useCallback((headline: string) => {
    updateNodeData(id, { headline });
  }, [id, updateNodeData]);

  const handleFormatChange = useCallback((adFormat: string) => {
    updateNodeData(id, { adFormat } as any);
  }, [id, updateNodeData]);

  const handleAddCreative = useCallback(() => {
    addConnectedNode(id, 'creative');
  }, [id, addConnectedNode]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node 
          handles={{ target: true, source: true }}
          selected={selected}
          className={cn(
            "hover:shadow-md transition-shadow cursor-pointer",
            data.validationStatus === 'error' && "border-destructive"
          )}
        >
          <NodeHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-500">
                  <Megaphone className="h-4 w-4" />
                </div>
                <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Ad
                </NodeTitle>
              </div>
              <div className="flex items-center gap-1">
                {data.validationStatus === 'valid' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {data.validationStatus === 'warning' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                {data.validationStatus === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
              </div>
            </div>
          </NodeHeader>

          <NodeContent className="space-y-1">
            <h3 className="font-semibold text-foreground leading-tight">
              <EditableLabel value={data.label} onSave={handleLabelSave} />
            </h3>
            <Separator className="my-1.5 opacity-50" />
            <div className="text-xs font-medium text-foreground italic">
              <EditableLabel 
                value={data.headline || 'Add compelling headline...'} 
                onSave={handleHeadlineSave}
                className="cursor-text"
              />
            </div>
            <NodeDescription className="text-[10px] text-muted-foreground uppercase tracking-tight">
              {AD_FORMATS.find(f => f.value === data.adFormat)?.label || 'SINGLE IMAGE'}
            </NodeDescription>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Ad Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddCreative}>
            <Plus className="mr-2 h-4 w-4 text-pink-500" />
            Add Creative
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Megaphone className="mr-2 h-4 w-4" />
              Ad Format
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {AD_FORMATS.map((format) => (
                <ContextMenuCheckboxItem
                  key={format.value}
                  checked={data.adFormat === format.value || (!data.adFormat && format.value === 'IMAGE')}
                  onClick={() => handleFormatChange(format.value)}
                >
                  {format.label}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
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

AdNode.displayName = 'AdNode';
