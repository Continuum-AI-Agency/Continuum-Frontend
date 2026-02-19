"use client";
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { type AudienceData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent,
  NodeDescription 
} from '@/components/ai-elements/node';
import { Users, CheckCircle2, AlertCircle, XCircle, Copy, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { useCampaignStore } from '../stores/useCampaignStore';
import { EditableLabel } from '../components/EditableLabel';
import { cn } from '@/lib/utils';

import { Separator } from '@/components/ui/separator';

export const AudienceNode = memo(({ id, data, selected }: NodeProps<AudienceData>) => {
  const { duplicateNode, removeNode, updateNodeData } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleGenderToggle = useCallback((gender: number) => {
    const currentGenders = data.genders || [];
    const nextGenders = currentGenders.includes(gender)
      ? currentGenders.filter(g => g !== gender)
      : [...currentGenders, gender];
    updateNodeData(id, { genders: nextGenders });
  }, [id, data.genders, updateNodeData]);

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
              <div className="rounded-md bg-orange-500/10 p-1.5 text-orange-500">
                <Users className="h-4 w-4" />
              </div>
              <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Audience
              </NodeTitle>
            </div>
          </NodeHeader>

          <NodeContent className="space-y-1">
            <h3 className="font-semibold text-foreground leading-tight">
              <EditableLabel value={data.label} onSave={handleLabelSave} />
            </h3>
            <Separator className="my-1.5 opacity-50" />
            <NodeDescription className="text-xs text-muted-foreground">
              {data.genders?.length === 1 
                ? (data.genders[0] === 1 ? 'Men' : 'Women') 
                : 'All Genders'}
            </NodeDescription>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Users className="mr-2 h-4 w-4" />
            Genders
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuCheckboxItem 
              checked={data.genders?.includes(1)} 
              onClick={() => handleGenderToggle(1)}
            >
              Men
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem 
              checked={data.genders?.includes(2)} 
              onClick={() => handleGenderToggle(2)}
            >
              Women
            </ContextMenuCheckboxItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={handleDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AudienceNode.displayName = 'AudienceNode';
